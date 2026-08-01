// Fase 2D — orquestração assíncrona da Sala de Situação. Cada serviço de
// fase anterior (school_years, enrollment_snapshots, school_flow_results,
// grade_entry_monitoring) é mockado diretamente — seu próprio comportamento
// de Firestore já é coberto pelos testes daquela fase; aqui o alvo é
// isolamento de falha por fonte/por escola, limite de concorrência e nunca
// consultar sem schoolId.
//
// Revisão do code review do PR #16: fetchSchoolSituation/
// fetchPortfolioSituations agora RECEBEM turmas/visitas já resolvidas como
// SourceLoadResult (nunca buscam a coleção inteira internamente — ver
// fetchTurmasForSchools/fetchVisitasForSchools, cobertos em
// tests/schoolSituationServiceFirestore.test.ts). listSchoolYearsForSchool/
// listSchoolFlowResultsForSchoolYear substituem getSchoolYear/
// getSchoolFlowResult (sem limit(1), para a duplicidade poder ser
// detectada — ver tests/schoolSituationInconsistencies.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turma } from '../src/types/classroom';
import type { SchoolSituationSourceFailure, SourceLoadResult } from '../src/types/schoolSituation';

const {
  mockListSchoolYears, mockListSnapshots, mockListFlowResults, mockListMonitoring,
} = vi.hoisted(() => ({
  mockListSchoolYears: vi.fn(),
  mockListSnapshots: vi.fn(),
  mockListFlowResults: vi.fn(),
  mockListMonitoring: vi.fn(),
}));

vi.mock('../src/lib/schoolYearService', () => ({ listSchoolYearsForSchool: mockListSchoolYears }));
vi.mock('../src/lib/enrollmentSnapshotService', () => ({ listEnrollmentSnapshotsForSchool: mockListSnapshots }));
vi.mock('../src/lib/schoolFlowService', () => ({ listSchoolFlowResultsForSchoolYear: mockListFlowResults }));
vi.mock('../src/lib/gradeEntryMonitoringService', () => ({ listGradeEntryMonitoringForSchool: mockListMonitoring }));

import {
  DEFAULT_SITUATION_CONCURRENCY,
  fetchPortfolioSituations,
  fetchSchoolSituation,
  mapWithConcurrencyLimit,
  type SchoolSituationSchoolInput,
} from '../src/lib/schoolSituationService';
import type { VisitLike } from '../src/lib/schoolSituationCalculations';

function school(id: string): SchoolSituationSchoolInput {
  return { id, nome: `Escola ${id}`, codInep: `INEP-${id}` };
}

function turma(id: string, schoolId: string): Turma {
  return { id, escolaId: schoolId, escolaNome: `Escola ${schoolId}`, nome: 'Turma A', ano: '1º', periodo: 'Matutino', schoolId, anoLetivo: 2026, ativa: true };
}

function ok<T>(data: T): SourceLoadResult<T> {
  return { status: 'success', data };
}

function fail<T>(source: string, message = 'falhou'): SourceLoadResult<T> {
  return { status: 'failure', error: { source, message } };
}

const NO_TURMAS = ok<readonly Turma[]>([]);
const NO_VISITAS = ok<readonly VisitLike[]>([]);

beforeEach(() => {
  mockListSchoolYears.mockReset().mockResolvedValue([]);
  mockListSnapshots.mockReset().mockResolvedValue([]);
  mockListFlowResults.mockReset().mockResolvedValue([]);
  mockListMonitoring.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchSchoolSituation — isolamento por schoolId', () => {
  it('consulta cada coleção escolar sempre filtrada pelo schoolId da escola', async () => {
    await fetchSchoolSituation(school('esc1'), ok([turma('t1', 'esc1')]), NO_VISITAS, 2026, { includeGrades: true, bimestre: 1 });

    expect(mockListSchoolYears).toHaveBeenCalledWith('esc1', 2026);
    expect(mockListSnapshots).toHaveBeenCalledWith('esc1', 2026);
    expect(mockListFlowResults).toHaveBeenCalledWith('esc1', 2026);
    expect(mockListMonitoring).toHaveBeenCalledWith('esc1', 2026, 1);
  });

  it('includeGrades=false nunca consulta grade_entry_monitoring (visão global sem escola selecionada)', async () => {
    const situation = await fetchSchoolSituation(school('esc1'), NO_TURMAS, NO_VISITAS, 2026, { includeGrades: false, bimestre: 1 });
    expect(mockListMonitoring).not.toHaveBeenCalled();
    expect(situation.notas).toBeNull();
  });
});

