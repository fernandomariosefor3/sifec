// Fase 2C — StudentRosterService: cadastro mínimo de estudante por
// turma+ano letivo (coleção `student_rosters`). A parte pura (validação +
// montagem do payload) fica em funções exportadas sem nenhuma chamada ao
// Firestore, testável sem emulador — as funções assíncronas no fim do
// arquivo só orquestram a leitura/escrita.
import { collection, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { StudentRosterEntry, StudentRosterSourceSystem } from '../types/studentRoster';
import { buildStudentRosterId } from './deterministicIds';
import { queueAuditLog } from './auditService';
import type { AuditOperation } from '../types/audit';

const COLLECTION = 'student_rosters';
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 150;

export class StudentRosterValidationError extends Error {}

export interface SaveStudentRosterEntryInput {
  studentKey: string;
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  studentName: string;
  active: boolean;
  sourceSystem?: StudentRosterSourceSystem;
  sourceStudentHash?: string;
  sourceFileHash?: string;
  importBatchId?: string;
  actingUserEmail: string;
  now: string;
}

// trim + colapso de espaços internos — só normalização de exibição, nunca
// decide se o nome é válido (isso é validateStudentRosterInput).
export function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

// Lança StudentRosterValidationError na primeira violação encontrada —
// chamado sempre antes de montar o payload, nunca depois. Não valida
// escola/turma canônica nem existência da turma (mesmo padrão das outras
// fases): essa verificação é responsabilidade de firestore.rules
// (isCanonicalSchoolMatch/isCanonicalTurmaOfSchool), não desta camada pura.
export function validateStudentRosterInput(input: SaveStudentRosterEntryInput): void {
  const name = normalizeStudentName(input.studentName);
  if (name.length < MIN_NAME_LENGTH || name.length > MAX_NAME_LENGTH) {
    throw new StudentRosterValidationError(
      `Nome do estudante deve ter entre ${MIN_NAME_LENGTH} e ${MAX_NAME_LENGTH} caracteres.`
    );
  }
  if (!Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2100) {
    throw new StudentRosterValidationError('Ano letivo inválido — use um ano entre 2000 e 2100.');
  }
  if (typeof input.active !== 'boolean') {
    throw new StudentRosterValidationError('O campo "active" deve ser verdadeiro ou falso.');
  }
}

// Núcleo puro: monta o documento exato que será gravado, dado o cadastro
// existente (se houver, para preservar createdAt/createdBy e metadados de
// origem não reenviados nesta chamada). Não toca Firestore. Campos
// opcionais ausentes são OMITIDOS por completo (nunca `campo: undefined` —
// mesmo cuidado de buildClassroomPayload/buildSchoolFlowResultPayload).
export function buildStudentRosterPayload(
  input: SaveStudentRosterEntryInput,
  existing?: StudentRosterEntry
): StudentRosterEntry {
  validateStudentRosterInput(input);
  const studentName = normalizeStudentName(input.studentName);

  const sourceSystem = input.sourceSystem !== undefined ? input.sourceSystem : existing?.sourceSystem;
  const sourceStudentHash = input.sourceStudentHash !== undefined ? input.sourceStudentHash : existing?.sourceStudentHash;
  const sourceFileHash = input.sourceFileHash !== undefined ? input.sourceFileHash : existing?.sourceFileHash;
  const importBatchId = input.importBatchId !== undefined ? input.importBatchId : existing?.importBatchId;

  return {
    id: buildStudentRosterId(input.schoolId, input.anoLetivo, input.turmaId, input.studentKey),
    studentKey: input.studentKey,
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    turmaId: input.turmaId,
    turmaNome: input.turmaNome,
    anoLetivo: input.anoLetivo,
    studentName,
    active: input.active,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
    ...(sourceSystem !== undefined ? { sourceSystem } : {}),
    ...(sourceStudentHash !== undefined ? { sourceStudentHash } : {}),
    ...(sourceFileHash !== undefined ? { sourceFileHash } : {}),
    ...(importBatchId !== undefined ? { importBatchId } : {}),
  };
}

// Consulta por schoolId+anoLetivo+turmaId+studentKey em vez de
// getDoc(id determinístico) — mesmo padrão já corrigido em
// getSchoolYear()/getEnrollmentSnapshot()/getSchoolFlowResult(): getDoc
// direto num documento que ainda não existe força a regra de segurança a
// avaliar resource.data contra um resource nulo, o que sempre falha como
// "Missing or insufficient permissions" mesmo com acesso legítimo.
export async function getStudentRosterEntry(
  schoolId: string,
  anoLetivo: number,
  turmaId: string,
  studentKey: string
): Promise<StudentRosterEntry | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('anoLetivo', '==', anoLetivo),
      where('turmaId', '==', turmaId),
      where('studentKey', '==', studentKey),
      limit(1)
    )
  );
  return snap.empty ? null : (snap.docs[0].data() as StudentRosterEntry);
}

