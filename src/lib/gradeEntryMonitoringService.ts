// Fase 2C.1 — GradeEntryMonitoringService: acompanhamento AGREGADO, por
// escola+turma+ano letivo+bimestre, do preenchimento de notas que a escola
// já faz no SIGE Escola. A parte pura (validação + montagem do payload)
// fica em funções exportadas sem nenhuma chamada ao Firestore, testável sem
// emulador — mesmo padrão de schoolFlowService.ts. Nunca lê nem grava
// student_rosters/student_bimester_grades/grades (seção 12 do plano).
import { collection, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre, GradeEntryMonitoring, GradeEntryMonitoringStatus } from '../types/gradeEntryMonitoring';
import { buildGradeEntryMonitoringId } from './deterministicIds';
import { type GradeEntryCounts } from './gradeEntryMonitoringCalculations';
import { isNonNegativeInteger } from './enrollmentCalculations';
import { queueAuditLog } from './auditService';

const COLLECTION = 'grade_entry_monitoring';
const MAX_OBSERVATION_LENGTH = 500;
const MAX_SOURCE_REPORT_TITLE_LENGTH = 200;
const MAX_SOURCE_FILE_NAME_LENGTH = 200;
const MAX_SOURCE_FILE_HASH_LENGTH = 200;
const REFERENCE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class GradeEntryMonitoringValidationError extends Error {}

