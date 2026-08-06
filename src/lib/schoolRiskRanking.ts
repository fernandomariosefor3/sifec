// Reestruturação SIFEC — Sala de Situação como RANKING de urgência/risco.
// Núcleo puro: nenhum import do Firebase, nenhuma escrita — só combina os
// indicadores que schoolSituationCalculations.ts já calcula em UM escore
// numérico comparável entre escolas, para ordenar (nunca para "julgar" uma
// escola isoladamente — ver conhecimento_sifec.md: o SIFEC não deve ser
// apresentado como ranqueamento punitivo, é ferramenta de priorização de
// acompanhamento).
//
// AVISO PERMANENTE (auditoria da reestruturação): este escore é um
// CRITÉRIO TÉCNICO PROVISÓRIO de apoio ao acompanhamento — nunca uma
// metodologia oficial validada pela SEFOR 3. Os pesos abaixo (RISK_WEIGHTS)
// são uma escolha inicial de engenharia, centralizada e documentada linha a
// linha exatamente para que a equipe pedagógica possa revisar/ajustar cada
// parcela sem precisar entender o código. A interface (SalaDeSituacaoView)
// exibe este mesmo aviso.
import type { DataQualityState, SchoolSituation } from '../types/schoolSituation';
import type { RankingEscola, SchoolRiskBreakdown } from '../types/schoolRiskRanking';

export type { RankingEscola, SchoolRiskBreakdown };

// Pesos centralizados e configuráveis — nunca espalhados como números
// soltos pelo código. Cada campo tem uma pontuação máxima documentada, para
// que o total (score) tenha um teto conhecido e comparável.
export const RISK_WEIGHTS = {
  // Inconsistência de dados é o sinal mais grave (registro duplicado, turma
  // de outra escola, etc.) — pesa mais que qualquer outro fator isolado.
  pontosPorInconsistencia: 10,
  // Cada pendência (matrícula não informada, turma sem relatório de notas
  // etc.) representa um item concreto de acompanhamento ainda em aberto.
  pontosPorPendencia: 3,
  // Fluxo só entra no escore quando o dado é confiável (dataQuality
  // 'atualizado') — nunca a partir de um fluxo sem_dados/indisponível/
  // inconsistente, que já é capturado por qualidadeDadosPenalidade abaixo.
  // Máximo teórico: 100% abandono → 200 pontos (multiplicador 2 sobre um
  // percentual de 0 a 100); reprovação pesa a metade disso.
  multiplicadorAbandono: 2,
  multiplicadorReprovacao: 1,
  // Notas: fonte indisponível pesa mais que um percentual real muito baixo
  // (ausência de dado é grave, mas não necessariamente pior que um dado
  // real ruim); nenhuma turma com relatório (percentual null) fica no meio.
  pontosNotasIndisponiveis: 20,
  pontosNotasSemPercentualCalculavel: 15,
  multiplicadorPercentualNotasFaltante: 0.5, // (100 - percentual) * 0.5 → máximo 50 pontos
  pontosSemVisitaNoAno: 8,
  // Penalidade por qualidade geral dos dados — independente dos pontos
  // específicos de fluxo/notas acima (uma escola pode ter fluxo/notas OK,
  // mas outra fonte com problema, refletido só aqui).
  qualidadeDadosPenalidade: {
    atualizado: 0,
    incompleto: 5,
    sem_dados: 10,
    inconsistente: 15,
    indisponivel: 20,
  } as Record<DataQualityState, number>,
  // Requisito da auditoria: "escola sem cobertura suficiente deve aparecer
  // como 'dados insuficientes'" — nunca com uma posição no ranking que
  // pareceria comparável às demais. Uma escola entra nesse estado quando a
  // qualidade geral já é 'indisponivel' (fonte central falhou) OU quando 3
  // ou mais das fontes específicas (schoolYear/turmas/snapshots/flow/
  // gradeEntryMonitoring/visitas) falharam ao carregar.
  minFalhasDeFontesParaDadosInsuficientes: 3,
} as const;

// "Dados insuficientes" nunca é decidido por um único campo ausente — exige
// ou a qualidade geral já classificada como 'indisponivel' pela Sala de
// Situação (fonte central falhou), ou múltiplas fontes específicas
// falhando ao mesmo tempo (ver minFalhasDeFontesParaDadosInsuficientes).
export function hasInsufficientData(situation: SchoolSituation): boolean {
  return situation.qualidadeGeral === 'indisponivel' ||
    situation.sourceFailures.length >= RISK_WEIGHTS.minFalhasDeFontesParaDadosInsuficientes;
}

export function calculateSchoolRiskBreakdown(situation: SchoolSituation): SchoolRiskBreakdown {
  const dadosInsuficientes = hasInsufficientData(situation);

  const pontosInconsistencias = situation.inconsistencias.length * RISK_WEIGHTS.pontosPorInconsistencia;
  const pontosPendencias = situation.pendencias.length * RISK_WEIGHTS.pontosPorPendencia;

  const pontosFluxo = situation.fluxo.dataQuality === 'atualizado'
    ? situation.fluxo.percentualAbandono * RISK_WEIGHTS.multiplicadorAbandono
      + situation.fluxo.percentualReprovacao * RISK_WEIGHTS.multiplicadorReprovacao
    : 0;

  const pontosNotas = situation.notas == null
    ? RISK_WEIGHTS.pontosNotasIndisponiveis
    : situation.notas.percentualPreenchimentoGeral == null
      ? RISK_WEIGHTS.pontosNotasSemPercentualCalculavel
      : (100 - situation.notas.percentualPreenchimentoGeral) * RISK_WEIGHTS.multiplicadorPercentualNotasFaltante;

  const pontosVisita = situation.visitas.semVisitaNoAno ? RISK_WEIGHTS.pontosSemVisitaNoAno : 0;
  const pontosQualidadeDados = RISK_WEIGHTS.qualidadeDadosPenalidade[situation.qualidadeGeral];

  // Dados insuficientes nunca recebem um score "real" (fica em zero — nunca
  // usado para posicionar a escola, já que ela sai do ranking numerado).
  const score = dadosInsuficientes
    ? 0
    : pontosInconsistencias + pontosPendencias + pontosFluxo + pontosNotas + pontosVisita + pontosQualidadeDados;

  return {
    schoolId: situation.schoolId,
    escolaNome: situation.escolaNome,
    score,
    pontosInconsistencias,
    pontosPendencias,
    pontosFluxo,
    pontosNotas,
    pontosVisita,
    pontosQualidadeDados,
    dadosInsuficientes,
  };
}

// Ordena por escore decrescente (maior risco primeiro, posição #1) — em
// caso de empate exato, ordena por nome (desempate estável e previsível,
// nunca pela ordem de chegada do array). Escolas com dados insuficientes
// sempre vão para o FIM da lista, nunca misturadas por score com as demais
// — quem consome este array (SituationSchoolTable/ParecerBimestralView)
// deve tratar dadosInsuficientes separadamente da posição numerada.
export function rankSchoolsByRisk(situations: readonly SchoolSituation[]): RankingEscola[] {
  return situations
    .map(calculateSchoolRiskBreakdown)
    .sort((a, b) => {
      if (a.dadosInsuficientes !== b.dadosInsuficientes) return a.dadosInsuficientes ? 1 : -1;
      return b.score - a.score || a.escolaNome.localeCompare(b.escolaNome);
    });
}
