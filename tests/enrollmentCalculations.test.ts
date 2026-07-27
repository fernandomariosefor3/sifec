// Fase 2A — cálculos puros de matrícula mensal (ver src/lib/enrollmentCalculations.ts).
// Sem Firebase, sem I/O.
import { describe, expect, it } from 'vitest';
import {
  calculateAccumulatedTotals,
  calculateAverageStudentsPerClass,
  calculateCurrentSchoolEnrollmentFromSnapshots,
  calculateEnrollmentVariation,
  calculateMatriculaFimMes,
  calculateSchoolMatriculaAtual,
  countActiveTurmas,
  formatEnrollmentValue,
  getLatestSnapshotPerClass,
  hasEnrollmentDivergence,
  isMonthWithinSchoolYear,
  isNonNegativeInteger,
  isValidEnrollmentMovement,
  isValidMonthReference,
  suggestMatriculaInicioMes,
  type EnrollmentMonthMovement,
  type SnapshotLike,
} from '../src/lib/enrollmentCalculations';

const baseMovement: EnrollmentMonthMovement = {
  matriculaInicioMes: 30,
  novasMatriculas: 3,
  transferenciasEntrada: 1,
  transferenciasSaida: 2,
  abandono: 1,
  outrasSaidas: 0,
};

describe('isNonNegativeInteger', () => {
  it('aceita inteiros maiores ou iguais a zero', () => {
    expect(isNonNegativeInteger(0)).toBe(true);
    expect(isNonNegativeInteger(42)).toBe(true);
  });

  it('rejeita números negativos', () => {
    expect(isNonNegativeInteger(-1)).toBe(false);
  });

  it('rejeita números decimais', () => {
    expect(isNonNegativeInteger(3.5)).toBe(false);
  });

  it('rejeita valores que não são number', () => {
    expect(isNonNegativeInteger('10')).toBe(false);
    expect(isNonNegativeInteger(NaN)).toBe(false);
    expect(isNonNegativeInteger(undefined)).toBe(false);
  });
});

describe('isValidMonthReference', () => {
  it('aceita YYYY-MM válido', () => {
    expect(isValidMonthReference('2026-03')).toBe(true);
    expect(isValidMonthReference('2026-01')).toBe(true);
    expect(isValidMonthReference('2026-12')).toBe(true);
  });

  it('rejeita mês fora do intervalo 01-12', () => {
    expect(isValidMonthReference('2026-00')).toBe(false);
    expect(isValidMonthReference('2026-13')).toBe(false);
  });

  it('rejeita formatos fora do padrão', () => {
    expect(isValidMonthReference('2026-3')).toBe(false);
    expect(isValidMonthReference('03-2026')).toBe(false);
    expect(isValidMonthReference('2026/03')).toBe(false);
  });
});

describe('isMonthWithinSchoolYear', () => {
  it('aceita mês do mesmo ano letivo', () => {
    expect(isMonthWithinSchoolYear('2026-03', 2026)).toBe(true);
  });

  it('rejeita mês de um ano letivo diferente', () => {
    expect(isMonthWithinSchoolYear('2027-03', 2026)).toBe(false);
  });

  it('rejeita quando o formato do mês já é inválido', () => {
    expect(isMonthWithinSchoolYear('03-2026', 2026)).toBe(false);
  });
});

describe('isValidEnrollmentMovement', () => {
  it('aceita um movimento com todos os campos inteiros >= 0', () => {
    expect(isValidEnrollmentMovement(baseMovement)).toBe(true);
  });

  it('rejeita quando qualquer campo é negativo', () => {
    expect(isValidEnrollmentMovement({ ...baseMovement, abandono: -1 })).toBe(false);
  });

  it('rejeita quando qualquer campo é decimal', () => {
    expect(isValidEnrollmentMovement({ ...baseMovement, novasMatriculas: 2.5 })).toBe(false);
  });
});