// Data real do calendário (não só o formato) — rejeita "2026-02-30" mesmo
// batendo o regex, do mesmo jeito que parseMonthFromIsoDate em
// schoolSituationCalculations.ts confia só nos componentes numéricos, nunca
// no parsing solto de `new Date(string)` (que aceita formatos ambíguos).
function isValidReferenceDate(value: string): boolean {
  const match = REFERENCE_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export interface SaveGradeEntryMonitoringInput extends GradeEntryCounts {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  status: GradeEntryMonitoringStatus;
  // undefined: campo não fornecido por este chamador — preserva o valor
  // existente (o mesmo formulário de relatório pode reenviar só os totais
  // sem repetir título/arquivo/observação). null: remoção EXPLÍCITA — usado
  // pelo formulário sempre que o campo é enviado vazio, para nunca deixar
  // `undefined` ambíguo entre "não mencionado" e "apagado de propósito"
  // (revisão do code review do PR #17, seção 6 — mesmo cuidado já aplicado
  // a `observation`, e o mesmo padrão de studentBimesterGradeService.ts).
  sourceReportTitle?: string | null;
  sourceFileName?: string | null;
  sourceFileHash?: string | null;
  referenceDate: string;
  observation?: string | null;
  actingUserEmail: string;
  now: string;
}

// Lança GradeEntryMonitoringValidationError na primeira violação encontrada
// — chamada sempre antes de montar o payload. Não valida schoolId/turmaId
// contra a escola/turma canônica nem contra o ano letivo da turma (mesmo
// padrão de validateSchoolFlowResultInput): essa verificação é
// responsabilidade de firestore.rules (isCanonicalTurmaOfSchoolYear), não
// desta camada pura.
export function validateGradeEntryMonitoringInput(input: SaveGradeEntryMonitoringInput): void {
  if (!Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2100) {
    throw new GradeEntryMonitoringValidationError('Ano letivo inválido — use um ano entre 2000 e 2100.');
  }
  if (![1, 2, 3, 4].includes(input.bimestre)) {
    throw new GradeEntryMonitoringValidationError('Bimestre inválido — use um valor entre 1 e 4.');
  }
  const counts: (keyof GradeEntryCounts)[] = [
    'totalStudents',
    'studentsWithCompleteGrades',
    'studentsWithPartialGrades',
    'studentsWithoutGrades',
    'expectedGradeEntries',
    'completedGradeEntries',
  ];
  for (const field of counts) {
    if (!isNonNegativeInteger(input[field])) {
      throw new GradeEntryMonitoringValidationError(
        'Todos os totais devem ser números inteiros maiores ou iguais a zero.'
      );
    }
  }
  if (input.completedGradeEntries > input.expectedGradeEntries) {
    throw new GradeEntryMonitoringValidationError(
      'Lançamentos realizados não podem ser maiores que os lançamentos esperados.'
    );
  }
  const studentsSum = input.studentsWithCompleteGrades + input.studentsWithPartialGrades + input.studentsWithoutGrades;
  if (studentsSum !== input.totalStudents) {
    throw new GradeEntryMonitoringValidationError(
      'A soma de estudantes com notas completas, parciais e sem notas precisa ser igual ao total de estudantes.'
    );
  }
  if (!isValidReferenceDate(input.referenceDate)) {
    throw new GradeEntryMonitoringValidationError('Data de referência inválida — use o formato AAAA-MM-DD.');
  }
  // != null exclui tanto undefined (não mencionado) quanto null (remoção
  // explícita) — só uma string realmente enviada é validada quanto ao
  // tamanho (revisão do code review do PR #17, seção 6).
  if (input.observation != null && input.observation.length > MAX_OBSERVATION_LENGTH) {
    throw new GradeEntryMonitoringValidationError(`Observação limitada a ${MAX_OBSERVATION_LENGTH} caracteres.`);
  }
  if (input.sourceReportTitle != null && input.sourceReportTitle.length > MAX_SOURCE_REPORT_TITLE_LENGTH) {
    throw new GradeEntryMonitoringValidationError(`Título do relatório limitado a ${MAX_SOURCE_REPORT_TITLE_LENGTH} caracteres.`);
  }
  if (input.sourceFileName != null && input.sourceFileName.length > MAX_SOURCE_FILE_NAME_LENGTH) {
    throw new GradeEntryMonitoringValidationError(`Nome do arquivo limitado a ${MAX_SOURCE_FILE_NAME_LENGTH} caracteres.`);
  }
  if (input.sourceFileHash != null && input.sourceFileHash.length > MAX_SOURCE_FILE_HASH_LENGTH) {
    throw new GradeEntryMonitoringValidationError(`Hash do arquivo limitado a ${MAX_SOURCE_FILE_HASH_LENGTH} caracteres.`);
  }
}

// undefined: campo não mencionado nesta chamada — preserva o valor já
// existente. null: remoção EXPLÍCITA — vira undefined aqui, que o spread do
// payload (buildGradeEntryMonitoringPayload) já omite por completo — nunca
// `campo: null` gravado no Firestore (o SDK aceita `null`, mas o schema
// desta coleção trata o campo como opcional/ausente, nunca nulo), e nunca o
// valor antigo "voltando" quando o formulário limpa o campo (mesmo cuidado
// de studentBimesterGradeService.ts, revisão do code review do PR #17,
// seção 6, estendida de `observation` para os três metadados de origem).
function resolveNullableField(
  provided: string | null | undefined,
  existingValue: string | undefined
): string | undefined {
  if (provided === undefined) return existingValue;
  return provided === null ? undefined : provided;
}

// Núcleo puro: monta o documento exato que será gravado. Não toca
// Firestore. Metadados de origem ausentes na chamada atual preservam o
// valor já existente (o mesmo formulário de relatório pode reenviar só os
// totais sem repetir título/arquivo) — nunca `campo: undefined` (o SDK do
// Firestore rejeita isso em setDoc/batch.set).
export function buildGradeEntryMonitoringPayload(
  input: SaveGradeEntryMonitoringInput,
  existing?: GradeEntryMonitoring
): GradeEntryMonitoring {
  validateGradeEntryMonitoringInput(input);

  const observation = resolveNullableField(input.observation, existing?.observation);
  const sourceReportTitle = resolveNullableField(input.sourceReportTitle, existing?.sourceReportTitle);
  const sourceFileName = resolveNullableField(input.sourceFileName, existing?.sourceFileName);
  const sourceFileHash = resolveNullableField(input.sourceFileHash, existing?.sourceFileHash);

  return {
    id: buildGradeEntryMonitoringId(input.schoolId, input.anoLetivo, input.bimestre, input.turmaId),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    turmaId: input.turmaId,
    turmaNome: input.turmaNome,
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    totalStudents: input.totalStudents,
    studentsWithCompleteGrades: input.studentsWithCompleteGrades,
    studentsWithPartialGrades: input.studentsWithPartialGrades,
    studentsWithoutGrades: input.studentsWithoutGrades,
    expectedGradeEntries: input.expectedGradeEntries,
    completedGradeEntries: input.completedGradeEntries,
    status: input.status,
    sourceSystem: 'SIGE Escola',
    referenceDate: input.referenceDate,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
    ...(observation !== undefined ? { observation } : {}),
    ...(sourceReportTitle !== undefined ? { sourceReportTitle } : {}),
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileHash !== undefined ? { sourceFileHash } : {}),
  };
}

