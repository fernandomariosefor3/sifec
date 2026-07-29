// Fase 2C — núcleo puro de cálculos de preenchimento de notas bimestrais.
import { describe, expect, it } from 'vitest';
import {
  calculateFillPercentage,
  calculatePartialAverage,
  consolidateStudentFill,
  countFilledScores,
  determineFillState,
  isBelowReferenceAverage,
  REFERENCE_AVERAGE,
  type StudentFillEntry,
} from '../src/lib/studentGradeCalculations';
import type { BimesterScores } from '../src/types/studentBimesterGrade';

const EMPTY: BimesterScores = { linguaPortuguesa: null, matematica: null, cienciasNatureza: null, cienciasHumanas: null };

describe('countFilledScores', () => {
  it('zero notas preenchidas', () => {
    expect(countFilledScores(EMPTY)).toBe(0);
  });

  it('nota zero conta como preenchida (vazio não é zero)', () => {
    expect(countFilledScores({ ...EMPTY, linguaPortuguesa: 0 })).toBe(1);
  });

  it('quatro notas preenchidas', () => {
    expect(countFilledScores({ linguaPortuguesa: 5, matematica: 6, cienciasNatureza: 7, cienciasHumanas: 8 })).toBe(4);
  });
});

describe('calculateFillPercentage', () => {
  it('0%, 25%, 50%, 75%, 100% — os cinco valores possíveis com 4 disciplinas', () => {
    expect(calculateFillPercentage(EMPTY)).toBe(0);
    expect(calculateFillPercentage({ ...EMPTY, linguaPortuguesa: 5 })).toBe(25);
    expect(calculateFillPercentage({ ...EMPTY, linguaPortuguesa: 5, matematica: 6 })).toBe(50);
    expect(calculateFillPercentage({ ...EMPTY, linguaPortuguesa: 5, matematica: 6, cienciasNatureza: 7 })).toBe(75);
    expect(calculateFillPercentage({ linguaPortuguesa: 5, matematica: 6, cienciasNatureza: 7, cienciasHumanas: 8 })).toBe(100);
  });
});

describe('calculatePartialAverage', () => {
  it('média null quando nenhuma nota foi preenchida', () => {
    expect(calculatePartialAverage(EMPTY)).toBeNull();
  });

  it('média usa só as notas preenchidas (vazio nunca conta como zero)', () => {
    expect(calculatePartialAverage({ ...EMPTY, linguaPortuguesa: 8, matematica: 4 })).toBe(6);
  });

  it('nota zero entra na média normalmente', () => {
    expect(calculatePartialAverage({ ...EMPTY, linguaPortuguesa: 0, matematica: 10 })).toBe(5);
  });
});

describe('determineFillState', () => {
  it('sem_notas: zero notas preenchidas', () => {
    expect(determineFillState(EMPTY)).toBe('sem_notas');
  });

  it('parcial: uma, duas ou três notas preenchidas', () => {
    expect(determineFillState({ ...EMPTY, linguaPortuguesa: 5 })).toBe('parcial');
    expect(determineFillState({ ...EMPTY, linguaPortuguesa: 5, matematica: 6 })).toBe('parcial');
    expect(determineFillState({ ...EMPTY, linguaPortuguesa: 5, matematica: 6, cienciasNatureza: 7 })).toBe('parcial');
  });

  it('completo: as quatro notas preenchidas', () => {
    expect(determineFillState({ linguaPortuguesa: 5, matematica: 6, cienciasNatureza: 7, cienciasHumanas: 8 })).toBe('completo');
  });
});

describe('isBelowReferenceAverage', () => {
  it('sem nenhuma nota preenchida nunca é "abaixo da referência" (é "sem notas")', () => {
    expect(isBelowReferenceAverage(EMPTY)).toBe(false);
  });

  it('média das notas preenchidas abaixo de 6,0 sinaliza', () => {
    expect(isBelowReferenceAverage({ ...EMPTY, linguaPortuguesa: 4, matematica: 5 })).toBe(true);
  });

  it('média das notas preenchidas igual ou acima de 6,0 não sinaliza', () => {
    expect(isBelowReferenceAverage({ ...EMPTY, linguaPortuguesa: 6, matematica: 7 })).toBe(false);
    expect(isBelowReferenceAverage({ ...EMPTY, linguaPortuguesa: REFERENCE_AVERAGE })).toBe(false);
  });

  it('aceita uma referência customizada', () => {
    expect(isBelowReferenceAverage({ ...EMPTY, linguaPortuguesa: 7 }, 8)).toBe(true);
  });
});

