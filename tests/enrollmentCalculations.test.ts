// Fase 2A — cálculos puros de matrícula mensal (ver src/lib/enrollmentCalculations.ts).
// Sem Firebase, sem I/O.
import { describe, expect, it } from 'vitest';
import {
  calculateAccumulatedTotals,
  calculateAverageStudentsPerClass,
  calculateCurrentSchoolEnrollmentCoverage,
  calculateEnrollmentVariation,
  calculateMatriculaFimMes,
  calculateUltimaAtualizacao,
  countActiveTurmas,
  describeCoverageStatus,
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

describe('calculateCurrentSchoolEnrollmentCoverage', () => {
  // 10 turmas ativas, t1..t10 — usado nos testes A/B que falam explicitamente
  // em "dez turmas" (seção 7 do plano).
  const dezTurmasAtivas = Array.from({ length: 10 }, (_, i) => ({ id: `t${i + 1}`, ativa: true }));

  it('A. uma de dez turmas possui snapshot → resultado incompleto (nunca total parcial como total)', () => {
    const snapshots: SnapshotLike[] = [{ turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 }];
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, dezTurmasAtivas);
    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
    expect(result.coveredClassCount).toBe(1);
    expect(result.activeClassCount).toBe(10);
    expect(result.partialTotal).toBe(31);
  });

  it('B. todas as turmas possuem snapshot → total completo', () => {
    const snapshots: SnapshotLike[] = dezTurmasAtivas.map((t, i) => ({
      turmaId: t.id, mesReferencia: '2026-03', matriculaFimMes: 30 + i,
    }));
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, dezTurmasAtivas);
    expect(result.complete).toBe(true);
    // soma de 30..39 = 345
    expect(result.total).toBe(345);
    expect(result.coveredClassCount).toBe(10);
  });

  it('C. snapshot em uma turma e matriculaAtual em outra → total completo por fallback', () => {
    const snapshots: SnapshotLike[] = [{ turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 }];
    const turmas = [
      { id: 't1', ativa: true, matriculaAtual: 999 }, // snapshot prevalece sobre matriculaAtual
      { id: 't2', ativa: true, matriculaAtual: 28 },
    ];
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmas);
    expect(result.complete).toBe(true);
    expect(result.total).toBe(31 + 28);
  });

  it('D. turma sem qualquer valor → total null e partialTotal disponível', () => {
    const snapshots: SnapshotLike[] = [{ turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 }];
    const turmas = [
      { id: 't1', ativa: true },
      { id: 't2', ativa: true }, // sem snapshot e sem matriculaAtual
    ];
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmas);
    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
    expect(result.partialTotal).toBe(31);
    expect(result.coveredClassCount).toBe(1);
    expect(result.activeClassCount).toBe(2);
  });

  it('E. turma inativa é ignorada (não conta como ativa nem entra na soma)', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      { turmaId: 't2', mesReferencia: '2026-03', matriculaFimMes: 999 },
    ];
    const turmas = [
      { id: 't1', ativa: true },
      { id: 't2', ativa: false },
    ];
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmas);
    expect(result.complete).toBe(true);
    expect(result.total).toBe(31);
    expect(result.activeClassCount).toBe(1);
  });

  it('F. fevereiro e março da mesma turma contam apenas março', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 30 },
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
    ];
    const turmas = [{ id: 't1', ativa: true }];
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmas);
    expect(result.total).toBe(31);
  });

  it('G. correção posterior de fevereiro não substitui março', () => {
    const snapshots: SnapshotLike[] = [
      { turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 },
      // "corrigido" depois, mas é um mês mais antigo — não deve vencer março.
      { turmaId: 't1', mesReferencia: '2026-02', matriculaFimMes: 999 },
    ];
    const turmas = [{ id: 't1', ativa: true }];
    const result = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmas);
    expect(result.total).toBe(31);
  });

  it('H. cobertura 0 de 0 não é apresentada como zero confirmado', () => {
    const result = calculateCurrentSchoolEnrollmentCoverage([], []);
    expect(result.activeClassCount).toBe(0);
    expect(result.coveredClassCount).toBe(0);
    expect(result.complete).toBe(false);
    expect(result.total).toBeNull();
  });

  it('I. média e variação não são calculadas a partir de uma cobertura incompleta', () => {
    const snapshots: SnapshotLike[] = [{ turmaId: 't1', mesReferencia: '2026-03', matriculaFimMes: 31 }];
    const turmas = [{ id: 't1', ativa: true }, { id: 't2', ativa: true }];
    const coverage = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmas);

    expect(coverage.complete).toBe(false);
    // matriculaAtual "oficial" da escola é coverage.total (null quando
    // incompleto) — nunca partialTotal. Alimentando isso nas funções de
    // média/variação, o resultado é sempre null, nunca calculado sobre
    // dado parcial.
    expect(calculateAverageStudentsPerClass(coverage.total, coverage.activeClassCount)).toBeNull();
    expect(calculateEnrollmentVariation(800, coverage.total)).toBeNull();
  });
});

describe('calculateUltimaAtualizacao', () => {
  it('não prioriza uma data antiga de school_year quando existe snapshot mais recente', () => {
    const schoolYear = { updatedAt: '2026-01-05T00:00:00.000Z', ultimaAtualizacao: '2026-01-05T00:00:00.000Z' };
    const snapshots = [{ updatedAt: '2026-03-10T12:00:00.000Z' }];
    expect(calculateUltimaAtualizacao(schoolYear, snapshots, [])).toBe('2026-03-10T12:00:00.000Z');
  });

  it('considera updatedAt das turmas quando é o mais recente', () => {
    const schoolYear = { updatedAt: '2026-01-05T00:00:00.000Z' };
    const snapshots = [{ updatedAt: '2026-02-01T00:00:00.000Z' }];
    const turmas = [{ updatedAt: '2026-04-01T00:00:00.000Z' }];
    expect(calculateUltimaAtualizacao(schoolYear, snapshots, turmas)).toBe('2026-04-01T00:00:00.000Z');
  });

  it('usa school_year quando é realmente o mais recente', () => {
    const schoolYear = { updatedAt: '2026-05-01T00:00:00.000Z' };
    const snapshots = [{ updatedAt: '2026-02-01T00:00:00.000Z' }];
    expect(calculateUltimaAtualizacao(schoolYear, snapshots, [])).toBe('2026-05-01T00:00:00.000Z');
  });

  it('retorna null quando não há nenhuma data disponível', () => {
    expect(calculateUltimaAtualizacao(null, [], [])).toBeNull();
  });

  it('ignora turmas sem updatedAt (legadas)', () => {
    const snapshots = [{ updatedAt: '2026-02-01T00:00:00.000Z' }];
    const turmas = [{}, { updatedAt: undefined }];
    expect(calculateUltimaAtualizacao(null, snapshots, turmas)).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('describeCoverageStatus', () => {
  it('10 de 10 turmas — completo', () => {
    expect(describeCoverageStatus(10, 10)).toBe('completo');
  });

  it('6 de 10 turmas — parcial', () => {
    expect(describeCoverageStatus(6, 10)).toBe('parcial');
  });

  it('0 de 10 turmas — não informado (nunca "parcial" com cobertura zero)', () => {
    expect(describeCoverageStatus(0, 10)).toBe('nao_informado');
  });

  it('0 de 0 turmas — não informado (nunca "completo")', () => {
    expect(describeCoverageStatus(0, 0)).toBe('nao_informado');
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
