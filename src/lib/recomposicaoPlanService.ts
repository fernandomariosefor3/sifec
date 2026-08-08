// Reestruturação SIFEC — Recomposição: núcleo puro (validação + montagem do
// payload) separado da orquestração assíncrona, mesmo padrão de
// farolEstudanteService.ts/gradeEntryMonitoringService.ts.
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import { RECOMPOSICAO_TURNOS, type RecomposicaoPlan, type RecomposicaoTurno } from '../types/recomposicaoPlan';

const COLLECTION = 'recomposicao_planos';
const MAX_DESCRICAO_LENGTH = 2000;

export class RecomposicaoPlanValidationError extends Error {}

export interface SaveRecomposicaoPlanInput {
  id?: string;
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  prazo: string;
  areaDisciplina: string;
  turno: RecomposicaoTurno;
  descricao: string;
  actingUserEmail: string;
  now: string;
}

export function validateRecomposicaoPlanInput(input: SaveRecomposicaoPlanInput): void {
  if (!input.prazo.trim()) {
    throw new RecomposicaoPlanValidationError('Informe o prazo do plano.');
  }
  if (!input.areaDisciplina.trim()) {
    throw new RecomposicaoPlanValidationError('Informe a área ou disciplina.');
  }
  if (!RECOMPOSICAO_TURNOS.includes(input.turno)) {
    throw new RecomposicaoPlanValidationError('Turno inválido.');
  }
  if (!input.descricao.trim()) {
    throw new RecomposicaoPlanValidationError('Descreva o plano de recomposição.');
  }
  if (input.descricao.length > MAX_DESCRICAO_LENGTH) {
    throw new RecomposicaoPlanValidationError(`A descrição está limitada a ${MAX_DESCRICAO_LENGTH} caracteres.`);
  }
  if (![1, 2, 3, 4].includes(input.bimestre)) {
    throw new RecomposicaoPlanValidationError('Bimestre inválido — use um valor entre 1 e 4.');
  }
}

export function buildRecomposicaoPlanPayload(
  input: SaveRecomposicaoPlanInput,
  existing?: RecomposicaoPlan
): RecomposicaoPlan {
  validateRecomposicaoPlanInput(input);
  return {
    id: existing?.id ?? input.id ?? crypto.randomUUID(),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    prazo: input.prazo.trim(),
    areaDisciplina: input.areaDisciplina.trim(),
    turno: input.turno,
    descricao: input.descricao.trim(),
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

export async function saveRecomposicaoPlan(
  input: SaveRecomposicaoPlanInput,
  existing?: RecomposicaoPlan
): Promise<RecomposicaoPlan> {
  const payload = buildRecomposicaoPlanPayload(input, existing);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
  return payload;
}

export async function listRecomposicaoPlansForSchool(
  schoolId: string,
  anoLetivo: number
): Promise<RecomposicaoPlan[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  return snap.docs.map(d => d.data() as RecomposicaoPlan);
}

export async function deleteRecomposicaoPlan(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
