// Reestruturação SIFEC — Farol do Estudante: núcleo puro (validação +
// montagem do payload) separado da orquestração assíncrona, mesmo padrão de
// gradeEntryMonitoringService.ts. Consulta sempre escopada por schoolId —
// nunca a coleção inteira (mesmo cuidado de listGradeEntryMonitoringForSchool).
import { collection, deleteDoc, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
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
// nunca gravar um formato ambíguo de fuso horário).
const REFERENCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  if (!REFERENCE_DATE_PATTERN.test(input.referenceDate)) {
    throw new FarolEstudanteValidationError('Informe a data de referência do relatório do SISEDU Analytics (AAAA-MM-DD).');
  }
  if (!FAROL_STATUS_ACOMPANHAMENTO.includes(input.status)) {
    throw new FarolEstudanteValidationError('Selecione um status de acompanhamento válido.');
  }
}

export function buildFarolEstudanteId(): string {
  return crypto.randomUUID();
}

export function buildFarolEstudantePayload(
  input: SaveFarolEstudanteInput,
  existing?: FarolEstudanteItem
): FarolEstudanteItem {
  validateFarolEstudanteInput(input);
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

export async function saveFarolEstudanteItem(
  input: SaveFarolEstudanteInput,
  existing?: FarolEstudanteItem
): Promise<FarolEstudanteItem> {
  const payload = buildFarolEstudantePayload(input, existing);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
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

// Núcleo puro do audit_log de arquivamento — newValue contém só
// identificadores não-nominais (id do registro, turma, disciplina,
// bimestre) — NUNCA estudanteNome nem qualquer dado pessoal do estudante.
// Reforçado estruturalmente por assertNoSensitiveKeys em auditService.ts
// (fragmento 'estudantenome' bloqueado), mas o formato já nasce sanitizado
// aqui — a checagem em auditService.ts é uma segunda camada, não a única.
export function buildFarolArchiveAuditInput(
  archived: FarolEstudanteItem,
  previousStatusRegistro: FarolStatusRegistro,
  actingUserEmail: string,
  now: string
): RecordAuditLogInput {
  return {
    collectionName: COLLECTION,
    documentId: archived.id,
    schoolId: archived.schoolId,
    codInep: archived.codInep,
    anoLetivo: archived.anoLetivo,
    operation: 'archive',
    previousValue: { statusRegistro: previousStatusRegistro },
    newValue: {
      action: 'archive', itemId: archived.id, turmaId: archived.turmaId,
      disciplina: archived.disciplina, bimestre: archived.bimestre,
    },
    source: 'Manual',
    userId: actingUserEmail,
    userEmail: actingUserEmail,
    now,
  };
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
  queueAuditLog(batch, buildFarolArchiveAuditInput(archived, item.statusRegistro, actingUserEmail, now));
  await batch.commit();
  return archived;
}
