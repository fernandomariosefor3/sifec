// Fase 2C — StudentBimesterGradeService: nota bimestral por estudante
// (coleção `student_bimester_grades`). A parte pura (validação + montagem
// do payload) fica em funções exportadas sem nenhuma chamada ao Firestore
// — as funções assíncronas no fim do arquivo só orquestram leitura/escrita
// e a checagem de vínculo com student_rosters.
import { collection, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre, BimesterScores, StudentBimesterGrade, StudentBimesterGradeSourceSystem } from '../types/studentBimesterGrade';
import { buildStudentBimesterGradeId, buildStudentRosterId } from './deterministicIds';
import { countFilledScores } from './studentGradeCalculations';
import { getStudentRosterEntry } from './studentRosterService';
import { queueAuditLog } from './auditService';

const COLLECTION = 'student_bimester_grades';
const MAX_OBSERVACAO_LENGTH = 500;
const VALID_BIMESTRES: readonly Bimestre[] = [1, 2, 3, 4];
const SCORE_KEYS: readonly (keyof BimesterScores)[] = [
  'linguaPortuguesa', 'matematica', 'cienciasNatureza', 'cienciasHumanas',
];

export class StudentBimesterGradeValidationError extends Error {}

export interface SaveStudentBimesterGradeInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  studentKey: string;
  bimestre: Bimestre;
  scores: BimesterScores;
  // undefined: campo não fornecido por este chamador — preserva o valor
  // existente (ex.: um futuro fluxo de importação que nunca toca
  // observacao). null: remoção EXPLÍCITA — usado pelo formulário sempre
  // que o campo é enviado vazio, para nunca deixar `undefined` ambíguo
  // entre "não mencionado" e "apagado de propósito" (revisão do PR #15).
  observacao?: string | null;
  sourceSystem?: StudentBimesterGradeSourceSystem;
  sourceReportTitle?: string;
  sourceFileName?: string;
  sourceFileHash?: string;
  importBatchId?: string;
  actingUserEmail: string;
  now: string;
}

// null é sempre válido (nota ainda não preenchida — vazio não é zero).
// Rejeita NaN, fora do intervalo [0, 10], string numérica (typeof !==
// 'number' já barra qualquer string, mesmo "7.5") e mais de duas casas
// decimais.
export function isValidBimesterScore(value: unknown): value is number | null {
  if (value === null) return true;
  if (typeof value !== 'number' || Number.isNaN(value)) return false;
  if (value < 0 || value > 10) return false;
  return Math.round(value * 100) / 100 === value;
}

// Lança StudentBimesterGradeValidationError na primeira violação
// encontrada. Não verifica existência/atividade do roster (isso é
// responsabilidade assíncrona de saveStudentBimesterGrade, que consulta o
// Firestore) — esta função é pura, só valida o SHAPE dos dados recebidos.
export function validateStudentBimesterGradeInput(input: SaveStudentBimesterGradeInput): void {
  if (!VALID_BIMESTRES.includes(input.bimestre)) {
    throw new StudentBimesterGradeValidationError('Bimestre inválido — use um valor entre 1 e 4.');
  }
  for (const key of SCORE_KEYS) {
    if (!isValidBimesterScore(input.scores[key])) {
      throw new StudentBimesterGradeValidationError(
        `Nota de "${key}" inválida — use um número entre 0 e 10, com até duas casas decimais, ou deixe em branco.`
      );
    }
  }
  if (input.observacao != null && input.observacao.length > MAX_OBSERVACAO_LENGTH) {
    throw new StudentBimesterGradeValidationError(`Observação limitada a ${MAX_OBSERVACAO_LENGTH} caracteres.`);
  }
}

