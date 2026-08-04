// Reestruturação SIFEC — Sala de Situação como ranking de urgência/risco.
// Núcleo puro, sem Firebase.
import { describe, expect, it } from 'vitest';
import { calculateSchoolRiskBreakdown, rankSchoolsByRisk } from '../src/lib/schoolRiskRanking';
import type { SchoolSituation } from '../src/types/schoolSituation';

function buildSituation(overrides: Partial<SchoolSituation> = {}): SchoolSituation {
  return {
    schoolId: 'esc1',
    codInep: '123',
    escolaNome: 'Escola 1',
    anoLetivo: 2026,
    estrutura: {
      turmasCadastradas: 5, turmasAtivas: 5, matriculaInicial: 100, matriculaAtual: 100,
      mediaAlunosPorTurma: 20, anoLetivoConfigurado: true, dataQuality: 'atualizado',
    },
    matricula: {
      matriculaInicial: 100, novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0,
      abandono: 0, outrasSaidas: 0, matriculaFinalCalculada: 100, ultimoMesPreenchido: '2026-03',
      quantidadeMesesRegistrados: 3, quantidadeMesesPendentes: 0, dataQuality: 'atualizado',
    },
    fluxo: {
      aprovados: 100, reprovados: 0, abandono: 0, totalInformado: 100,
      percentualAprovacao: 100, percentualReprovacao: 0, percentualAbandono: 0,
      status: 'confirmado', dataQuality: 'atualizado',
    },
    notas: {
      turmasCadastradas: 5, turmasComRelatorio: 5, turmasSemRelatorio: 0,
      turmasCompletas: 5, turmasParciais: 0, turmasSemPreenchimento: 0,
      expectedGradeEntries: 100, completedGradeEntries: 100,
      percentualPreenchimentoGeral: 100, dataQuality: 'atualizado',
    },
    visitas: { quantidadeVisitasNoAno: 1, dataUltimaVisita: '2026-02-01', semVisitaNoAno: false, dataQuality: 'atualizado' },
    pendencias: [],
    inconsistencias: [],
    qualidadeGeral: 'atualizado',
    sourceFailures: [],
    ...overrides,
  };
}

describe('calculateSchoolRiskBreakdown', () => {
  it('escola sem nenhum problema tem escore zero', () => {
    const result = calculateSchoolRiskBreakdown(buildSituation());
    expect(result.score).toBe(0);
  });

  it('inconsistência pesa mais que qualquer outro fator (10 pontos cada)', () => {
    const result = calculateSchoolRiskBreakdown(buildSituation({
      inconsistencias: [{ type: 'matricula_final_divergente', schoolId: 'esc1', message: 'x' }],
    }));
    expect(result.pontosInconsistencias).toBe(10);
    expect(result.score).toBe(10);
  });

  it('cada pendência soma 3 pontos', () => {
    const result = calculateSchoolRiskBreakdown(buildSituation({
      pendencias: [
        { type: 'fluxo_nao_informado', schoolId: 'esc1', message: 'x', period: null, sourceCollection: 'y', resolutionAction: 'z' },
        { type: 'escola_sem_visita', schoolId: 'esc1', message: 'x', period: null, sourceCollection: 'y', resolutionAction: 'z' },
      ],
    }));
    expect(result.pontosPendencias).toBe(6);
  });

  it('fluxo só pontua quando dataQuality é atualizado (nunca a partir de fluxo sem_dados/indisponível)', () => {
    const semDados = calculateSchoolRiskBreakdown(buildSituation({
      fluxo: { aprovados: 0, reprovados: 0, abandono: 0, totalInformado: 0, percentualAprovacao: 0, percentualReprovacao: 0, percentualAbandono: 50, status: 'nao_informado', dataQuality: 'sem_dados' },
    }));
    expect(semDados.pontosFluxo).toBe(0);

    const atualizado = calculateSchoolRiskBreakdown(buildSituation({
      fluxo: { aprovados: 50, reprovados: 30, abandono: 20, totalInformado: 100, percentualAprovacao: 50, percentualReprovacao: 30, percentualAbandono: 20, status: 'confirmado', dataQuality: 'atualizado' },
    }));
    // 20 (abandono) * 2 + 30 (reprovação) * 1 = 70
    expect(atualizado.pontosFluxo).toBe(70);
  });

  it('notas indisponíveis (null) pesam mais que percentual real muito baixo, mas ambos pontuam', () => {
    const indisponivel = calculateSchoolRiskBreakdown(buildSituation({ notas: null }));
    expect(indisponivel.pontosNotas).toBe(20);

    const baixo = calculateSchoolRiskBreakdown(buildSituation({
      notas: { turmasCadastradas: 5, turmasComRelatorio: 5, turmasSemRelatorio: 0, turmasCompletas: 0, turmasParciais: 5, turmasSemPreenchimento: 0, expectedGradeEntries: 100, completedGradeEntries: 10, percentualPreenchimentoGeral: 10, dataQuality: 'atualizado' },
    }));
    expect(baixo.pontosNotas).toBe(45); // (100 - 10) * 0.5
  });

  it('sem visita no ano soma 8 pontos', () => {
    const result = calculateSchoolRiskBreakdown(buildSituation({
      visitas: { quantidadeVisitasNoAno: 0, dataUltimaVisita: null, semVisitaNoAno: true, dataQuality: 'atualizado' },
    }));
    expect(result.pontosVisita).toBe(8);
  });

  it('qualidade geral pior soma mais pontos (indisponivel > inconsistente > sem_dados > incompleto > atualizado)', () => {
    const indisponivel = calculateSchoolRiskBreakdown(buildSituation({ qualidadeGeral: 'indisponivel' }));
    const incompleto = calculateSchoolRiskBreakdown(buildSituation({ qualidadeGeral: 'incompleto' }));
    expect(indisponivel.pontosQualidadeDados).toBeGreaterThan(incompleto.pontosQualidadeDados);
  });
});

describe('rankSchoolsByRisk', () => {
  it('ordena por escore decrescente — maior risco na posição #1', () => {
    const baixoRisco = buildSituation({ schoolId: 'baixo', escolaNome: 'Escola Baixo Risco' });
    const altoRisco = buildSituation({
      schoolId: 'alto', escolaNome: 'Escola Alto Risco',
      inconsistencias: [{ type: 'matricula_final_divergente', schoolId: 'alto', message: 'x' }],
    });
    const ranking = rankSchoolsByRisk([baixoRisco, altoRisco]);
    expect(ranking[0].schoolId).toBe('alto');
    expect(ranking[1].schoolId).toBe('baixo');
  });

  it('empate exato desempata por nome (ordem alfabética, nunca pela ordem de chegada)', () => {
    const b = buildSituation({ schoolId: 'b', escolaNome: 'Escola B' });
    const a = buildSituation({ schoolId: 'a', escolaNome: 'Escola A' });
    const ranking = rankSchoolsByRisk([b, a]);
    expect(ranking[0].schoolId).toBe('a');
    expect(ranking[1].schoolId).toBe('b');
  });

  it('lista vazia produz ranking vazio', () => {
    expect(rankSchoolsByRisk([])).toEqual([]);
  });
});
