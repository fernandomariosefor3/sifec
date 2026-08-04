// Reestruturação SIFEC — Ciclo de Gestão (CdG) simplificado: núcleo puro
// (validação + montagem do payload) separado da orquestração assíncrona,
// mesmo padrão de farolEstudanteService.ts/recomposicaoPlanService.ts.
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import {
  CDG_EXECUTION_STATUSES, CDG_PLAN_SITUACOES, CDG_TASK_STATUSES,
  type CdgExecutionStatus, type CdgPlan, type CdgPlanSituacao, type CdgTask, type CdgTaskStatus,
} from '../types/cdgPlan';

const PLAN_COLLECTION = 'cdg_planos';
const TASK_COLLECTION = 'cdg_tarefas';

export class CdgValidationError extends Error {}

function buildCdgPlanId(schoolId: string, anoLetivo: number): string {
  return `${schoolId}_${anoLetivo}`;
}

export interface SaveCdgPlanInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  situacao: CdgPlanSituacao;
  statusExecucao: CdgExecutionStatus;
  actingUserEmail: string;
  now: string;
}

export function validateCdgPlanInput(input: SaveCdgPlanInput): void {
  if (!CDG_PLAN_SITUACOES.includes(input.situacao)) {
    throw new CdgValidationError('Situação do plano inválida.');
  }
  if (!CDG_EXECUTION_STATUSES.includes(input.statusExecucao)) {
    throw new CdgValidationError('Status de execução inválido.');
  }
}

export function buildCdgPlanPayload(input: SaveCdgPlanInput, existing?: CdgPlan): CdgPlan {
  validateCdgPlanInput(input);
  return {
    id: buildCdgPlanId(input.schoolId, input.anoLetivo),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    situacao: input.situacao,
    statusExecucao: input.statusExecucao,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

export async function saveCdgPlan(input: SaveCdgPlanInput, existing?: CdgPlan): Promise<CdgPlan> {
  const payload = buildCdgPlanPayload(input, existing);
  await setDoc(doc(db, PLAN_COLLECTION, payload.id), payload);
  return payload;
}

export async function getCdgPlan(schoolId: string, anoLetivo: number): Promise<CdgPlan | null> {
  const snap = await getDocs(
    query(collection(db, PLAN_COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  return snap.empty ? null : (snap.docs[0].data() as CdgPlan);
}

export interface SaveCdgTaskInput {
  id?: string;
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  acao: string;
  responsavel: string;
  prazo: string;
  status: CdgTaskStatus;
  actingUserEmail: string;
  now: string;
}

const PRAZO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateCdgTaskInput(input: SaveCdgTaskInput): void {
  if (!input.acao.trim()) {
    throw new CdgValidationError('Informe a ação/tarefa.');
  }
  if (!input.responsavel.trim()) {
    throw new CdgValidationError('Informe o responsável.');
  }
  if (!PRAZO_PATTERN.test(input.prazo)) {
    throw new CdgValidationError('Prazo inválido — use o formato AAAA-MM-DD.');
  }
  if (!CDG_TASK_STATUSES.includes(input.status)) {
    throw new CdgValidationError('Status inválido.');
  }
}

export function buildCdgTaskPayload(input: SaveCdgTaskInput, existing?: CdgTask): CdgTask {
  validateCdgTaskInput(input);
  return {
    id: existing?.id ?? input.id ?? crypto.randomUUID(),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    acao: input.acao.trim(),
    responsavel: input.responsavel.trim(),
    prazo: input.prazo,
    status: input.status,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

export async function saveCdgTask(input: SaveCdgTaskInput, existing?: CdgTask): Promise<CdgTask> {
  const payload = buildCdgTaskPayload(input, existing);
  await setDoc(doc(db, TASK_COLLECTION, payload.id), payload);
  return payload;
}

export async function listCdgTasksForSchool(schoolId: string, anoLetivo: number): Promise<CdgTask[]> {
  const snap = await getDocs(
    query(collection(db, TASK_COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  return snap.docs.map(d => d.data() as CdgTask);
}

export async function deleteCdgTask(id: string): Promise<void> {
  await deleteDoc(doc(db, TASK_COLLECTION, id));
}

// Tarefa "atrasada/vencida" de fato (prazo já passou e não foi concluída) —
// independente do status manual escolhido, usado só para destaque visual
// (nunca sobrescreve o status que o usuário selecionou).
export function isCdgTaskOverdue(task: Pick<CdgTask, 'prazo' | 'status'>, todayIso: string): boolean {
  return task.prazo < todayIso && task.status !== 'Concluído' && task.status !== 'Concluído com Atraso';
}
