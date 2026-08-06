// Reestruturação SIFEC — Farol do Estudante: núcleo puro (validação +
// montagem do payload) separado da orquestração assíncrona, mesmo padrão de
// gradeEntryMonitoringService.ts. Consulta sempre escopada por schoolId —
// nunca a coleção inteira (mesmo cuidado de listGradeEntryMonitoringForSchool).
import { collection, deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { queueAuditLog, type RecordAuditLogInput } from './auditService';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import {
  FAROL_ACERTO_LIMITE,
  FAROL_SOURCE_SYSTEM,
  FAROL_STATUS_ACOMPANHAMENTO,
  type FarolEstudanteItem,
  type FarolStatusAcompanhamento,
  type FarolStatusRegistro,
} from '../types/farolEstudante';

const COLLECTION = 'farol_estudante';

// YYYY-MM-DD — mesma checagem simples já usada para referenceDate em
// gradeEntryMonitoringDisciplineService.ts (nunca aceita um Date bruto, para
// nunca gravar um formato ambíguo de fuso horário). Correção do code review
// do PR #19: a checagem anterior só media o TAMANHO da string (10
// caracteres) — "2026-99-99" também tem 10 caracteres e passava. A regex
// agora restringe mês (01-12) e dia (01-31) a faixas válidas, mesma regra
// aplicada em firestore.rules.
const REFERENCE_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// A regex acima ainda aceita datas que não existem no calendário real (ex.:
// 2026-02-30, mês de 30 dias em fevereiro) — só a faixa numérica de dia é
// checada, nunca quantos dias o mês realmente tem. new Date(Date.UTC(...))
// "rola" datas inválidas para o mês seguinte em vez de rejeitá-las (ex.:
// 30/02 vira 02/03) — comparar os componentes de volta é o jeito confiável
// de detectar esse rollover sem depender de nenhuma biblioteca de datas.
function isValidCalendarDate(value: string): boolean {
  if (!REFERENCE_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export class FarolEstudanteValidationError extends Error {}

export interface SaveFarolEstudanteInput {
  id?: string; // presente = edição de um registro existente
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  anoLetivo: number;
  bimestre: Bimestre;
  estudanteNome: string;
  percentualAcerto: number;
  // Data do relatório do SISEDU Analytics transcrito (YYYY-MM-DD) — nunca a
  // data de hoje: precisa refletir quando o dado foi realmente extraído.
  referenceDate: string;
  status: FarolStatusAcompanhamento;
  observacao?: string;
  actingUserEmail: string;
  now: string;
}

export function validateFarolEstudanteInput(input: SaveFarolEstudanteInput): void {
  if (!input.estudanteNome.trim()) {
    throw new FarolEstudanteValidationError('Informe o nome do estudante.');
  }
  if (!input.turmaId.trim() || !input.turmaNome.trim()) {
    throw new FarolEstudanteValidationError('Selecione a turma do estudante.');
  }
  if (!input.disciplina.trim()) {
    throw new FarolEstudanteValidationError('Informe a disciplina.');
  }
  if (![1, 2, 3, 4].includes(input.bimestre)) {
    throw new FarolEstudanteValidationError('Bimestre inválido — use um valor entre 1 e 4.');
  }
  if (
    !Number.isInteger(input.percentualAcerto) ||
    input.percentualAcerto < 0 ||
    input.percentualAcerto >= FAROL_ACERTO_LIMITE
  ) {
    throw new FarolEstudanteValidationError(
      `O percentual de acerto deve ser um número inteiro entre 0 e ${FAROL_ACERTO_LIMITE - 1} — esta listagem é exclusiva para estudantes abaixo de ${FAROL_ACERTO_LIMITE}%.`
    );
  }
  if (!isValidCalendarDate(input.referenceDate)) {
    throw new FarolEstudanteValidationError('Informe uma data de referência válida do relatório do SISEDU Analytics (AAAA-MM-DD, dentro do calendário real).');
  }
  if (!FAROL_STATUS_ACOMPANHAMENTO.includes(input.status)) {
    throw new FarolEstudanteValidationError('Selecione um status de acompanhamento válido.');
  }
}

export function buildFarolEstudanteId(): string {
  return crypto.randomUUID();
}

// Correção do code review do PR #19, seção 3: a turma de um registro
// existente nunca pode mudar por edição — firestore.rules já bloqueia isso
// no update (turmaId/turmaNome travados), mas validar aqui também dá um erro
// claro na interface em vez de deixar a gravação falhar silenciosamente só
// no Firestore. Transferir um estudante para outra turma exige criar um
// novo registro e arquivar o anterior (ver archiveFarolEstudanteItem) —
// nunca mudar a identidade dentro do mesmo documento.
function assertTurmaImutavelNaEdicao(input: SaveFarolEstudanteInput, existing?: FarolEstudanteItem): void {
  if (!existing) return;
  if (existing.turmaId !== input.turmaId || existing.turmaNome !== input.turmaNome) {
    throw new FarolEstudanteValidationError(
      'Não é possível trocar a turma de um registro existente — arquive este registro e crie um novo na turma correta.'
    );
  }
}

export function buildFarolEstudantePayload(
  input: SaveFarolEstudanteInput,
  existing?: FarolEstudanteItem
): FarolEstudanteItem {
  validateFarolEstudanteInput(input);
  assertTurmaImutavelNaEdicao(input, existing);
  return {
    id: existing?.id ?? input.id ?? buildFarolEstudanteId(),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    turmaId: input.turmaId,
    turmaNome: input.turmaNome,
    disciplina: input.disciplina.trim(),
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    estudanteNome: input.estudanteNome.trim(),
    percentualAcerto: input.percentualAcerto,
    sourceSystem: FAROL_SOURCE_SYSTEM,
    referenceDate: input.referenceDate,
    status: input.status,
    // Criar ou editar nunca muda statusRegistro por acidente — só
    // archiveFarolEstudanteItem muda esse campo; edição normal sempre
    // preserva o que já existia (nunca reativa um registro arquivado).
    statusRegistro: existing?.statusRegistro ?? 'ativo',
    ...(input.observacao?.trim() ? { observacao: input.observacao.trim() } : {}),
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

// Correção do code review do PR #19, seção 2: create/update passavam por
// setDoc isolado, sem nenhum audit_log — só archiveFarolEstudanteItem era
// auditado. Agora create e update também gravam documento + audit_log no
// MESMO batch (atômico), mesmo padrão já usado pelo arquivamento.
export async function saveFarolEstudanteItem(
  input: SaveFarolEstudanteInput,
  existing?: FarolEstudanteItem
): Promise<FarolEstudanteItem> {
  const payload = buildFarolEstudantePayload(input, existing);
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, payload.id), payload);
  queueAuditLog(
    batch,
    existing
      ? buildFarolUpdateAuditInput(payload, existing, input.actingUserEmail, input.now)
      : buildFarolCreateAuditInput(payload, input.actingUserEmail, input.now)
  );
  await batch.commit();
  return payload;
}

// Correção final da auditoria — seção 2: por padrão, nunca devolve
// registros arquivados (a lista de trabalho normal só mostra o que está
// ativo). `includeArchived: true` é a única forma de ver arquivados —
// nunca o comportamento padrão. Filtragem no cliente (não um `where` do
// Firestore): documentos legados sem `statusRegistro` (anteriores a esta
// correção) precisam continuar visíveis por padrão, nunca desaparecer
// silenciosamente por não terem o campo novo.
export async function listFarolEstudanteForSchool(
  schoolId: string,
  anoLetivo: number,
  options: { includeArchived?: boolean } = {}
): Promise<FarolEstudanteItem[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  const items = snap.docs.map(d => d.data() as FarolEstudanteItem);
  if (options.includeArchived) return items;
  return items.filter(item => item.statusRegistro !== 'arquivado');
}

// Correção final da auditoria — seção 2: exclusão física NUNCA é permitida
// para o superintendente comum (bloqueado em firestore.rules — só
// isPlatformAdmin()). Esta função só é chamável de fato por um admin raiz;
// mantida para manutenção excepcional (ex.: remoção de um registro de
// teste/erro de digitação grave), nunca exposta na interface do
// superintendente comum. O caminho normal para "tirar da lista de
// trabalho" é archiveFarolEstudanteItem, abaixo.
export async function deleteFarolEstudanteItem(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

// Núcleo puro do arquivamento — sempre um update (nunca delete): preserva
// createdAt/createdBy, atualiza updatedAt/updatedBy, muda só statusRegistro.
// Nenhum outro campo (inclusive estudanteNome) é alterado.
export function buildFarolArchivePayload(
  item: FarolEstudanteItem,
  actingUserEmail: string,
  now: string
): FarolEstudanteItem {
  return {
    ...item,
    statusRegistro: 'arquivado',
    updatedAt: now,
    updatedBy: actingUserEmail,
  };
}

// Resumo permitido no audit_log — só identificadores e status
// não-nominais: NUNCA estudanteNome, percentualAcerto (individual) nem
// observação (texto livre que pode conter dado do estudante). Reforçado
// estruturalmente por assertNoSensitiveKeys em auditService.ts (fragmento
// 'estudantenome' bloqueado), mas o formato já nasce sanitizado aqui — a
// checagem em auditService.ts é uma segunda camada, não a única.
export interface FarolAuditSummary {
  itemId: string;
  schoolId: string;
  turmaId: string;
  disciplina: string;
  anoLetivo: number;
  bimestre: Bimestre;
  status: FarolStatusAcompanhamento;
  statusRegistro: FarolStatusRegistro;
}

function buildFarolAuditSummary(item: FarolEstudanteItem): FarolAuditSummary {
  return {
    itemId: item.id,
    schoolId: item.schoolId,
    turmaId: item.turmaId,
    disciplina: item.disciplina,
    anoLetivo: item.anoLetivo,
    bimestre: item.bimestre,
    status: item.status,
    statusRegistro: item.statusRegistro,
  };
}

// Núcleo puro comum aos três audit_logs do Farol (create/update/archive) —
// previousValue/newValue são sempre o mesmo resumo sanitizado, nunca o
// item inteiro (que teria estudanteNome/percentualAcerto/observação).
function buildFarolAuditInput(
  operation: 'create' | 'update' | 'archive',
  current: FarolEstudanteItem,
  previous: FarolEstudanteItem | null,
  actingUserEmail: string,
  now: string
): RecordAuditLogInput {
  return {
    collectionName: COLLECTION,
    documentId: current.id,
    schoolId: current.schoolId,
    codInep: current.codInep,
    anoLetivo: current.anoLetivo,
    operation,
    previousValue: previous ? buildFarolAuditSummary(previous) : null,
    newValue: buildFarolAuditSummary(current),
    source: 'Manual',
    userId: actingUserEmail,
    userEmail: actingUserEmail,
    now,
  };
}

export function buildFarolCreateAuditInput(
  created: FarolEstudanteItem,
  actingUserEmail: string,
  now: string
): RecordAuditLogInput {
  return buildFarolAuditInput('create', created, null, actingUserEmail, now);
}

export function buildFarolUpdateAuditInput(
  updated: FarolEstudanteItem,
  previous: FarolEstudanteItem,
  actingUserEmail: string,
  now: string
): RecordAuditLogInput {
  return buildFarolAuditInput('update', updated, previous, actingUserEmail, now);
}

export function buildFarolArchiveAuditInput(
  archived: FarolEstudanteItem,
  previous: FarolEstudanteItem,
  actingUserEmail: string,
  now: string
): RecordAuditLogInput {
  return buildFarolAuditInput('archive', archived, previous, actingUserEmail, now);
}

// Arquivamento — o caminho normal para o superintendente comum "remover" um
// registro do Farol. Grava o documento arquivado e o audit_log no MESMO
// batch (atômico — ou os dois existem, ou nenhum existe).
export async function archiveFarolEstudanteItem(
  item: FarolEstudanteItem,
  actingUserEmail: string,
  now: string
): Promise<FarolEstudanteItem> {
  const archived = buildFarolArchivePayload(item, actingUserEmail, now);
  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, archived.id), archived);
  queueAuditLog(batch, buildFarolArchiveAuditInput(archived, item, actingUserEmail, now));
  await batch.commit();
  return archived;
}