describe('calculateMatriculaFimMes', () => {
  it('calcula matrícula final = início + entradas - saídas', () => {
    // 30 + 3 + 1 - 2 - 1 - 0 = 31
    expect(calculateMatriculaFimMes(baseMovement)).toBe(31);
  });

  it('nunca desce abaixo de zero só porque o resultado matemático seria negativo (não trunca, só calcula)', () => {
    const movement: EnrollmentMonthMovement = {
      matriculaInicioMes: 1,
      novasMatriculas: 0,
      transferenciasEntrada: 0,
      transferenciasSaida: 1,
      abandono: 1,
      outrasSaidas: 0,
    };
    expect(calculateMatriculaFimMes(movement)).toBe(-1);
  });
});

describe('hasEnrollmentDivergence', () => {
  it('não há divergência quando a matrícula final bate com o cálculo', () => {
    expect(hasEnrollmentDivergence(baseMovement, 31)).toBe(false);
  });

  it('sinaliza divergência quando a matrícula final informada diverge do cálculo', () => {
    expect(hasEnrollmentDivergence(baseMovement, 99)).toBe(true);
  });
});

describe('countActiveTurmas', () => {
  it('conta turmas legadas sem o campo ativa como ativas por padrão', () => {
    expect(countActiveTurmas([{}, {}, {}])).toBe(3);
  });

  it('exclui só as turmas com ativa: false explícito', () => {
    expect(countActiveTurmas([{ ativa: true }, { ativa: false }, {}])).toBe(2);
  });
});

describe('calculateAverageStudentsPerClass', () => {
  it('calcula a média quando há turmas ativas e matrícula conhecida', () => {
    expect(calculateAverageStudentsPerClass(120, 4)).toBe(30);
  });

  it('retorna null quando não há turmas ativas (nunca divide por zero)', () => {
    expect(calculateAverageStudentsPerClass(120, 0)).toBeNull();
  });

  it('retorna null quando a matrícula atual ainda não é conhecida', () => {
    expect(calculateAverageStudentsPerClass(null, 4)).toBeNull();
  });
});

describe('calculateEnrollmentVariation', () => {
  it('calcula a diferença entre matrícula atual e inicial', () => {
    expect(calculateEnrollmentVariation(800, 812)).toBe(12);
  });

  it('retorna null quando a matrícula inicial ainda não foi informada', () => {
    expect(calculateEnrollmentVariation(null, 812)).toBeNull();
  });

  it('retorna null quando a matrícula atual ainda não foi informada', () => {
    expect(calculateEnrollmentVariation(800, null)).toBeNull();
  });
});

describe('calculateAccumulatedTotals', () => {
  it('soma entradas e saídas de vários snapshots mensais', () => {
    const totals = calculateAccumulatedTotals([
      baseMovement,
      { ...baseMovement, novasMatriculas: 5, transferenciasSaida: 0 },
    ]);
    // entradas: (3+1) + (5+1) = 10 | saídas: (2+1+0) + (0+1+0) = 4
    expect(totals).toEqual({ entradasAcumuladas: 10, saidasAcumuladas: 4 });
  });

  it('retorna zero para uma lista vazia', () => {
    expect(calculateAccumulatedTotals([])).toEqual({ entradasAcumuladas: 0, saidasAcumuladas: 0 });
  });
});

describe('calculateSchoolMatriculaAtual', () => {
  it('soma a matrícula atual das turmas ativas conhecidas', () => {
    expect(
      calculateSchoolMatriculaAtual([
        { ativa: true, matriculaAtual: 30 },
        { ativa: true, matriculaAtual: 28 },
      ])
    ).toBe(58);
  });

  it('ignora turmas inativas na soma', () => {
    expect(
      calculateSchoolMatriculaAtual([
        { ativa: true, matriculaAtual: 30 },
        { ativa: false, matriculaAtual: 999 },
      ])
    ).toBe(30);
  });

  it('retorna null quando nenhuma turma ativa tem matrícula conhecida', () => {
    expect(calculateSchoolMatriculaAtual([{ ativa: true }, { ativa: false, matriculaAtual: 10 }])).toBeNull();
  });
});

