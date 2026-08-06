// Correção final da auditoria da reestruturação — seção 5: RankingEscola
// não pode ficar definido só dentro do arquivo de cálculo
// (src/lib/schoolRiskRanking.ts) quando é usado por componentes (
// SituationSchoolTable.tsx, ParecerBimestralView.tsx) — movido para uma
// fonte canônica única em src/types/, mesmo padrão já usado pelas demais
// coleções desta reestruturação (types/<domínio>.ts + lib/<domínio>Service.ts).
// lib/schoolRiskRanking.ts continua concentrando a lógica (RISK_WEIGHTS,
// cálculo, ordenação) — só os TIPOS moveram para cá.
export interface SchoolRiskBreakdown {
  schoolId: string;
  escolaNome: string;
  score: number;
  // Cada parcela do escore, para a interface poder explicar "por que essa
  // escola está nessa posição" em vez de mostrar só o número final.
  pontosInconsistencias: number;
  pontosPendencias: number;
  pontosFluxo: number;
  pontosNotas: number;
  pontosVisita: number;
  pontosQualidadeDados: number;
  // true quando a escola não tem cobertura de dados suficiente para uma
  // posição no ranking ser confiável — nunca recebe um score comparável às
  // demais nesse caso (ver hasInsufficientData em lib/schoolRiskRanking.ts).
  dadosInsuficientes: boolean;
}

// Nome pedido pela auditoria da reestruturação para o tipo de retorno do
// ranking — alias direto de SchoolRiskBreakdown (mesmo shape, nomes
// diferentes por compatibilidade com os dois contextos em que é usado:
// "escore detalhado de UMA escola" e "uma linha do ranking regional").
export type RankingEscola = SchoolRiskBreakdown;
