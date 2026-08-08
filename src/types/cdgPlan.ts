// Reestruturação SIFEC — Ciclo de Gestão (CdG) simplificado: um plano por
// escola+ano letivo (situação + status de execução) e uma lista de
// ações/tarefas do plano, cada uma com seu próprio status.
export const CDG_PLAN_SITUACOES = ['Ativo', 'Inativo'] as const;
export type CdgPlanSituacao = (typeof CDG_PLAN_SITUACOES)[number];

export const CDG_EXECUTION_STATUSES = ['Não iniciado', 'Em execução', 'Concluído'] as const;
export type CdgExecutionStatus = (typeof CDG_EXECUTION_STATUSES)[number];

export interface CdgPlan {
  id: string; // `${schoolId}_${anoLetivo}`
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  situacao: CdgPlanSituacao;
  statusExecucao: CdgExecutionStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export const CDG_TASK_STATUSES = [
  'Não Iniciado', 'Previsto', 'Em Andamento', 'Concluído', 'Concluído com Atraso', 'Atrasado',
] as const;
export type CdgTaskStatus = (typeof CDG_TASK_STATUSES)[number];

export interface CdgTask {
  id: string;
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  acao: string;
  responsavel: string;
  prazo: string; // YYYY-MM-DD
  status: CdgTaskStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
