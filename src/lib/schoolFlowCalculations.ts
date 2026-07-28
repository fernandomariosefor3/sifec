// Fase 2B — cálculos puros de fluxo escolar (aprovados/reprovados/abandono).
// Sem import do Firebase (mesmo padrão de enrollmentCalculations.ts):
// percentuais NUNCA são persistidos no Firestore, sempre recalculados a
// partir dos quantitativos brutos — arredondamento é só para exibição
// (toFixed no chamador), nunca aplicado ao cálculo em si.

export interface SchoolFlowCounts {
  aprovados: number;
  reprovados: number;
  abandono: number;
}

export function calculateTotalResultados(counts: SchoolFlowCounts): number {
  return counts.aprovados + counts.reprovados + counts.abandono;
}

export interface SchoolFlowPercentuais {
  percentualAprovacao: number;
  percentualReprovacao: number;
  percentualAbandono: number;
}

// total === 0 → os três percentuais são 0 (nunca NaN/Infinity de uma
// divisão por zero).
export function calculateSchoolFlowPercentuais(counts: SchoolFlowCounts): SchoolFlowPercentuais {
  const total = calculateTotalResultados(counts);
  if (total === 0) {
    return { percentualAprovacao: 0, percentualReprovacao: 0, percentualAbandono: 0 };
  }
  return {
    percentualAprovacao: (counts.aprovados / total) * 100,
    percentualReprovacao: (counts.reprovados / total) * 100,
    percentualAbandono: (counts.abandono / total) * 100,
  };
}

export interface SchoolFlowConsolidated extends SchoolFlowCounts, SchoolFlowPercentuais {
  totalResultados: number;
  escolasComResultado: number;
}

// Percentuais GERAIS calculados pelos totais consolidados (soma bruta de
// aprovados/reprovados/abandono de todas as escolas do conjunto), NUNCA
// pela média simples dos percentuais de cada escola — uma média simples
// distorceria o indicador regional quando as escolas têm tamanhos muito
// diferentes (ver seção 6.B do plano). O chamador decide quais escolas
// entram no conjunto — normalmente só as que já têm resultado informado,
// daí escolasComResultado == results.length.
export function consolidateSchoolFlowResults(results: readonly SchoolFlowCounts[]): SchoolFlowConsolidated {
  const totals = results.reduce<SchoolFlowCounts>(
    (acc, r) => ({
      aprovados: acc.aprovados + r.aprovados,
      reprovados: acc.reprovados + r.reprovados,
      abandono: acc.abandono + r.abandono,
    }),
    { aprovados: 0, reprovados: 0, abandono: 0 }
  );
  return {
    ...totals,
    ...calculateSchoolFlowPercentuais(totals),
    totalResultados: calculateTotalResultados(totals),
    escolasComResultado: results.length,
  };
}

// Divergência puramente informativa (seção 7 do plano — nunca bloqueia a
// gravação sozinha: transferências e outras movimentações podem explicar a
// diferença). null/undefined em matriculaReferencia significa "sem
// matrícula de referência disponível para comparar" — nunca tratado como
// divergência.
export function hasFlowResultDivergence(
  totalResultados: number,
  matriculaReferencia: number | null | undefined
): boolean {
  return matriculaReferencia != null && totalResultados !== matriculaReferencia;
}