describe('consolidateStudentFill', () => {
  function entry(overrides: Partial<StudentFillEntry> = {}): StudentFillEntry {
    return { studentKey: 'k1', active: true, scores: null, ...overrides };
  }

  it('consolida sem_notas/parcial/completo/abaixo da referência corretamente', () => {
    const stats = consolidateStudentFill([
      entry({ studentKey: 'a', scores: null }), // sem_notas
      entry({ studentKey: 'b', scores: { ...EMPTY, linguaPortuguesa: 8 } }), // parcial
      entry({ studentKey: 'c', scores: { linguaPortuguesa: 8, matematica: 8, cienciasNatureza: 8, cienciasHumanas: 8 } }), // completo, acima
      entry({ studentKey: 'd', scores: { linguaPortuguesa: 4, matematica: 4, cienciasNatureza: 4, cienciasHumanas: 4 } }), // completo, abaixo
    ]);
    expect(stats.estudantesAtivos).toBe(4);
    expect(stats.semNotas).toBe(1);
    expect(stats.parciais).toBe(1);
    expect(stats.completos).toBe(2);
    expect(stats.abaixoReferencia).toBe(1);
  });

  it('estudante inativo fica fora dos cálculos correntes', () => {
    const stats = consolidateStudentFill([
      entry({ studentKey: 'ativo', active: true, scores: { linguaPortuguesa: 4, matematica: 4, cienciasNatureza: 4, cienciasHumanas: 4 } }),
      entry({ studentKey: 'inativo', active: false, scores: { linguaPortuguesa: 10, matematica: 10, cienciasNatureza: 10, cienciasHumanas: 10 } }),
    ]);
    expect(stats.estudantesAtivos).toBe(1);
    expect(stats.completos).toBe(1);
    expect(stats.abaixoReferencia).toBe(1); // só o ativo, nunca o inativo com nota 10
  });

  it('percentual geral consolidado = total de notas preenchidas / (ativos × 4) × 100', () => {
    const stats = consolidateStudentFill([
      entry({ studentKey: 'a', scores: { linguaPortuguesa: 5, matematica: 5, cienciasNatureza: 5, cienciasHumanas: 5 } }), // 4 preenchidas
      entry({ studentKey: 'b', scores: { ...EMPTY, linguaPortuguesa: 5 } }), // 1 preenchida
    ]);
    // total preenchidas = 5, ativos = 2, 2*4 = 8 → 5/8*100 = 62.5
    expect(stats.totalNotasPreenchidas).toBe(5);
    expect(stats.percentualPreenchimento).toBeCloseTo(62.5, 5);
  });

  it('conjunto vazio (nenhum estudante ativo) não gera divisão por zero — percentual 0', () => {
    const stats = consolidateStudentFill([]);
    expect(stats.estudantesAtivos).toBe(0);
    expect(stats.percentualPreenchimento).toBe(0);
  });

  it('consolidação serve tanto para turma quanto para escola — mesma função, conjuntos diferentes', () => {
    const turmaA = [entry({ studentKey: 'a1', scores: { linguaPortuguesa: 5, matematica: 5, cienciasNatureza: 5, cienciasHumanas: 5 } })];
    const turmaB = [entry({ studentKey: 'b1', scores: null })];
    const statsTurmaA = consolidateStudentFill(turmaA);
    const statsEscolaInteira = consolidateStudentFill([...turmaA, ...turmaB]);
    expect(statsTurmaA.estudantesAtivos).toBe(1);
    expect(statsEscolaInteira.estudantesAtivos).toBe(2);
  });
});