describe('fetchSchoolSituation — consolidação parcial quando uma fonte falha (seção 3/4 do code review)', () => {
  it('falha em UMA fonte não apaga os indicadores das outras', async () => {
    mockListFlowResults.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    mockListSchoolYears.mockResolvedValueOnce([{
      id: 'esc1_2026', schoolId: 'esc1', codInep: 'INEP-esc1', escolaNome: 'Escola esc1', anoLetivo: 2026,
      matriculaInicial: 100, matriculaAtual: 95, quantidadeTurmasAtivas: 1, status: 'ativo',
      dataInicio: '2026-02-01', dataFim: null, ultimaAtualizacao: null,
      createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    }]);

    const situation = await fetchSchoolSituation(school('esc1'), ok([turma('t1', 'esc1')]), NO_VISITAS, 2026, { includeGrades: false, bimestre: 1 });

    expect(situation.sourceFailures).toHaveLength(1);
    expect(situation.sourceFailures[0].source).toBe('school_flow_results');
    // Estrutura continua populada normalmente mesmo com fluxo tendo falhado.
    expect(situation.estrutura.matriculaInicial).toBe(100);
    expect(situation.estrutura.dataQuality).not.toBe('indisponivel');
    expect(situation.fluxo.status).toBe('nao_informado');
    expect(situation.fluxo.dataQuality).toBe('indisponivel');
  });

  it('falha de school_years vira dataQuality "indisponivel" — nunca "ano letivo não configurado" (nunca vira pendência falsa)', async () => {
    mockListSchoolYears.mockRejectedValueOnce(new Error('unavailable'));

    const situation = await fetchSchoolSituation(school('esc1'), NO_TURMAS, NO_VISITAS, 2026, { includeGrades: false, bimestre: 1 });

    expect(situation.estrutura.dataQuality).toBe('indisponivel');
    expect(situation.pendencias.some(p => p.type === 'ano_letivo_nao_configurado')).toBe(false);
    expect(situation.pendencias.some(p => p.type === 'matricula_inicial_nao_informada')).toBe(false);
  });

  it('falha de enrollment_snapshots vira matrícula "indisponivel" — nunca meses pendentes falsos', async () => {
    mockListSnapshots.mockRejectedValueOnce(new Error('unavailable'));

    const situation = await fetchSchoolSituation(school('esc1'), ok([turma('t1', 'esc1')]), NO_VISITAS, 2026, { includeGrades: false, bimestre: 1 });

    expect(situation.matricula.dataQuality).toBe('indisponivel');
    expect(situation.pendencias.some(p => p.type === 'registro_mensal_pendente')).toBe(false);
  });

  it('falha de turmas preserva fluxo (fonte independente) e marca estrutura/matrícula indisponíveis', async () => {
    mockListFlowResults.mockResolvedValueOnce([{
      id: 'esc1_2026', schoolId: 'esc1', codInep: 'INEP-esc1', escolaNome: 'Escola esc1', anoLetivo: 2026,
      aprovados: 10, reprovados: 2, abandono: 1, status: 'confirmado',
      createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    }]);

    const situation = await fetchSchoolSituation(school('esc1'), fail('turmas'), NO_VISITAS, 2026, { includeGrades: false, bimestre: 1 });

    expect(situation.sourceFailures.some(f => f.source === 'turmas')).toBe(true);
    expect(situation.estrutura.dataQuality).toBe('indisponivel');
    expect(situation.matricula.dataQuality).toBe('indisponivel');
    expect(situation.fluxo.status).toBe('confirmado');
    expect(situation.fluxo.dataQuality).not.toBe('indisponivel');
  });

  it('falha de visitas preserva estrutura, matrícula, fluxo e notas', async () => {
    mockListSchoolYears.mockResolvedValueOnce([{
      id: 'esc1_2026', schoolId: 'esc1', codInep: 'INEP-esc1', escolaNome: 'Escola esc1', anoLetivo: 2026,
      matriculaInicial: 100, matriculaAtual: 95, quantidadeTurmasAtivas: 1, status: 'ativo',
      dataInicio: '2026-01-01', dataFim: '2026-01-31', ultimaAtualizacao: null,
      createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    }]);
    mockListFlowResults.mockResolvedValueOnce([{
      id: 'esc1_2026', schoolId: 'esc1', codInep: 'INEP-esc1', escolaNome: 'Escola esc1', anoLetivo: 2026,
      aprovados: 10, reprovados: 2, abandono: 1, status: 'confirmado',
      createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    }]);

    const situation = await fetchSchoolSituation(school('esc1'), ok([turma('t1', 'esc1')]), fail('visitas'), 2026, { includeGrades: false, bimestre: 1 });

    expect(situation.sourceFailures.some(f => f.source === 'visitas')).toBe(true);
    expect(situation.visitas.dataQuality).toBe('indisponivel');
    expect(situation.pendencias.some(p => p.type === 'escola_sem_visita')).toBe(false);
    expect(situation.estrutura.matriculaInicial).toBe(100);
    expect(situation.fluxo.status).toBe('confirmado');
  });

  it('falha de grade_entry_monitoring: notas fica indisponível (null), sem pendência falsa de notas', async () => {
    mockListMonitoring.mockRejectedValueOnce(new Error('unavailable'));

    const situation = await fetchSchoolSituation(school('esc1'), NO_TURMAS, NO_VISITAS, 2026, { includeGrades: true, bimestre: 1 });

    expect(situation.notas).toBeNull();
    expect(situation.sourceFailures.some(f => f.source === 'grade_entry_monitoring')).toBe(true);
    expect(situation.pendencias.some(p => p.type === 'turmas_sem_relatorio_notas')).toBe(false);
    expect(situation.pendencias.some(p => p.type === 'turmas_com_preenchimento_parcial')).toBe(false);
    expect(situation.inconsistencias.some(i => i.type === 'grade_entry_monitoring_turma_outra_escola')).toBe(false);
  });

  // notas agora DEPENDE da lista de turmas para enumerar "turmas sem
  // relatório" (diferente do protótipo nominal anterior, onde roster/grades
  // carregavam a identidade da turma denormalizada). Uma falha em turmas
  // nunca pode fazer o indicador de notas parecer "sem_dados" só porque
  // turmasDoAno caiu no fallback vazio — precisa virar 'indisponivel',
  // mesmo com grade_entry_monitoring tendo carregado com sucesso.
  it('falha de turmas marca notas como indisponível, mesmo com grade_entry_monitoring tendo carregado com sucesso', async () => {
    mockListMonitoring.mockResolvedValueOnce([{
      id: 'esc1_2026_b1_t1', schoolId: 'esc1', codInep: 'INEP-esc1', escolaNome: 'Escola esc1',
      turmaId: 't1', turmaNome: 'Turma A', anoLetivo: 2026, bimestre: 1,
      totalStudents: 30, studentsWithCompleteGrades: 30, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
      expectedGradeEntries: 120, completedGradeEntries: 120, status: 'confirmado', sourceSystem: 'SIGE Escola',
      referenceDate: '2026-04-01', createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    }]);

    const situation = await fetchSchoolSituation(school('esc1'), fail('turmas'), NO_VISITAS, 2026, { includeGrades: true, bimestre: 1 });

    expect(situation.notas).not.toBeNull();
    expect(situation.notas?.dataQuality).toBe('indisponivel');
  });
});