// Consulta por schoolId+turmaId+anoLetivo+bimestre em vez de getDoc(ID
// determinístico) — mesmo padrão (e mesma razão) de getSchoolFlowResult em
// schoolFlowService.ts: getDoc direto num documento inexistente faz a regra
// de segurança avaliar resource.data contra null e sempre nega, mesmo com
// acesso legítimo.
export async function getGradeEntryMonitoring(
  schoolId: string,
  turmaId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<GradeEntryMonitoring | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('turmaId', '==', turmaId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre),
      limit(1)
    )
  );
  return snap.empty ? null : (snap.docs[0].data() as GradeEntryMonitoring);
}

// SEMPRE filtrada por schoolId (seção 8 do plano: "não consultar a coleção
// inteira") — usada tanto pela tabela de acompanhamento por turma (NotasView)
// quanto pela Sala de Situação.
export async function listGradeEntryMonitoringForSchool(
  schoolId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<GradeEntryMonitoring[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre)
    )
  );
  return snap.docs.map(d => d.data() as GradeEntryMonitoring);
}

// Grava o acompanhamento da turma informada. ID determinístico por
// escola+ano+bimestre+turma — nunca sobrescreve o acompanhamento de outra
// turma/bimestre/ano. Documento principal e audit_log (resumo agregado —
// nunca observação nem qualquer dado nominal, ver seção 8 do plano) no
// MESMO WriteBatch: ou os dois existem, ou nenhum existe.
export async function saveGradeEntryMonitoring(
  input: SaveGradeEntryMonitoringInput
): Promise<GradeEntryMonitoring> {
  const existing = await getGradeEntryMonitoring(input.schoolId, input.turmaId, input.anoLetivo, input.bimestre);
  const payload = buildGradeEntryMonitoringPayload(input, existing ?? undefined);

  const summary = (m: GradeEntryMonitoring) => ({
    action: existing ? 'update' : 'create',
    monitoringId: m.id,
    turmaId: m.turmaId,
    anoLetivo: m.anoLetivo,
    bimestre: m.bimestre,
    totalStudents: m.totalStudents,
    expectedGradeEntries: m.expectedGradeEntries,
    completedGradeEntries: m.completedGradeEntries,
    status: m.status,
  });

  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, payload.id), payload);
  queueAuditLog(batch, {
    collectionName: COLLECTION,
    documentId: payload.id,
    schoolId: payload.schoolId,
    codInep: payload.codInep,
    anoLetivo: payload.anoLetivo,
    operation: existing ? 'update' : 'create',
    previousValue: existing ? summary(existing) : null,
    newValue: summary(payload),
    source: 'Manual',
    userId: input.actingUserEmail,
    userEmail: input.actingUserEmail,
    now: input.now,
  });
  await batch.commit();

  return payload;
}