// Lista o cadastro de uma escola inteira (todas as turmas) para um ano
// letivo — sempre filtrado por schoolId, nunca a coleção completa.
export async function listStudentRosterForSchool(
  schoolId: string,
  anoLetivo: number
): Promise<StudentRosterEntry[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  return snap.docs.map(d => d.data() as StudentRosterEntry);
}

// Lista o cadastro de uma turma específica.
export async function listStudentRosterForClass(
  schoolId: string,
  turmaId: string,
  anoLetivo: number
): Promise<StudentRosterEntry[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('turmaId', '==', turmaId),
      where('anoLetivo', '==', anoLetivo)
    )
  );
  return snap.docs.map(d => d.data() as StudentRosterEntry);
}

// Grava o cadastro (criação ou correção) e o audit_log correspondente no
// MESMO WriteBatch — ou os dois documentos existem, ou nenhum existe (ver
// auditService.ts, hotfix de atomicidade da Fase 2B). O resumo de
// auditoria nunca inclui studentName (seção 10 do plano): só
// {action, rosterId, turmaId, anoLetivo}.
export async function saveStudentRosterEntry(
  input: SaveStudentRosterEntryInput
): Promise<StudentRosterEntry> {
  const existing = await getStudentRosterEntry(input.schoolId, input.anoLetivo, input.turmaId, input.studentKey);
  const payload = buildStudentRosterPayload(input, existing ?? undefined);

  const action: 'create' | 'update' | 'deactivate' = !existing
    ? 'create'
    : (payload.active === false ? 'deactivate' : 'update');
  const operation: AuditOperation = !existing ? 'create' : (action === 'deactivate' ? 'archive' : 'update');

  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, payload.id), payload);
  queueAuditLog(batch, {
    collectionName: COLLECTION,
    documentId: payload.id,
    schoolId: payload.schoolId,
    codInep: payload.codInep,
    anoLetivo: payload.anoLetivo,
    operation,
    previousValue: null,
    newValue: { action, rosterId: payload.id, turmaId: payload.turmaId, anoLetivo: payload.anoLetivo },
    source: input.sourceSystem ?? 'Manual',
    userId: input.actingUserEmail,
    userEmail: input.actingUserEmail,
    now: input.now,
  });
  await batch.commit();

  return payload;
}

export interface SetStudentRosterActiveStateInput {
  schoolId: string;
  anoLetivo: number;
  turmaId: string;
  studentKey: string;
  actingUserEmail: string;
  now: string;
}

async function setStudentRosterActiveState(
  input: SetStudentRosterActiveStateInput,
  active: boolean
): Promise<StudentRosterEntry> {
  const existing = await getStudentRosterEntry(input.schoolId, input.anoLetivo, input.turmaId, input.studentKey);
  if (!existing) {
    throw new StudentRosterValidationError('Cadastro do estudante não encontrado.');
  }
  // Preserva o cadastro e as notas anteriores (seção 13 do plano) — só o
  // campo `active` muda; nome/escola/turma/ano permanecem exatamente como
  // estavam.
  return saveStudentRosterEntry({
    studentKey: existing.studentKey,
    schoolId: existing.schoolId,
    codInep: existing.codInep,
    escolaNome: existing.escolaNome,
    turmaId: existing.turmaId,
    turmaNome: existing.turmaNome,
    anoLetivo: existing.anoLetivo,
    studentName: existing.studentName,
    active,
    actingUserEmail: input.actingUserEmail,
    now: input.now,
  });
}

// Inativa o cadastro (seção 13 do plano): exclui o estudante dos
// indicadores correntes (consolidateStudentFill já filtra por `active`),
// mas preserva o cadastro e o histórico de notas — nunca oferece exclusão
// comum.
export function deactivateStudentRosterEntry(
  input: SetStudentRosterActiveStateInput
): Promise<StudentRosterEntry> {
  return setStudentRosterActiveState(input, false);
}

// Reativa um cadastro previamente inativado — contrapartida simétrica de
// deactivateStudentRosterEntry, oferecida pela mesma ação "Ativar/Inativar"
// da interface.
export function activateStudentRosterEntry(
  input: SetStudentRosterActiveStateInput
): Promise<StudentRosterEntry> {
  return setStudentRosterActiveState(input, true);
}
