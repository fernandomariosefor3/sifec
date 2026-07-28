// Fase 2B — núcleo puro de cálculos de fluxo escolar (sem Firestore).
import { describe, expect, it } from 'vitest';
import {
  calculateTotalResultados,
  calculateSchoolFlowPercentuais,
  consolidateSchoolFlowResults,
  hasFlowResultDivergence,
} from '../src/lib/schoolFlowCalculations';

describe('calculateTotalResultados', () => {
  it('soma aprovados + reprovados + abandono', () => {
    expect(calculateTotalResultados({ aprovados: 700, reprovados: 80, abandono: 20 })).toBe(800);
  });

  it('total zero quando os três são zero', () => {
    expect(calculateTotalResultados({ aprovados: 0, reprovados: 0, abandono: 0 })).toBe(0);
  });
});

describe('calculateSchoolFlowPercentuais', () => {
  it('calcula os três percentuais a partir do total', () => {
    const pct = calculateSchoolFlowPercentuais({ aprovados: 80, reprovados: 15, abandono: 5 });
    expect(pct.percentualAprovacao).toBe(80);
    expect(pct.percentualReprovacao).toBe(15);
    expect(pct.percentualAbandono).toBe(5);
  });

  it('total zero → os três percentuais são zero, nunca NaN', () => {
    const pct = calculateSchoolFlowPercentuais({ aprovados: 0, reprovados: 0, abandono: 0 });
    expect(pct).toEqual({ percentualAprovacao: 0, percentualReprovacao: 0, percentualAbandono: 0 });
    expect(Number.isNaN(pct.percentualAprovacao)).toBe(false);
  });

  it('mantém o cálculo exato (sem arredondamento) — arredondar é responsabilidade só da exibição', () => {
    const pct = calculateSchoolFlowPercentuais({ aprovados: 1, reprovados: 1, abandono: 1 });
    expect(pct.percentualAprovacao).toBeCloseTo(33.333333, 5);
    expect(pct.percentualAprovacao.toFixed(0)).not.toBe(String(pct.percentualAprovacao));
  });
});

describe('consolidateSchoolFlowResults', () => {
  it('soma os totais brutos de todas as escolas do conjunto', () => {
    const consolidated = consolidateSchoolFlowResults([
      { aprovados: 100, reprovados: 10, abandono: 0 },
      { aprovados: 50, reprovados: 40, abandono: 10 },
    ]);
    expect(consolidated.aprovados).toBe(150);
    expect(consolidated.reprovados).toBe(50);
    expect(consolidated.abandono).toBe(10);
    expect(consolidated.totalResultados).toBe(210);
    expect(consolidated.escolasComResultado).toBe(2);
  });

  it('percentual geral vem dos TOTAIS consolidados, não da média simples dos percentuais por escola', () => {
    // Escola A: 100% aprovação (10 de 10). Escola B: 0% aprovação (0 de 990).
    // Média simples dos percentuais seria 50% — errado e enganoso aqui.
    // Pelos totais consolidados: 10 aprovados em 1000 = 1%.
    const consolidated = consolidateSchoolFlowResults([
      { aprovados: 10, reprovados: 0, abandono: 0 },
      { aprovados: 0, reprovados: 990, abandono: 0 },
    ]);
    expect(consolidated.percentualAprovacao).toBe(1);
    expect(consolidated.percentualAprovacao).not.toBe(50);
  });

  it('conjunto vazio → todos os totais e percentuais são zero, escolasComResultado é zero', () => {
    const consolidated = consolidateSchoolFlowResults([]);
    expect(consolidated).toEqual({
      aprovados: 0,
      reprovados: 0,
      abandono: 0,
      totalResultados: 0,
      escolasComResultado: 0,
      percentualAprovacao: 0,
      percentualReprovacao: 0,
      percentualAbandono: 0,
    });
  });
});

describe('hasFlowResultDivergence', () => {
  it('sem matrícula de referência (null/undefined) nunca é divergência', () => {
    expect(hasFlowResultDivergence(100, null)).toBe(false);
    expect(hasFlowResultDivergence(100, undefined)).toBe(false);
  });

  it('total igual à matrícula de referência não é divergência', () => {
    expect(hasFlowResultDivergence(100, 100)).toBe(false);
  });

  it('total diferente da matrícula de referência é divergência', () => {
    expect(hasFlowResultDivergence(100, 95)).toBe(true);
    expect(hasFlowResultDivergence(95, 100)).toBe(true);
  });
});