describe('getLatestSnapshotPerClass', () => {
  it('fevereiro e março da mesma turma — retém só março (o mais recente)', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 30 },
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
    ];
    const result = getLatestSnapshotPerClass(snapshots);
    expect(result.size).toBe(1);
    expect(result.get('t1')?.mesReferencia).toBe('2026-03');
    expect(result.get('t1')?.matriculaFimMes).toBe(31);
  });

  it('correção de mês antigo (gravada depois) não substitui o mês mais recente', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      // Chega DEPOIS no array, mas é um mês mais antigo — não deve vencer.
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 99 },
    ];
    const result = getLatestSnapshotPerClass(snapshots);
    expect(result.get('t1')?.mesReferencia).toBe('2026-03');
    expect(result.get('t1')?.matriculaFimMes).toBe(31);
  });

  it('turmas diferentes mantêm seus próprios snapshots mais recentes', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      { turmaId: 't2', mesReferencia: '2026-02', matriculaFimMes: 28 },
    ];
    const result = getLatestSnapshotPerClass(snapshots);
    expect(result.size).toBe(2);
    expect(result.get('t1')?.matriculaFimMes).toBe(31);
    expect(result.get('t2')?.matriculaFimMes).toBe(28);
  });
});

describe('suggestMatriculaInicioMes', () => {
  it('sugere matriculaFimMes do mês anterior mais recente da mesma turma', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 30 },
    ];
    expect(suggestMatriculaInicioMes(snapshots, '2026-03')).toBe(30);
  });

  it('retorna null quando não há mês anterior lançado', () => {
    expect(suggestMatriculaInicioMes([], '2026-02')).toBeNull();
  });

  it('ignora meses futuros ou iguais ao selecionado', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      { turmaId: 't1', mesReferencia: '2026-04', matriculaFimMes: 32 },
    ];
    expect(suggestMatriculaInicioMes(snapshots, '2026-03')).toBeNull();
  });

  it('usa o mês anterior mais recente quando há vários lançados', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-01', matriculaFimMes: 28 },
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 30 },
    ];
    expect(suggestMatriculaInicioMes(snapshots, '2026-03')).toBe(30);
  });
});

describe('calculateCurrentSchoolEnrollmentFromSnapshots', () => {
  it('fevereiro e março da mesma turma contam somente março', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 30 },
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
    ];
    const turmas = [{ id: 't1', ativa: true }];
    expect(calculateCurrentSchoolEnrollmentFromSnapshots(snapshots, turmas)).toBe(31);
  });

  it('duas turmas somam seus snapshots mais recentes', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      { turmaId: 't2', mesReferencia: '2026-03', matriculaFimMes: 28 },
    ];
    const turmas = [{ id: 't1', ativa: true }, { id: 't2', ativa: true }];
    expect(calculateCurrentSchoolEnrollmentFromSnapshots(snapshots, turmas)).toBe(59);
  });

  it('turma inativa não entra na soma mesmo com snapshot recente', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      { turmaId: 't2', mesReferencia: '2026-03', matriculaFimMes: 28 },
    ];
    const turmas = [{ id: 't1', ativa: true }, { id: 't2', ativa: false }];
    expect(calculateCurrentSchoolEnrollmentFromSnapshots(snapshots, turmas)).toBe(31);
  });

  it('correção de mês antigo não substitui o mês mais recente na soma final', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 999 },
    ];
    const turmas = [{ id: 't1', ativa: true }];
    expect(calculateCurrentSchoolEnrollmentFromSnapshots(snapshots, turmas)).toBe(31);
  });

  it('escola sem snapshots retorna null (fallback fica a cargo do chamador)', () => {
    const turmas = [{ id: 't1', ativa: true }];
    expect(calculateCurrentSchoolEnrollmentFromSnapshots([], turmas)).toBeNull();
  });

  it('escola sem nenhuma informação (sem snapshots e sem turmas) retorna null', () => {
    expect(calculateCurrentSchoolEnrollmentFromSnapshots([], [])).toBeNull();
  });
});

describe('formatEnrollmentValue', () => {
  it('mostra "Não informado" para null ou undefined — nunca zero', () => {
    expect(formatEnrollmentValue(null)).toBe('Não informado');
    expect(formatEnrollmentValue(undefined)).toBe('Não informado');
  });

  it('mostra o valor real, inclusive quando é zero', () => {
    expect(formatEnrollmentValue(0)).toBe('0');
    expect(formatEnrollmentValue(812)).toBe('812');
  });
});