// Núcleo puro: monta o documento exato a gravar, dado o registro existente
// (se houver, para preservar createdAt/createdBy e metadados de origem).
// rosterId é sempre DERIVADO de schoolId+anoLetivo+turmaId+studentKey
// (mesma função pura buildStudentRosterId usada por studentRosterService),
// nunca um campo solto que o chamador poderia divergir do vínculo real.
// Campos opcionais ausentes são omitidos por completo (nunca
// `campo: undefined`).
export function buildStudentBimesterGradePayload(
  input: SaveStudentBimesterGradeInput,
  existing?: StudentBimesterGrade
): StudentBimesterGrade {
  validateStudentBimesterGradeInput(input);
  const rosterId = buildStudentRosterId(input.schoolId, input.anoLetivo, input.turmaId, input.studentKey);

  // undefined preserva o valor existente; null remove explicitamente (vira
  // undefined aqui, que o spread abaixo já omite do payload por completo —
  // nunca `observacao: null` gravado no Firestore, e nunca o valor antigo
  // "voltando" quando o formulário limpa o campo).
  const observacao = input.observacao === undefined
    ? existing?.observacao
    : (input.observacao === null ? undefined : input.observacao);
  const sourceSystem = input.sourceSystem !== undefined ? input.sourceSystem : existing?.sourceSystem;
  const sourceReportTitle = input.sourceReportTitle !== undefined ? input.sourceReportTitle : existing?.sourceReportTitle;
  const sourceFileName = input.sourceFileName !== undefined ? input.sourceFileName : existing?.sourceFileName;
  const sourceFileHash = input.sourceFileHash !== undefined ? input.sourceFileHash : existing?.sourceFileHash;
  const importBatchId = input.importBatchId !== undefined ? input.importBatchId : existing?.importBatchId;

  return {
    id: buildStudentBimesterGradeId(rosterId, input.bimestre),
    rosterId,
    studentKey: input.studentKey,
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    turmaId: input.turmaId,
    turmaNome: input.turmaNome,
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    scores: { ...input.scores },
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
    ...(observacao !== undefined ? { observacao } : {}),
    ...(sourceSystem !== undefined ? { sourceSystem } : {}),
    ...(sourceReportTitle !== undefined ? { sourceReportTitle } : {}),
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileHash !== undefined ? { sourceFileHash } : {}),
    ...(importBatchId !== undefined ? { importBatchId } : {}),
  };
}

// Consulta por schoolId+rosterId+anoLetivo+bimestre em vez de
// getDoc(id determinístico) — mesmo padrão das outras fases: getDoc direto
// num documento que ainda não existe força a regra a avaliar resource.data
// contra um resource nulo, o que sempre falha como "Missing or
// insufficient permissions" mesmo com acesso legítimo.
export async function getStudentBimesterGrade(
  schoolId: string,
  rosterId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<StudentBimesterGrade | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('rosterId', '==', rosterId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre),
      limit(1)
    )
  );
  return snap.empty ? null : (snap.docs[0].data() as StudentBimesterGrade);
}

// Lista as notas de uma escola inteira num bimestre/ano — sempre filtrado
// por schoolId, nunca a coleção completa.
export async function listStudentBimesterGradesForSchool(
  schoolId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<StudentBimesterGrade[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre)
    )
  );
  return snap.docs.map(d => d.data() as StudentBimesterGrade);
}

// Lista as notas de uma turma específica num bimestre/ano.
export async function listStudentBimesterGradesForClass(
  schoolId: string,
  turmaId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<StudentBimesterGrade[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('turmaId', '==', turmaId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre)
    )
  );
  return snap.docs.map(d => d.data() as StudentBimesterGrade);
}

// Grava a nota (criação ou correção) e o audit_log correspondente no MESMO
// WriteBatch — ou os dois documentos existem, ou nenhum existe. Antes de
// montar o payload, confirma que o roster do estudante existe e está
// ativo (seção 8 do plano) — nunca registra nota para um cadastro
// inexistente ou inativo. O resumo de auditoria nunca inclui nome, valores
// de nota, média ou observação (seção 10 do plano): só
// {action, gradeId, rosterId, turmaId, anoLetivo, bimestre, fieldsFilled}.
export async function saveStudentBimesterGrade(
  input: SaveStudentBimesterGradeInput
): Promise<StudentBimesterGrade> {
  const roster = await getStudentRosterEntry(input.schoolId, input.anoLetivo, input.turmaId, input.studentKey);
  if (!roster) {
    throw new StudentBimesterGradeValidationError(
      'Cadastro do estudante não encontrado para esta escola, turma e ano letivo.'
    );
  }
  if (!roster.active) {
    throw new StudentBimesterGradeValidationError('Não é possível registrar notas para um estudante inativo.');
  }

  const existing = await getStudentBimesterGrade(input.schoolId, roster.id, input.anoLetivo, input.bimestre);
  const payload = buildStudentBimesterGradePayload(input, existing ?? undefined);

  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, payload.id), payload);
  queueAuditLog(batch, {
    collectionName: COLLECTION,
    documentId: payload.id,
    schoolId: payload.schoolId,
    codInep: payload.codInep,
    anoLetivo: payload.anoLetivo,
    operation: existing ? 'update' : 'create',
    previousValue: null,
    newValue: {
      action: existing ? 'update' : 'create',
      gradeId: payload.id,
      rosterId: payload.rosterId,
      turmaId: payload.turmaId,
      anoLetivo: payload.anoLetivo,
      bimestre: payload.bimestre,
      fieldsFilled: countFilledScores(payload.scores),
    },
    source: input.sourceSystem ?? 'Manual',
    userId: input.actingUserEmail,
    userEmail: input.actingUserEmail,
    now: input.now,
  });
  await batch.commit();

  return payload;
}
