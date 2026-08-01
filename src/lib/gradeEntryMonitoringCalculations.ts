// Fase 2C.1 — cálculos puros do acompanhamento agregado de preenchimento de
// notas (grade_entry_monitoring). Sem import do Firebase (mesmo padrão de
// schoolFlowCalculations.ts/enrollmentCalculations.ts) — percentuais NUNCA
// são persistidos, sempre recalculados a partir dos totais gravados. Zero é
// sempre um valor real (uma turma com relatório informado e
// completedGradeEntries=0); a AUSÊNCIA de documento nunca é tratada como
// zero — ver classifyTurmaGradeEntryStatus.
import type { GradeEntryMonitoring } from '../types/gradeEntryMonitoring';

export type TurmaGradeEntryStatus =
  | 'nao_informado'
  | 'sem_preenchimento'
  | 'parcial'
  | 'completo'
  | 'inconsistente';

export interface GradeEntryCounts {
  totalStudents: number;
  studentsWithCompleteGrades: number;
  studentsWithPartialGrades: number;
  studentsWithoutGrades: number;
  expectedGradeEntries: number;
  completedGradeEntries: number;
}

// completedGradeEntries <= expectedGradeEntries e a soma dos três estados de
// estudante bate com totalStudents — a mesma verificação que
// validateGradeEntryMonitoringInput já exige antes de gravar (ver
// gradeEntryMonitoringService.ts); aqui ela também protege a classificação
// de um documento legado/corrompido que tenha passado por fora da validação.
function isMathematicallyConsistent(counts: GradeEntryCounts): boolean {
  const studentsSum = counts.studentsWithCompleteGrades + counts.studentsWithPartialGrades + counts.studentsWithoutGrades;
  return studentsSum === counts.totalStudents && counts.completedGradeEntries <= counts.expectedGradeEntries;
}

// null quando expectedGradeEntries é zero — nunca 0% automático (seção 7 do
// plano: "quando expectedGradeEntries for zero, percentual deve ser null").
export function calculateCompletionPercentage(
  counts: Pick<GradeEntryCounts, 'completedGradeEntries' | 'expectedGradeEntries'>
): number | null {
  if (counts.expectedGradeEntries === 0) return null;
  return (counts.completedGradeEntries / counts.expectedGradeEntries) * 100;
}

// null quando totalStudents é zero — mesmo cuidado de calculateCompletionPercentage.
export function calculateStudentsCompletePercentage(
  counts: Pick<GradeEntryCounts, 'studentsWithCompleteGrades' | 'totalStudents'>
): number | null {
  if (counts.totalStudents === 0) return null;
  return (counts.studentsWithCompleteGrades / counts.totalStudents) * 100;
}

export function calculatePendingStudents(
  counts: Pick<GradeEntryCounts, 'studentsWithPartialGrades' | 'studentsWithoutGrades'>
): number {
  return counts.studentsWithPartialGrades + counts.studentsWithoutGrades;
}

// `null` (não `GradeEntryMonitoring | undefined`) representa "nenhum
// relatório informado ainda para esta turma/ano/bimestre" — a turma nasce
// da coleção `turmas`, o documento de monitoramento é opcional (seção 9 do
// plano: "mesmo sem documento, a turma deve aparecer").
export function classifyTurmaGradeEntryStatus(monitoring: GradeEntryMonitoring | null): TurmaGradeEntryStatus {
  if (!monitoring) return 'nao_informado';
  if (!isMathematicallyConsistent(monitoring)) return 'inconsistente';
  if (monitoring.completedGradeEntries === 0) return 'sem_preenchimento';
  if (monitoring.completedGradeEntries === monitoring.expectedGradeEntries && monitoring.expectedGradeEntries > 0) {
    return 'completo';
  }
  if (monitoring.completedGradeEntries > 0 && monitoring.completedGradeEntries < monitoring.expectedGradeEntries) {
    return 'parcial';
  }
  return 'inconsistente';
}

export interface TurmaGradeEntryRow {
  turmaId: string;
  turmaNome: string;
  monitoring: GradeEntryMonitoring | null;
}

export interface GradeEntryMonitoringConsolidated {
  turmasCadastradas: number;
  turmasComRelatorio: number;
  turmasSemRelatorio: number;
  turmasCompletas: number;
  turmasParciais: number;
  turmasSemPreenchimento: number;
  turmasInconsistentes: number;
  totalStudents: number;
  studentsWithCompleteGrades: number;
  studentsWithPartialGrades: number;
  studentsWithoutGrades: number;
  expectedGradeEntries: number;
  completedGradeEntries: number;
  // Soma de completedGradeEntries / soma de expectedGradeEntries de todas as
  // turmas COM relatório — NUNCA a média simples do percentual de cada
  // turma (seção 7 do plano: "não usar média simples dos percentuais das
  // turmas"). null quando a soma de expectedGradeEntries é zero. Mesma
  // função usada tanto para consolidar as turmas de UMA escola quanto as
  // turmas de várias escolas de uma carteira — quem monta `rows` decide o
  // escopo.
  percentualPreenchimentoGeral: number | null;
}

export function consolidateGradeEntryMonitoring(
  rows: readonly TurmaGradeEntryRow[]
): GradeEntryMonitoringConsolidated {
  const totals = {
    totalStudents: 0,
    studentsWithCompleteGrades: 0,
    studentsWithPartialGrades: 0,
    studentsWithoutGrades: 0,
    expectedGradeEntries: 0,
    completedGradeEntries: 0,
  };

  let turmasComRelatorio = 0;
  let turmasCompletas = 0;
  let turmasParciais = 0;
  let turmasSemPreenchimento = 0;
  let turmasSemRelatorio = 0;
  let turmasInconsistentes = 0;

  for (const row of rows) {
    const status = classifyTurmaGradeEntryStatus(row.monitoring);
    switch (status) {
      case 'nao_informado':
        turmasSemRelatorio += 1;
        continue;
      case 'completo':
        turmasComRelatorio += 1;
        turmasCompletas += 1;
        break;
      case 'parcial':
        turmasComRelatorio += 1;
        turmasParciais += 1;
        break;
      case 'sem_preenchimento':
        turmasComRelatorio += 1;
        turmasSemPreenchimento += 1;
        break;
      case 'inconsistente':
        turmasComRelatorio += 1;
        turmasInconsistentes += 1;
        break;
    }
    // status !== 'nao_informado' aqui — monitoring nunca é null (garantido
    // pelo próprio classifyTurmaGradeEntryStatus).
    const monitoring = row.monitoring as GradeEntryMonitoring;
    totals.totalStudents += monitoring.totalStudents;
    totals.studentsWithCompleteGrades += monitoring.studentsWithCompleteGrades;
    totals.studentsWithPartialGrades += monitoring.studentsWithPartialGrades;
    totals.studentsWithoutGrades += monitoring.studentsWithoutGrades;
    totals.expectedGradeEntries += monitoring.expectedGradeEntries;
    totals.completedGradeEntries += monitoring.completedGradeEntries;
  }

  return {
    turmasCadastradas: rows.length,
    turmasComRelatorio,
    turmasSemRelatorio,
    turmasCompletas,
    turmasParciais,
    turmasSemPreenchimento,
    turmasInconsistentes,
    ...totals,
    percentualPreenchimentoGeral: calculateCompletionPercentage(totals),
  };
}
