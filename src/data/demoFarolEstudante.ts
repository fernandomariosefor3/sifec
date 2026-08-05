// Reestruturação SIFEC — Farol do Estudante: dados fictícios para o modo
// demonstração (sem usuário Firebase autenticado). Nunca gravado no
// Firestore. Nomes claramente fictícios, mesmo padrão já usado pela antiga
// Busca Ativa.
import { FAROL_SOURCE_SYSTEM, type FarolEstudanteItem } from '../types/farolEstudante';
import { DEMO_ANO_LETIVO, DEMO_BIMESTRE, DEMO_COD_INEP, DEMO_ESCOLA_NOME, DEMO_SCHOOL_ID } from './demoGradeEntryMonitoring';

export const DEMO_FAROL_ESTUDANTE: FarolEstudanteItem[] = [
  {
    id: 'demo-farol-1',
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    disciplina: 'Matemática',
    anoLetivo: DEMO_ANO_LETIVO,
    bimestre: DEMO_BIMESTRE,
    estudanteNome: 'Estudante Demonstração 1',
    percentualAcerto: 18,
    sourceSystem: FAROL_SOURCE_SYSTEM,
    referenceDate: '2026-03-08',
    status: 'Em acompanhamento',
    observacao: 'Registro fictício — modo demonstração.',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  },
  {
    id: 'demo-farol-2',
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    disciplina: 'Língua Portuguesa',
    anoLetivo: DEMO_ANO_LETIVO,
    bimestre: DEMO_BIMESTRE,
    estudanteNome: 'Estudante Demonstração 2',
    percentualAcerto: 22,
    sourceSystem: FAROL_SOURCE_SYSTEM,
    referenceDate: '2026-03-08',
    status: 'Identificado',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  },
];
