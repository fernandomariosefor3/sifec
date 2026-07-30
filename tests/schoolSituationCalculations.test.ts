// Fase 2D — núcleo puro de cálculos da Sala de Situação (sem Firestore).
import { describe, expect, it } from 'vitest';
import type { SchoolYear } from '../src/types/schoolYear';
import type { Turma } from '../src/types/classroom';
import type { EnrollmentSnapshot } from '../src/types/enrollment';
import type { SchoolFlowResult } from '../src/types/schoolFlow';
import type { StudentRosterEntry } from '../src/types/studentRoster';
import type { StudentBimesterGrade } from '../src/types/studentBimesterGrade';
import {
  calculateEnrollmentMovementIndicators,
  calculateFlowIndicators,
  calculateGradeFillIndicators,
  calculatePortfolioSituationSummary,
  calculateStructureIndicators,
  calculateVisitIndicators,
  combineDataQualityStates,
  filterVisitasForSchool,
  getExpectedMonthReferences,
} from '../src/lib/schoolSituationCalculations';
import type { SchoolSituation } from '../src/types/schoolSituation';

function buildSchoolYear(overrides: Partial<SchoolYear> = {}): SchoolYear {
  return {
    id: 'esc1_2026', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1', anoLetivo: 2026,
    matriculaInicial: 100, matriculaAtual: 98, quantidadeTurmasAtivas: 2, status: 'ativo',
    dataInicio: '2026-02-01', dataFim: null, ultimaAtualizacao: '2026-04-01T00:00:00.000Z',
    createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildTurma(overrides: Partial<Turma> = {}): Turma {
  return {
    id: 't1', escolaId: 'esc1', escolaNome: 'Escola 1', nome: 'Turma A', ano: '1º', periodo: 'Matutino',
    schoolId: 'esc1', anoLetivo: 2026, ativa: true, matriculaAtual: 30,
    ...overrides,
  };
}

function buildSnapshot(overrides: Partial<EnrollmentSnapshot> = {}): EnrollmentSnapshot {
  return {
    id: 'esc1_t1_2026-03', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1',
    turmaId: 't1', turmaNome: 'Turma A', anoLetivo: 2026, mesReferencia: '2026-03',
    matriculaInicioMes: 30, novasMatriculas: 2, transferenciasEntrada: 0, transferenciasSaida: 1,
    abandono: 0, outrasSaidas: 0, matriculaFimMes: 31, reviewStatus: 'manual',
    createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildFlowResult(overrides: Partial<SchoolFlowResult> = {}): SchoolFlowResult {
  return {
    id: 'esc1_2025', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1', anoLetivo: 2025,
    aprovados: 80, reprovados: 15, abandono: 5, status: 'confirmado',
    createdAt: '2025-12-01T00:00:00.000Z', updatedAt: '2025-12-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildRoster(overrides: Partial<StudentRosterEntry> = {}): StudentRosterEntry {
  return {
    id: 'esc1_2026_t1_s1', studentKey: 's1', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1',
    turmaId: 't1', turmaNome: 'Turma A', anoLetivo: 2026, studentName: 'Estudante Um', active: true,
    createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildGrade(overrides: Partial<StudentBimesterGrade> = {}): StudentBimesterGrade {
  return {
    id: 'esc1_2026_t1_s1_b1', rosterId: 'esc1_2026_t1_s1', studentKey: 's1',
    schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1', turmaId: 't1', turmaNome: 'Turma A',
    anoLetivo: 2026, bimestre: 1,
    scores: { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 },
    createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

describe('combineDataQualityStates', () => {
  it('inconsistente sempre vence, mesmo entre outros estados', () => {
    expect(combineDataQualityStates(['atualizado', 'inconsistente', 'sem_dados'])).toBe('inconsistente');
  });
  it('todos sem_dados permanece sem_dados', () => {
    expect(combineDataQualityStates(['sem_dados', 'sem_dados'])).toBe('sem_dados');
  });
  it('todos atualizado permanece atualizado', () => {
    expect(combineDataQualityStates(['atualizado', 'atualizado'])).toBe('atualizado');
  });
  it('mistura de sem_dados e atualizado vira incompleto', () => {
    expect(combineDataQualityStates(['sem_dados', 'atualizado'])).toBe('incompleto');
  });
  it('lista vazia é sem_dados', () => {
    expect(combineDataQualityStates([])).toBe('sem_dados');
  });
});

describe('getExpectedMonthReferences — nunca trata mês futuro como pendência', () => {
  it('ano letivo em curso: só até o mês corrente (inclusive)', () => {
    const now = new Date(Date.UTC(2026, 3, 15)); // abril de 2026 (mês 4)
    expect(getExpectedMonthReferences(2026, now)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });
  it('ano letivo já encerrado (anterior ao corrente): os 12 meses contam', () => {
    const now = new Date(Date.UTC(2026, 3, 15));
    expect(getExpectedMonthReferences(2025, now)).toHaveLength(12);
  });
  it('ano letivo futuro (posterior ao corrente): nenhum mês é esperado', () => {
    const now = new Date(Date.UTC(2026, 3, 15));
    expect(getExpectedMonthReferences(2027, now)).toEqual([]);
  });
});

describe('calculateStructureIndicators', () => {
  it('sem ano letivo configurado e sem turmas → sem_dados', () => {
    const result = calculateStructureIndicators(null, []);
    expect(result.dataQuality).toBe('sem_dados');
    expect(result.anoLetivoConfigurado).toBe(false);
    expect(result.matriculaInicial).toBeNull();
  });
  it('ano configurado, turmas ativas e matrícula inicial informada → atualizado', () => {
    const result = calculateStructureIndicators(buildSchoolYear(), [buildTurma(), buildTurma({ id: 't2' })]);
    expect(result.dataQuality).toBe('atualizado');
    expect(result.turmasAtivas).toBe(2);
    expect(result.mediaAlunosPorTurma).toBe(49); // matriculaAtual 98 / 2 turmas
  });
  it('ano configurado mas sem turma ativa → incompleto (nunca atualizado)', () => {
    const result = calculateStructureIndicators(buildSchoolYear(), [buildTurma({ ativa: false })]);
    expect(result.dataQuality).toBe('incompleto');
  });
  it('zero real de matrícula atual nunca é confundido com "não informado"', () => {
    const result = calculateStructureIndicators(buildSchoolYear({ matriculaAtual: 0 }), []);
    expect(result.matriculaAtual).toBe(0);
    expect(result.matriculaAtual).not.toBeNull();
  });
});

describe('calculateEnrollmentMovementIndicators', () => {
  const now = new Date(Date.UTC(2026, 2, 20)); // março de 2026

  it('sem school_year e sem snapshots → sem_dados', () => {
    const result = calculateEnrollmentMovementIndicators(null, [], [buildTurma()], 2026, now);
    expect(result.dataQuality).toBe('sem_dados');
    expect(result.matriculaInicial).toBeNull();
  });

  it('soma os seis campos de movimento de todos os snapshots', () => {
    const snapshots = [
      buildSnapshot({ mesReferencia: '2026-01', novasMatriculas: 3, abandono: 1 }),
      buildSnapshot({ mesReferencia: '2026-02', novasMatriculas: 2, transferenciasSaida: 1 }),
    ];
    const result = calculateEnrollmentMovementIndicators(buildSchoolYear(), snapshots, [buildTurma()], 2026, now);
    expect(result.novasMatriculas).toBe(5);
    expect(result.abandono).toBe(1);
    expect(result.transferenciasSaida).toBe(2); // 1 (padrão do fixture) em cada um dos dois snapshots
  });

  it('último mês preenchido é o maior mesReferencia entre os snapshots', () => {
    const snapshots = [buildSnapshot({ mesReferencia: '2026-01' }), buildSnapshot({ mesReferencia: '2026-03' })];
    const result = calculateEnrollmentMovementIndicators(buildSchoolYear(), snapshots, [buildTurma()], 2026, now);
    expect(result.ultimoMesPreenchido).toBe('2026-03');
  });

  it('mês futuro nunca conta como pendência', () => {
    // "agora" é março/2026: só jan/fev/mar são esperados, mesmo que o ano
    // letivo continue até dezembro.
    const turmas = [buildTurma()];
    const snapshots = [
      buildSnapshot({ mesReferencia: '2026-01' }),
      buildSnapshot({ mesReferencia: '2026-02' }),
      buildSnapshot({ mesReferencia: '2026-03' }),
    ];
    const result = calculateEnrollmentMovementIndicators(buildSchoolYear(), snapshots, turmas, 2026, now);
    expect(result.quantidadeMesesPendentes).toBe(0);
    expect(result.quantidadeMesesRegistrados).toBe(3);
  });

  it('mês esperado sem snapshot de alguma turma ativa conta como pendente', () => {
    const turmas = [buildTurma({ id: 't1' }), buildTurma({ id: 't2' })];
    // só t1 tem snapshot de março — t2 fica sem cobertura naquele mês.
    const snapshots = [buildSnapshot({ turmaId: 't1', mesReferencia: '2026-03' })];
    const result = calculateEnrollmentMovementIndicators(buildSchoolYear(), snapshots, turmas, 2026, now);
    expect(result.quantidadeMesesPendentes).toBeGreaterThan(0);
  });

  it('matrícula inicial null e sem snapshot → sem_dados mesmo com school_year existente sem matrícula', () => {
    const result = calculateEnrollmentMovementIndicators(
      buildSchoolYear({ matriculaInicial: null }), [], [buildTurma()], 2026, now
    );
    expect(result.dataQuality).toBe('sem_dados');
  });
});

describe('calculateFlowIndicators', () => {
  it('fluxo inexistente → nao_informado / sem_dados, nunca estimado', () => {
    const result = calculateFlowIndicators(null);
    expect(result.status).toBe('nao_informado');
    expect(result.dataQuality).toBe('sem_dados');
    expect(result.totalInformado).toBe(0);
  });
  it('fluxo em rascunho → incompleto (mesmo com números preenchidos)', () => {
    const result = calculateFlowIndicators(buildFlowResult({ status: 'rascunho' }));
    expect(result.status).toBe('rascunho');
    expect(result.dataQuality).toBe('incompleto');
  });
  it('fluxo confirmado com total > 0 → atualizado', () => {
    const result = calculateFlowIndicators(buildFlowResult({ status: 'confirmado' }));
    expect(result.status).toBe('confirmado');
    expect(result.dataQuality).toBe('atualizado');
  });
  it('fluxo confirmado com total zero → inconsistente', () => {
    const result = calculateFlowIndicators(buildFlowResult({ aprovados: 0, reprovados: 0, abandono: 0, status: 'confirmado' }));
    expect(result.dataQuality).toBe('inconsistente');
  });
  it('percentuais calculados a partir dos totais, nunca persistidos', () => {
    const result = calculateFlowIndicators(buildFlowResult({ aprovados: 80, reprovados: 15, abandono: 5 }));
    expect(result.percentualAprovacao).toBe(80);
    expect(result.percentualReprovacao).toBe(15);
    expect(result.percentualAbandono).toBe(5);
  });
  it('zero real de abandono aparece como 0, não como ausência', () => {
    const result = calculateFlowIndicators(buildFlowResult({ abandono: 0 }));
    expect(result.abandono).toBe(0);
  });
});

describe('calculateGradeFillIndicators', () => {
  it('notas agregadas nunca incluem nome de estudante', () => {
    const roster = [buildRoster()];
    const grades = [buildGrade()];
    const result = calculateGradeFillIndicators(roster, grades);
    expect(Object.keys(result)).not.toContain('studentName');
    expect(JSON.stringify(result)).not.toContain('Estudante Um');
  });

  it('estudante inativo fica fora dos indicadores', () => {
    const roster = [buildRoster({ studentKey: 's1', active: true }), buildRoster({ studentKey: 's2', id: 'esc1_2026_t1_s2', active: false })];
    const grades = [buildGrade({ rosterId: 'esc1_2026_t1_s1' })];
    const result = calculateGradeFillIndicators(roster, grades);
    expect(result.estudantesAtivos).toBe(1);
  });

  it('turma com todos os ativos completos conta como preenchimento completo', () => {
    const roster = [buildRoster()];
    const grades = [buildGrade()];
    const result = calculateGradeFillIndicators(roster, grades);
    expect(result.turmasComPreenchimentoCompleto).toBe(1);
    expect(result.turmasComPendencia).toBe(0);
  });

  it('turma com estudante sem notas conta como pendência, não como completa', () => {
    const roster = [buildRoster()];
    const result = calculateGradeFillIndicators(roster, []);
    expect(result.turmasComPendencia).toBe(1);
    expect(result.turmasComPreenchimentoCompleto).toBe(0);
    expect(result.semNotas).toBe(1);
  });

  it('sem estudantes ativos → sem_dados', () => {
    const result = calculateGradeFillIndicators([], []);
    expect(result.dataQuality).toBe('sem_dados');
    expect(result.estudantesAtivos).toBe(0);
  });
});

describe('calculateVisitIndicators / filterVisitasForSchool', () => {
  it('filtra visitas pelo nome normalizado da escola (tolerante a acento/caixa)', () => {
    const visitas = [
      { escola: 'EEMTI ANISIO TEIXEIRA ', data: '2026-03-01' },
      { escola: 'Outra Escola', data: '2026-03-02' },
    ];
    const filtered = filterVisitasForSchool(visitas, 'EEMTI Anísio Teixeira');
    expect(filtered).toHaveLength(1);
  });

  it('sem visita no ano → sem_dados', () => {
    const result = calculateVisitIndicators([], 2026);
    expect(result.semVisitaNoAno).toBe(true);
    expect(result.dataQuality).toBe('sem_dados');
    expect(result.dataUltimaVisita).toBeNull();
  });

  it('última visita é a data mais recente dentro do ano selecionado', () => {
    const visitas = [{ escola: 'Escola 1', data: '2026-01-10' }, { escola: 'Escola 1', data: '2026-05-20' }];
    const result = calculateVisitIndicators(visitas, 2026);
    expect(result.dataUltimaVisita).toBe('2026-05-20');
    expect(result.quantidadeVisitasNoAno).toBe(2);
  });

  it('visita de outro ano não conta', () => {
    const visitas = [{ escola: 'Escola 1', data: '2025-12-01' }];
    const result = calculateVisitIndicators(visitas, 2026);
    expect(result.quantidadeVisitasNoAno).toBe(0);
  });
});

describe('calculatePortfolioSituationSummary', () => {
  function buildSituation(overrides: Partial<SchoolSituation> = {}): SchoolSituation {
    return {
      schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1', anoLetivo: 2026,
      estrutura: { turmasCadastradas: 2, turmasAtivas: 2, matriculaInicial: 50, matriculaAtual: 48, mediaAlunosPorTurma: 24, anoLetivoConfigurado: true, dataQuality: 'atualizado' },
      matricula: { matriculaInicial: 50, novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0, abandono: 0, outrasSaidas: 0, matriculaFinalCalculada: 48, ultimoMesPreenchido: '2026-03', quantidadeMesesRegistrados: 3, quantidadeMesesPendentes: 0, dataQuality: 'atualizado' },
      fluxo: { aprovados: 40, reprovados: 5, abandono: 3, totalInformado: 48, percentualAprovacao: 83.3, percentualReprovacao: 10.4, percentualAbandono: 6.3, status: 'confirmado', dataQuality: 'atualizado' },
      notas: null,
      visitas: { quantidadeVisitasNoAno: 1, dataUltimaVisita: '2026-03-01', semVisitaNoAno: false, dataQuality: 'atualizado' },
      pendencias: [],
      inconsistencias: [],
      qualidadeGeral: 'atualizado',
      sourceFailures: [],
      ...overrides,
    };
  }

  it('consolida contagens simples da carteira', () => {
    const summary = calculatePortfolioSituationSummary([buildSituation(), buildSituation({ schoolId: 'esc2' })]);
    expect(summary.escolasAcompanhadas).toBe(2);
    expect(summary.turmasAtivas).toBe(4);
    expect(summary.matriculaAtual).toBe(96);
  });

  it('percentual de preenchimento de notas é null quando nenhuma escola teve notas carregadas', () => {
    const summary = calculatePortfolioSituationSummary([buildSituation({ notas: null })]);
    expect(summary.percentualPreenchimentoNotas).toBeNull();
  });

  it('percentual de preenchimento de notas é a média das escolas com notas carregadas', () => {
    const withGrades = buildSituation({
      notas: { estudantesAtivos: 10, completos: 10, parciais: 0, semNotas: 0, abaixoReferencia: 0, percentualPreenchimento: 100, turmasComPreenchimentoCompleto: 1, turmasComPendencia: 0, dataQuality: 'atualizado' },
    });
    const summary = calculatePortfolioSituationSummary([withGrades, buildSituation({ schoolId: 'esc2', notas: null })]);
    expect(summary.percentualPreenchimentoNotas).toBe(100);
  });

  it('conta escolas com pendências e com fluxo informado', () => {
    const comPendencia = buildSituation({
      pendencias: [{ type: 'fluxo_nao_informado', schoolId: 'esc1', message: 'x', period: '2026', sourceCollection: 'school_flow_results', resolutionAction: 'y' }],
    });
    const summary = calculatePortfolioSituationSummary([comPendencia, buildSituation({ schoolId: 'esc2' })]);
    expect(summary.escolasComPendencias).toBe(1);
    expect(summary.escolasComFluxoInformado).toBe(2);
  });
});
