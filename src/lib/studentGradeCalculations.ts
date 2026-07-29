// Fase 2C — cálculos puros de preenchimento de notas bimestrais. Sem
// import do Firebase (mesmo padrão de enrollmentCalculations.ts/
// schoolFlowCalculations.ts): média, percentual e estado de preenchimento
// NUNCA são persistidos — sempre recalculados a partir de scores. Não
// classifica estudante como aprovado/reprovado/retido — só monitora
// preenchimento (ver types/studentBimesterGrade.ts).
import type { BimesterScores } from '../types/studentBimesterGrade';

// Média de referência inicial para o monitoramento (seção 6 do plano) —
// nunca associada automaticamente a aprovação/reprovação.
export const REFERENCE_AVERAGE = 6.0;

const SCORE_KEYS: readonly (keyof BimesterScores)[] = [
  'linguaPortuguesa', 'matematica', 'cienciasNatureza', 'cienciasHumanas',
];
export const TOTAL_SUBJECTS = SCORE_KEYS.length;

export const EMPTY_SCORES: BimesterScores = {
  linguaPortuguesa: null,
  matematica: null,
  cienciasNatureza: null,
  cienciasHumanas: null,
};

// Nota vazia (null) nunca conta como preenchida; nota zero SEMPRE conta
// (vazio não é zero — seção 6 do plano).
export function countFilledScores(scores: BimesterScores): number {
  return SCORE_KEYS.filter(key => scores[key] != null).length;
}

// Sempre um dos cinco valores possíveis: 0, 25, 50, 75, 100 (quatro
// disciplinas fixas).
export function calculateFillPercentage(scores: BimesterScores): number {
  return (countFilledScores(scores) / TOTAL_SUBJECTS) * 100;
}

// Média só das notas PREENCHIDAS — null quando nenhuma nota foi informada
// (nunca 0, que seria uma média real e diferente de "sem dado").
export function calculatePartialAverage(scores: BimesterScores): number | null {
  const filled = SCORE_KEYS.map(key => scores[key]).filter((v): v is number => v != null);
  if (filled.length === 0) return null;
  return filled.reduce((sum, v) => sum + v, 0) / filled.length;
}

export type FillState = 'sem_notas' | 'parcial' | 'completo';

// sem_notas: zero notas preenchidas; completo: as quatro; parcial: 1-3.
export function determineFillState(scores: BimesterScores): FillState {
  const count = countFilledScores(scores);
  if (count === 0) return 'sem_notas';
  if (count === TOTAL_SUBJECTS) return 'completo';
  return 'parcial';
}

// Sinalização puramente informativa (nunca aprovação/reprovação): só
// dispara quando há PELO MENOS uma nota preenchida (nenhuma nota nunca é
// "abaixo da média" — é "sem notas") e a média das notas preenchidas fica
// abaixo da referência.
export function isBelowReferenceAverage(
  scores: BimesterScores,
  referenceAverage: number = REFERENCE_AVERAGE
): boolean {
  const average = calculatePartialAverage(scores);
  return average != null && average < referenceAverage;
}

export interface StudentFillEntry {
  studentKey: string;
  active: boolean;
  // null = nenhum documento de nota existe para este estudante/bimestre —
  // equivalente a EMPTY_SCORES para fins de cálculo.
  scores: BimesterScores | null;
}

export interface ConsolidatedFillStats {
  estudantesAtivos: number;
  completos: number;
  parciais: number;
  semNotas: number;
  abaixoReferencia: number;
  totalNotasPreenchidas: number;
  // total de notas preenchidas / (estudantes ativos × 4) × 100 — seção 12
  // do plano (indicador "percentual geral de preenchimento").
  percentualPreenchimento: number;
}

// Usada tanto para consolidar por turma quanto por escola — o chamador só
// decide quais entradas entram no conjunto (turma inteira, ou todas as
// turmas de uma escola). Estudantes inativos são SEMPRE excluídos daqui —
// nunca aparecem nos indicadores correntes, mas seu cadastro e notas
// anteriores continuam preservados em outro lugar (ver
// studentRosterService.ts).
export function consolidateStudentFill(
  entries: readonly StudentFillEntry[],
  referenceAverage: number = REFERENCE_AVERAGE
): ConsolidatedFillStats {
  const activeEntries = entries.filter(e => e.active);
  let completos = 0;
  let parciais = 0;
  let semNotas = 0;
  let abaixoReferencia = 0;
  let totalNotasPreenchidas = 0;

  for (const entry of activeEntries) {
    const scores = entry.scores ?? EMPTY_SCORES;
    totalNotasPreenchidas += countFilledScores(scores);
    switch (determineFillState(scores)) {
      case 'completo': completos += 1; break;
      case 'parcial': parciais += 1; break;
      case 'sem_notas': semNotas += 1; break;
    }
    if (isBelowReferenceAverage(scores, referenceAverage)) abaixoReferencia += 1;
  }

  const estudantesAtivos = activeEntries.length;
  const percentualPreenchimento = estudantesAtivos === 0
    ? 0
    : (totalNotasPreenchidas / (estudantesAtivos * TOTAL_SUBJECTS)) * 100;

  return { estudantesAtivos, completos, parciais, semNotas, abaixoReferencia, totalNotasPreenchidas, percentualPreenchimento };
}
