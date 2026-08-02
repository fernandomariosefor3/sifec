// Fase 2C.1 — cálculos puros do acompanhamento agregado de preenchimento de
// notas (grade_entry_monitoring). Sem import do Firebase (mesmo padrão de
// schoolFlowCalculations.ts/enrollmentCalculations.ts) — percentuais NUNCA
// são persistidos, sempre recalculados a partir dos totais gravados. Zero é
// sempre um valor real (uma turma com relatório informado e
// completedGradeEntries=0); a AUSÊNCIA de documento nunca é tratada como
// zero — ver classifyTurmaGradeEntryStatus.
import type { GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import { isNonNegativeInteger } from './enrollmentCalculations';

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

const COUNT_FIELDS: readonly (keyof GradeEntryCounts)[] = [
  'totalStudents', 'studentsWithCompleteGrades', 'studentsWithPartialGrades',
  'studentsWithoutGrades', 'expectedGradeEntries', 'completedGradeEntries',
];

// completedGradeEntries <= expectedGradeEntries e a soma dos três estados de
// estudante bate com totalStudents — a mesma verificação que
// validateGradeEntryMonitoringInput já exige antes de gravar (ver
// gradeEntryMonitoringService.ts); aqui ela também protege a classificação
// de um documento legado/corrompido que tenha passado por fora da validação
// (ex.: gravado direto no console do Firebase, ou por uma versão anterior
// das regras) — cada contador precisa ser um inteiro não-negativo antes de
// qualquer comparação: negativo, NaN, Infinity ou fracionário em QUALQUER
// campo já é inconsistente, mesmo que a soma "bata" numericamente (ex.:
// completedGradeEntries = Infinity nunca é <= um expectedGradeEntries
// finito, mas um completedGradeEntries = NaN faria toda comparação
// numérica falhar silenciosamente sem esta checagem explícita).
function isMathematicallyConsistent(counts: GradeEntryCounts): boolean {
  if (!COUNT_FIELDS.every(field => isNonNegativeInteger(counts[field]))) return false;
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

// `null` (não `GradeEntryCounts | undefined`) representa "nenhum relatório
// informado ainda para esta turma/ano/bimestre" — a turma nasce da coleção
// `turmas`, o documento de monitoramento é opcional (seção 9 do plano:
// "mesmo sem documento, a turma deve aparecer"). Parâmetro tipado como
// `GradeEntryCounts` (não `GradeEntryMonitoring`) de propósito — só os seis
// contadores importam para a classificação, então a mesma função pura serve
// tanto para um documento já gravado (GradeEntryMonitoringTable) quanto
// para os totais ainda em edição no formulário, antes de salvar
// (GradeEntryMonitoringFormModal — revisão do code review do PR #17, seção
// 7: "situação resultante" em tempo real sem duplicar esta lógica).
export function classifyTurmaGradeEntryStatus(monitoring: GradeEntryCounts | null): TurmaGradeEntryStatus {
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
        // Conta como "com relatório" (um documento foi de fato submetido),
        // mas NUNCA soma seus contadores aos totais — um documento
        // inconsistente pode ter negativo/NaN/Infinity/fracionário em
        // qualquer campo (ver isMathematicallyConsistent), e somar isso
        // contaminaria totalStudents/expectedGradeEntries/
        // completedGradeEntries e, por consequência,
        // percentualPreenchimentoGeral (revisão do code review do PR #17,
        // seção 1). Só um documento matematicamente válido entra nos
        // totais.
        turmasComRelatorio += 1;
        turmasInconsistentes += 1;
        continue;
    }
    // status !== 'nao_informado'/'inconsistente' aqui — monitoring nunca é
    // null (garantido pelo próprio classifyTurmaGradeEntryStatus) e seus
    // seis contadores já são inteiros não-negativos consistentes entre si
    // (garantido por isMathematicallyConsistent, chamado dentro de
    // classifyTurmaGradeEntryStatus antes de qualquer status que não seja
    // 'inconsistente').
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
    // Ajuste cirúrgico pós-PR #17: mesmo com os contadores das turmas
    // inconsistentes já fora de `totals` (nunca contaminam a soma), um
    // percentual calculado só com as turmas válidas ainda mentiria por
    // omissão — NotasView/NotasSummaryCards usam este consolidado
    // DIRETAMENTE (não passam por calculateGradeEntryMonitoringIndicators,
    // que já fazia esta mesma correção só no nível da escola), então a
    // regra precisa estar aqui, na função que TODOS os consumidores
    // (NotasView, NotasSummaryCards, Sala de Situação) compartilham. Uma
    // única turma inconsistente já é suficiente para o conjunto inteiro
    // não ser "confiável o bastante" para exibir um percentual.
    percentualPreenchimentoGeral: turmasInconsistentes > 0 ? null : calculateCompletionPercentage(totals),
  };
}
