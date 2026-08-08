// Fase 2C.1 — cálculos puros do acompanhamento agregado de preenchimento de
// notas (grade_entry_monitoring). Sem import do Firebase (mesmo padrão de
// schoolFlowCalculations.ts/enrollmentCalculations.ts) — percentuais NUNCA
// são persistidos, sempre recalculados a partir dos totais gravados. Zero é
// sempre um valor real (uma turma com relatório informado e
// completedGradeEntries=0); a AUSÊNCIA de documento nunca é tratada como
// zero — ver classifyTurmaGradeEntryStatus.
import type { GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import type { AreaConhecimento, GradeEntryMonitoringByDiscipline } from '../types/gradeEntryMonitoringDiscipline';
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

// Reestruturação SIFEC — faixas de alerta visual do percentual de
// preenchimento de notas (item "Lançamento de Notas" do plano):
//   > 95%        → 'otimo'    (Ótimo / Concluído)
//   75% – 95%    → 'bom'      (Bom / Em andamento)
//   50% – 75%    → 'atencao'  (Atenção / Parcial)
//   ≤ 50%        → 'critico'  (Crítico)
// Convenção de fronteira (o plano não define os limites como abertos ou
// fechados dos dois lados ao mesmo tempo): cada faixa inclui seu próprio
// limite SUPERIOR, exceto a mais alta (> 95, estritamente maior) — garante
// uma partição sem sobreposição nem lacuna para qualquer percentual real.
// `null` (nenhum relatório informado) tem faixa própria, nunca cai em
// 'critico' por omissão.
export type CompletionColorBand = 'otimo' | 'bom' | 'atencao' | 'critico' | 'sem_dado';

export interface CompletionColorBandInfo {
  label: string;
  badgeClassName: string;
  textClassName: string;
  dotClassName: string;
}

export const COMPLETION_COLOR_BAND_INFO: Record<CompletionColorBand, CompletionColorBandInfo> = {
  otimo: {
    label: 'Ótimo / Concluído',
    badgeClassName: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    textClassName: 'text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
  bom: {
    label: 'Bom / Em andamento',
    badgeClassName: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    textClassName: 'text-emerald-600',
    dotClassName: 'bg-emerald-400',
  },
  atencao: {
    label: 'Atenção / Parcial',
    badgeClassName: 'bg-amber-50 text-amber-700 border-amber-200',
    textClassName: 'text-amber-600',
    dotClassName: 'bg-amber-400',
  },
  critico: {
    label: 'Crítico',
    badgeClassName: 'bg-rose-50 text-rose-700 border-rose-200',
    textClassName: 'text-rose-600',
    dotClassName: 'bg-rose-500',
  },
  sem_dado: {
    label: 'Não informado',
    badgeClassName: 'bg-slate-100 text-slate-500 border-slate-200',
    textClassName: 'text-slate-400',
    dotClassName: 'bg-slate-300',
  },
};

// Auditoria da reestruturação SIFEC, seção 5 — limites exatos e literais:
// >95% Ótimo; >=75 e <=95% Bom (limite inferior INCLUSIVO, ao contrário do
// limite de 95, que é exclusivo do lado de baixo); >50 e <75% Atenção;
// <=50% Crítico. Corrigido nesta auditoria: a implementação anterior usava
// `> 75` (exclusivo), classificando exatamente 75% como Atenção — divergia
// do limite inclusivo pedido explicitamente pela auditoria.
export function classifyCompletionColorBand(percentage: number | null): CompletionColorBand {
  if (percentage == null) return 'sem_dado';
  if (percentage > 95) return 'otimo';
  if (percentage >= 75) return 'bom';
  if (percentage > 50) return 'atencao';
  return 'critico';
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

// Reestruturação SIFEC — visões "1º Período" (1º+2º bimestre), "2º Período"
// (3º+4º bimestre), "Consolidado" (1º ao 4º) e "agregados regionais"
// (soma de várias escolas). Deliberadamente NÃO reaproveita
// consolidateGradeEntryMonitoring: aquela função assume um único documento
// de monitoramento por turma (um bimestre), e `totalStudents`/
// `studentsWithCompleteGrades`/etc são uma FOTOGRAFIA da turma naquele
// bimestre — somar essas colunas entre bimestres diferentes contaria a
// mesma matrícula mais de uma vez. Esta função soma só o que É aditivo por
// natureza entre bimestres: lançamentos esperados/realizados (cada bimestre
// tem seus próprios lançamentos, nunca se sobrepõem). Documentos
// inconsistentes (ver isMathematicallyConsistent) são contados mas nunca
// somados aos totais, mesmo princípio de consolidateGradeEntryMonitoring.
export interface PeriodGradeEntryAggregate {
  turmasNoEscopo: number;
  turmasComAoMenosUmRelatorio: number;
  turmasSemNenhumRelatorio: number;
  turmasComInconsistencia: number;
  totalExpectedGradeEntries: number;
  totalCompletedGradeEntries: number;
  percentualGeral: number | null;
}

// `monitoringByTurma` — para cada turma no escopo, a lista de documentos de
// monitoramento encontrados nos bimestres do período (pode ter de 0 a N
// entradas por turma; N = quantidade de bimestres do período, nunca mais).
export function aggregateGradeEntriesForPeriod(
  monitoringByTurma: readonly (readonly GradeEntryCounts[])[]
): PeriodGradeEntryAggregate {
  let turmasComAoMenosUmRelatorio = 0;
  let turmasSemNenhumRelatorio = 0;
  let turmasComInconsistencia = 0;
  let totalExpectedGradeEntries = 0;
  let totalCompletedGradeEntries = 0;

  for (const monitoringDocs of monitoringByTurma) {
    if (monitoringDocs.length === 0) {
      turmasSemNenhumRelatorio += 1;
      continue;
    }
    turmasComAoMenosUmRelatorio += 1;
    const turmaTemInconsistencia = monitoringDocs.some(doc => !isMathematicallyConsistent(doc));
    if (turmaTemInconsistencia) {
      turmasComInconsistencia += 1;
      continue;
    }
    for (const doc of monitoringDocs) {
      totalExpectedGradeEntries += doc.expectedGradeEntries;
      totalCompletedGradeEntries += doc.completedGradeEntries;
    }
  }

  return {
    turmasNoEscopo: monitoringByTurma.length,
    turmasComAoMenosUmRelatorio,
    turmasSemNenhumRelatorio,
    turmasComInconsistencia,
    totalExpectedGradeEntries,
    totalCompletedGradeEntries,
    percentualGeral: turmasComInconsistencia > 0
      ? null
      : calculateCompletionPercentage({
          expectedGradeEntries: totalExpectedGradeEntries,
          completedGradeEntries: totalCompletedGradeEntries,
        }),
  };
}

// Correção final da auditoria da reestruturação, seção 3: "a consolidação
// por área deve ser calculada a partir das disciplinas, nunca persistida
// como percentual redundante" — esta função é sempre recalculada em tempo
// real a partir das entradas de grade_entry_monitoring_disciplina, nunca
// gravada em nenhum documento. Entradas sem areaConhecimento (opcional)
// entram no grupo 'Sem área', nunca descartadas silenciosamente. Percentual
// sempre soma(realizados)/soma(esperados) da área inteira — nunca a média
// dos percentuais de cada disciplina (mesmo princípio de
// consolidateGradeEntryMonitoring/aggregateGradeEntriesForPeriod acima).
export interface DisciplineAreaAggregate {
  areaConhecimento: AreaConhecimento | 'Sem área';
  disciplinasNoEscopo: number;
  totalExpectedGradeEntries: number;
  totalCompletedGradeEntries: number;
  percentualGeral: number | null;
}

export function consolidateGradeEntryMonitoringDisciplineByArea(
  entries: readonly GradeEntryMonitoringByDiscipline[]
): DisciplineAreaAggregate[] {
  const byArea = new Map<string, GradeEntryMonitoringByDiscipline[]>();
  for (const entry of entries) {
    const key = entry.areaConhecimento ?? 'Sem área';
    const list = byArea.get(key) ?? [];
    list.push(entry);
    byArea.set(key, list);
  }
  return Array.from(byArea.entries())
    .map(([areaConhecimento, list]) => {
      const totalExpectedGradeEntries = list.reduce((sum, e) => sum + e.expectedGradeEntries, 0);
      const totalCompletedGradeEntries = list.reduce((sum, e) => sum + e.completedGradeEntries, 0);
      return {
        areaConhecimento: areaConhecimento as AreaConhecimento | 'Sem área',
        disciplinasNoEscopo: list.length,
        totalExpectedGradeEntries,
        totalCompletedGradeEntries,
        percentualGeral: calculateCompletionPercentage({ expectedGradeEntries: totalExpectedGradeEntries, completedGradeEntries: totalCompletedGradeEntries }),
      };
    })
    .sort((a, b) => a.areaConhecimento.localeCompare(b.areaConhecimento));
}
