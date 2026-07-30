// Fase 2C — revisão do PR #15: gerador puro das opções do seletor de ano
// letivo de NotasView. currentYear é sempre injetado explicitamente nestes
// testes (nunca dependendo do relógio real da máquina) para confirmar que
// o módulo não fica "preso" em um ano fixo (ex.: 2026) conforme o tempo
// passa — ver também tests/notasView.component.test.tsx para o seletor
// renderizado de verdade com um ano do sistema simulado.
import { describe, expect, it } from 'vitest';
import { buildAnoLetivoOptions } from '../src/lib/anoLetivoOptions';

describe('buildAnoLetivoOptions', () => {
  it('retorna [anterior, corrente, seguinte] para o ano injetado', () => {
    expect(buildAnoLetivoOptions(2026)).toEqual([2025, 2026, 2027]);
  });

  it('nunca fica preso em 2026 — acompanha qualquer ano injetado', () => {
    expect(buildAnoLetivoOptions(2030)).toEqual([2029, 2030, 2031]);
    expect(buildAnoLetivoOptions(1999)).toEqual([1998, 1999, 2000]);
  });

  it('sem argumento, usa o ano corrente real da máquina', () => {
    const expectedCurrentYear = new Date().getFullYear();
    expect(buildAnoLetivoOptions()).toEqual([expectedCurrentYear - 1, expectedCurrentYear, expectedCurrentYear + 1]);
  });
});
