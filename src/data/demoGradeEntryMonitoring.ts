// Fase 2C.1 — acompanhamento agregado fictício para o modo demonstração
// (usado só quando não há usuário Firebase autenticado — ver NotasView.tsx).
// Nunca gravado no Firestore, nunca usado como fallback depois de
// autenticado. Só totais agregados — nenhum nome de estudante, nenhum dado
// nominal (mesmo cuidado de demoStudentRoster.ts, agora aplicado ao
// acompanhamento por turma da Fase 2C.1).
import type { GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import { buildGradeEntryMonitoringId } from '../lib/deterministicIds';

export const DEMO_SCHOOL_ID = 'diva-cabral';
export const DEMO_COD_INEP = '23067918';
export const DEMO_ESCOLA_NOME = 'EEM Diva Cabral';
export const DEMO_ANO_LETIVO = 2026;
export const DEMO_BIMESTRE = 1;

// turma-3a-diva: relatório informado, preenchimento completo.
// turma-3b-diva: nenhum relatório informado ainda (nasce só de `turmas`,
// nunca aparece nesta lista) — demonstra o estado "Relatório não informado".
export const DEMO_GRADE_ENTRY_MONITORING: GradeEntryMonitoring[] = [
  {
    id: buildGradeEntryMonitoringId(DEMO_SCHOOL_ID, DEMO_ANO_LETIVO, DEMO_BIMESTRE, 'turma-3a-diva'),
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: DEMO_ANO_LETIVO,
    bimestre: DEMO_BIMESTRE,
    totalStudents: 32,
    studentsWithCompleteGrades: 32,
    studentsWithPartialGrades: 0,
    studentsWithoutGrades: 0,
    expectedGradeEntries: 128,
    completedGradeEntries: 128,
    status: 'confirmado',
    sourceSystem: 'SIGE Escola',
    sourceReportTitle: 'Relatório de acompanhamento de notas — 1º Bimestre',
    referenceDate: '2026-03-10',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  },
];
