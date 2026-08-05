// Auditoria da reestruturação SIFEC — Acompanhamento de Notas por
// disciplina: dados fictícios para o modo demonstração. Nunca gravado no
// Firestore.
import type { GradeEntryMonitoringByDiscipline } from '../types/gradeEntryMonitoringDiscipline';
import { DEMO_ANO_LETIVO, DEMO_BIMESTRE, DEMO_COD_INEP, DEMO_ESCOLA_NOME, DEMO_SCHOOL_ID } from './demoGradeEntryMonitoring';

const TURMA_ID = 'turma-3a-diva';
const TURMA_NOME = '3º Ano A - Matutino';

function item(disciplina: GradeEntryMonitoringByDiscipline['disciplina'], expected: number, completed: number): GradeEntryMonitoringByDiscipline {
  return {
    id: `${DEMO_SCHOOL_ID}_${DEMO_ANO_LETIVO}_b${DEMO_BIMESTRE}_${TURMA_ID}_${disciplina}`,
    schoolId: DEMO_SCHOOL_ID, codInep: DEMO_COD_INEP, escolaNome: DEMO_ESCOLA_NOME,
    turmaId: TURMA_ID, turmaNome: TURMA_NOME,
    anoLetivo: DEMO_ANO_LETIVO, bimestre: DEMO_BIMESTRE, disciplina,
    expectedGradeEntries: expected, completedGradeEntries: completed, status: 'confirmado',
    referenceDate: '2026-03-10',
    createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br', updatedBy: 'demo@sefor3.ce.gov.br',
  };
}

export const DEMO_GRADE_ENTRY_MONITORING_DISCIPLINE: GradeEntryMonitoringByDiscipline[] = [
  item('linguaPortuguesa', 32, 32),
  item('matematica', 32, 30),
  item('cienciasNatureza', 32, 20),
  item('cienciasHumanas', 32, 10),
];