describe('mapWithConcurrencyLimit', () => {
  it('nunca executa mais do que `limit` tarefas simultaneamente', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await mapWithConcurrencyLimit(items, 4, async item => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight -= 1;
      return item * 2;
    });

    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('preserva a ordem dos resultados, mapeada por índice (não pela ordem de conclusão)', async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrencyLimit(items, 2, async (item) => {
      await new Promise(resolve => setTimeout(resolve, item));
      return item;
    });
    expect(results).toEqual([30, 10, 20]);
  });

  it('lista vazia retorna vazio sem chamar o worker', async () => {
    const worker = vi.fn();
    const results = await mapWithConcurrencyLimit([], 4, worker);
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});

describe('fetchPortfolioSituations — carteira e visão global', () => {
  it('carteira de sete escolas: todas retornam com includeGrades quando solicitado', async () => {
    const schools = Array.from({ length: 7 }, (_, i) => school(`esc${i}`));
    const result = await fetchPortfolioSituations(schools, NO_TURMAS, {}, 2026, { includeGrades: true, bimestre: 1, concurrency: 4 });

    expect(Object.keys(result)).toHaveLength(7);
    expect(mockListMonitoring).toHaveBeenCalledTimes(7);
  });

  it('arquitetura universal: funciona igual para 1, 7 ou 56 escolas, sem hardcode', async () => {
    for (const count of [1, 7, 56]) {
      mockListSchoolYears.mockClear();
      const schools = Array.from({ length: count }, (_, i) => school(`esc${i}`));
      const result = await fetchPortfolioSituations(schools, NO_TURMAS, {}, 2026, { includeGrades: false, bimestre: 1 });
      expect(Object.keys(result)).toHaveLength(count);
      expect(mockListSchoolYears).toHaveBeenCalledTimes(count);
    }
  });

  it('usa DEFAULT_SITUATION_CONCURRENCY quando nenhuma concorrência é informada', () => {
    expect(DEFAULT_SITUATION_CONCURRENCY).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_SITUATION_CONCURRENCY).toBeLessThanOrEqual(5);
  });

  it('falha isolada em UMA escola do lote não afeta as demais', async () => {
    mockListFlowResults.mockImplementation(async (schoolId: string) => {
      if (schoolId === 'esc-falha') throw new Error('Erro simulado');
      return [];
    });

    const schools = [school('esc-ok'), school('esc-falha')];
    const result = await fetchPortfolioSituations(schools, NO_TURMAS, {}, 2026, { includeGrades: false, bimestre: 1 });

    expect(result['esc-ok'].sourceFailures).toHaveLength(0);
    expect(result['esc-falha'].sourceFailures).toHaveLength(1);
  });

  it('uma falha COMPARTILHADA de turmas propaga para todas as escolas do lote, sem apagar as demais fontes já válidas', async () => {
    mockListFlowResults.mockResolvedValue([{
      id: 'x', schoolId: 'x', codInep: 'x', escolaNome: 'x', anoLetivo: 2026,
      aprovados: 5, reprovados: 1, abandono: 0, status: 'confirmado',
      createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    }]);
    const schools = [school('esc1'), school('esc2')];
    const turmasFailure: SourceLoadResult<readonly Turma[]> = fail('turmas', 'falha de rede');
    const result = await fetchPortfolioSituations(schools, turmasFailure, {}, 2026, { includeGrades: false, bimestre: 1 });

    for (const s of schools) {
      expect(result[s.id].sourceFailures.some((f: SchoolSituationSourceFailure) => f.source === 'turmas')).toBe(true);
      expect(result[s.id].fluxo.status).toBe('confirmado');
      expect(result[s.id].estrutura.dataQuality).toBe('indisponivel');
    }
  });

  it('visitas são por escola — a falha de UMA escola não afeta a visita das demais', async () => {
    const schools = [school('esc1'), school('esc2')];
    const visitasResults: Record<string, SourceLoadResult<readonly VisitLike[]>> = {
      esc1: fail('visitas', 'esc1 falhou'),
      esc2: ok([{ escola: 'Escola esc2', data: '2026-03-01' }]),
    };
    const result = await fetchPortfolioSituations(schools, NO_TURMAS, visitasResults, 2026, { includeGrades: false, bimestre: 1 });

    expect(result.esc1.visitas.dataQuality).toBe('indisponivel');
    expect(result.esc2.visitas.dataQuality).not.toBe('indisponivel');
    expect(result.esc2.visitas.quantidadeVisitasNoAno).toBe(1);
  });
});
