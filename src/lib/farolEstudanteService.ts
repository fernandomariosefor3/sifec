// Reestruturação SIFEC — Farol do Estudante: núcleo puro (validação +
// montagem do payload) separado da orquestração assíncrona, mesmo padrão de
// gradeEntryMonitoringService.ts. Consulta sempre escopada por schoolId —
// nunca a coleção inteira (mesmo cuidado de listGradeEntryMonitoringForSchool).
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import {
  FAROL_ACERTO_LIMITE,
  FAROL_SOURCE_SYSTEM,
  FAROL_STATUS_ACOMPANHAMENTO,
  type FarolEstudanteItem,
  type FarolStatusAcompanhamento,
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

export async function listFarolEstudanteForSchool(
  schoolId: string,
  anoLetivo: number
): Promise<FarolEstudanteItem[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  return snap.docs.map(d => d.data() as FarolEstudanteItem);
}

// Exclusão livre para superintendente com acesso de escrita à escola — o
// estudante pode ter sido reavaliado e superado o critério de < 25%, e este
// registro não é histórico auditável como grade_entry_monitoring (é uma lista
// de trabalho, não um relatório oficial transcrito).
export async function deleteFarolEstudanteItem(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
