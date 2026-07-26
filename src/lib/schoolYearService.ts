// Fase 2A — SchoolYearService: estrutura anual da escola (school_years).
// Nenhuma migração automática acontece aqui: matriculaInicial/matriculaAtual
// nascem `null` ("não informado") e só passam a ter valor quando alguém
// preenche o formulário ou uma importação confirmada os grava — nunca a
// partir do campo legado `schools.matriculas` (ver seção 3 do plano).
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { SchoolYear, SchoolYearStatus } from '../types/schoolYear';
import { buildSchoolYearId } from './deterministicIds';
import { isNonNegativeInteger } from './enrollmentCalculations';

const COLLECTION = 'school_years';

export class SchoolYearValidationError extends Error {}

export interface SaveSchoolYearInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  matriculaInicial?: number | null;
  matriculaAtual?: number | null;
  quantidadeTurmasAtivas: number;
  status: SchoolYearStatus;
  dataInicio?: string | null;
  dataFim?: string | null;
  actingUserEmail: string;
  now: string;
}

export function validateSaveSchoolYearInput(input: SaveSchoolYearInput): void {
  if (input.matriculaInicial != null && !isNonNegativeInteger(input.matriculaInicial)) {
    throw new SchoolYearValidationError('Matrícula inicial deve ser um número inteiro maior ou igual a zero.');
  }
  if (input.matriculaAtual != null && !isNonNegativeInteger(input.matriculaAtual)) {
    throw new SchoolYearValidationError('Matrícula atual deve ser um número inteiro maior ou igual a zero.');
  }
  if (!isNonNegativeInteger(input.quantidadeTurmasAtivas)) {
    throw new SchoolYearValidationError('Quantidade de turmas ativas deve ser um número inteiro maior ou igual a zero.');
  }
}

// Núcleo puro: monta o documento exato, preservando createdAt/createdBy e
// qualquer matrícula já informada quando o campo não vier no input desta
// chamada (evita apagar um valor real com undefined vindo de um formulário
// parcial).
export function buildSchoolYearPayload(
  input: SaveSchoolYearInput,
  existing?: SchoolYear
): SchoolYear {
  validateSaveSchoolYearInput(input);
  return {
    id: buildSchoolYearId(input.schoolId, input.anoLetivo),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    matriculaInicial: input.matriculaInicial !== undefined ? input.matriculaInicial : existing?.matriculaInicial ?? null,
    matriculaAtual: input.matriculaAtual !== undefined ? input.matriculaAtual : existing?.matriculaAtual ?? null,
    quantidadeTurmasAtivas: input.quantidadeTurmasAtivas,
    status: input.status,
    dataInicio: input.dataInicio !== undefined ? input.dataInicio : existing?.dataInicio ?? null,
    dataFim: input.dataFim !== undefined ? input.dataFim : existing?.dataFim ?? null,
    ultimaAtualizacao: input.now,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

export async function getSchoolYear(schoolId: string, anoLetivo: number): Promise<SchoolYear | null> {
  const snap = await getDoc(doc(db, COLLECTION, buildSchoolYearId(schoolId, anoLetivo)));
  return snap.exists() ? (snap.data() as SchoolYear) : null;
}

export async function saveSchoolYear(input: SaveSchoolYearInput): Promise<SchoolYear> {
  const existing = await getSchoolYear(input.schoolId, input.anoLetivo);
  const payload = buildSchoolYearPayload(input, existing ?? undefined);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
  return payload;
}
