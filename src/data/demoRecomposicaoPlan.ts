// Reestruturação SIFEC — Recomposição: dados fictícios para o modo
// demonstração (sem usuário Firebase autenticado). Nunca gravado no
// Firestore.
import type { RecomposicaoPlan } from '../types/recomposicaoPlan';
import { DEMO_ANO_LETIVO, DEMO_BIMESTRE, DEMO_COD_INEP, DEMO_ESCOLA_NOME, DEMO_SCHOOL_ID } from './demoGradeEntryMonitoring';

export const DEMO_RECOMPOSICAO_PLANOS: RecomposicaoPlan[] = [
  {
    id: 'demo-recomposicao-1',
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    anoLetivo: DEMO_ANO_LETIVO,
    bimestre: DEMO_BIMESTRE,
    prazo: 'Até o fim do 2º bimestre (demonstração)',
    areaDisciplina: 'Língua Portuguesa e Matemática',
    turno: 'Matutino',
    descricao: 'Plano fictício de exemplo — oficinas de reforço semanais para turmas com maior incidência de baixo desempenho.',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  },
];
