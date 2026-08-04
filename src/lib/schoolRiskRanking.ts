// Reestruturação SIFEC — Sala de Situação como RANKING de urgência/risco.
// Núcleo puro: nenhum import do Firebase, nenhuma escrita — só combina os
// indicadores que schoolSituationCalculations.ts já calcula em UM escore
// numérico comparável entre escolas, para ordenar (nunca para "julgar" uma
// escola isoladamente — ver conhecimento_sifec.md: o SIFEC não deve ser
// apresentado como ranqueamento punitivo, é ferramenta de priorização de
// acompanhamento).
//
// Pesos escolhidos para refletir dois eixos que pedem atenção da
// coordenadoria: risco PEDAGÓGICO (abandono, reprovação, notas não
// lançadas) e risco de QUALIDADE DE DADOS (pendências, inconsistências,
// ausência de visita). São uma escolha de engenharia inicial, documentada
// linha a linha — a equipe pedagógica da SEFOR 3 deve revisar/ajustar os
// pesos com base na prática real antes de tratar o ranking como definitivo.
import type { DataQualityState, SchoolSituation } from '../types/schoolSituation';

const DATA_QUALITY_PENALTY: Record<DataQualityState, number> = {
  atualizado: 0,
  incompleto: 5,
  sem_dados: 10,
  inconsistente: 15,
  indisponivel: 20,
};

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
}

export function calculateSchoolRiskBreakdown(situation: SchoolSituation): SchoolRiskBreakdown {
  // Inconsistência de dados é o sinal mais grave (registro duplicado, turma
  // de outra escola, etc.) — pesa mais que qualquer outro fator.
  const pontosInconsistencias = situation.inconsistencias.length * 10;

  // Cada pendência (matrícula não informada, turma sem relatório de notas,
  // etc.) representa um item concreto de acompanhamento ainda em aberto.
  const pontosPendencias = situation.pendencias.length * 3;

  // Fluxo só entra no escore quando o dado é confiável (dataQuality
  // 'atualizado') — nunca pontua abandono/reprovação a partir de um fluxo
  // 'sem_dados'/'indisponivel'/'inconsistente', que já é capturado por
  // pontosQualidadeDados abaixo.
  const pontosFluxo = situation.fluxo.dataQuality === 'atualizado'
    ? situation.fluxo.percentualAbandono * 2 + situation.fluxo.percentualReprovacao
    : 0;

  // Notas: quanto menor o percentual de lançamentos realizados, maior o
  // risco. Quando a fonte falhou (`notas === null`) ou não há nenhuma turma
  // com relatório (percentual null), trata como risco alto mas não máximo —
  // ausência de dado é grave, mas não necessariamente pior que uma escola
  // com dado real e percentual muito baixo.
  const pontosNotas = situation.notas == null
    ? 20
    : situation.notas.percentualPreenchimentoGeral == null
      ? 15
      : (100 - situation.notas.percentualPreenchimentoGeral) * 0.5;

  const pontosVisita = situation.visitas.semVisitaNoAno ? 8 : 0;

  const pontosQualidadeDados = DATA_QUALITY_PENALTY[situation.qualidadeGeral];

  const score = pontosInconsistencias + pontosPendencias + pontosFluxo + pontosNotas + pontosVisita + pontosQualidadeDados;

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
  };
}

// Ordena por escore decrescente (maior risco primeiro, posição #1) — em
// caso de empate exato, ordena por nome (desempate estável e prévisível,
// nunca pela ordem de chegada do array).
export function rankSchoolsByRisk(situations: readonly SchoolSituation[]): SchoolRiskBreakdown[] {
  return situations
    .map(calculateSchoolRiskBreakdown)
    .sort((a, b) => b.score - a.score || a.escolaNome.localeCompare(b.escolaNome));
}
