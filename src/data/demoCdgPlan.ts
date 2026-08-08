// Reestruturação SIFEC — Ciclo de Gestão: dados fictícios para o modo
// demonstração (sem usuário Firebase autenticado). Nunca gravado no
// Firestore.
import type { CdgPlan, CdgTask } from '../types/cdgPlan';
import { DEMO_ANO_LETIVO, DEMO_COD_INEP, DEMO_ESCOLA_NOME, DEMO_SCHOOL_ID } from './demoGradeEntryMonitoring';

export const DEMO_CDG_PLAN: CdgPlan = {
  id: `${DEMO_SCHOOL_ID}_${DEMO_ANO_LETIVO}`,
  schoolId: DEMO_SCHOOL_ID,
  codInep: DEMO_COD_INEP,
  escolaNome: DEMO_ESCOLA_NOME,
  anoLetivo: DEMO_ANO_LETIVO,
  situacao: 'Ativo',
  statusExecucao: 'Em execução',
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-03-10T00:00:00.000Z',
  createdBy: 'demo@sefor3.ce.gov.br',
  updatedBy: 'demo@sefor3.ce.gov.br',
};

export const DEMO_CDG_TASKS: CdgTask[] = [
  {
    id: 'demo-cdg-task-1',
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    anoLetivo: DEMO_ANO_LETIVO,
    acao: 'Reunião de alinhamento pedagógico (demonstração)',
    responsavel: 'Coordenação pedagógica',
    prazo: '2026-03-20',
    status: 'Em Andamento',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  },
  {
    id: 'demo-cdg-task-2',
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    anoLetivo: DEMO_ANO_LETIVO,
    acao: 'Monitoramento de frequência (demonstração)',
    responsavel: 'Direção escolar',
    prazo: '2026-02-15',
    status: 'Atrasado',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  },
];
