// Fase 2D — orquestração assíncrona da Sala de Situação. Cada serviço de
// fase anterior (school_years, enrollment_snapshots, school_flow_results,
// student_rosters, student_bimester_grades) é mockado diretamente — seu
// próprio comportamento de Firestore já é coberto pelos testes daquela
// fase; aqui o alvo é isolamento de falha por fonte/por escola, limite de
// concorrência e nunca consultar sem schoolId.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turma } from '../src/types/classroom';

const {
  mockGetSchoolYear, mockListSnapshots, mockGetFlow, mockListRoster, mockListGrades,
} = vi.hoisted(() => ({
  mockGetSchoolYear: vi.fn(),
  mockListSnapshots: vi.fn(),
  mockGetFlow: vi.fn(),
  mockListRoster: vi.fn(),
  mockListGrades: vi.fn(),
}));

vi.mock('../src/lib/schoolYearService', () => ({ getSchoolYear: mockGetSchoolYear }));
vi.mock('../src/lib/enrollmentSnapshotService', () => ({ listEnrollmentSnapshotsForSchool: mockListSnapshots }));
vi.mock('../src/lib/schoolFlowService', () => ({ getSchoolFlowResult: mockGetFlow }));
vi.mock('../src/lib/studentRosterService', () => ({ listStudentRosterForSchool: mockListRoster }));
vi.mock('../src/lib/studentBimesterGradeService', () => ({ listStudentBimesterGradesForSchool: mockListGrades }));

import {
  DEFAULT_SITUATION_CONCURRENCY,
  fetchPortfolioSituations,
  fetchSchoolSituation,
  mapWithConcurrencyLimit,
  type SchoolSituationSchoolInput,
} from '../src/lib/schoolSituationService';

function school(id: string): SchoolSituationSchoolInput {
  return { id, nome: `Escola ${id}`, codInep: `INEP-${id}` };
}

function turma(id: string, schoolId: string): Turma {
  return { id, escolaId: schoolId, escolaNome: `Escola ${schoolId}`, nome: 'Turma A', ano: '1º', periodo: 'Matutino', schoolId, anoLetivo: 2026, ativa: true };
}

beforeEach(() => {
  mockGetSchoolYear.mockReset().mockResolvedValue(null);
  mockListSnapshots.mockReset().mockResolvedValue([]);
  mockGetFlow.mockReset().mockResolvedValue(null);
  mockListRoster.mockReset().mockResolvedValue([]);
  mockListGrades.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchSchoolSituation — isolamento por schoolId', () => {
  it('consulta cada coleção escolar sempre filtrada pelo schoolId da escola', async () => {
    await fetchSchoolSituation(school('esc1'), [turma('t1', 'esc1')], [], 2026, { includeGrades: true, bimestre: 1 });

    expect(mockGetSchoolYear).toHaveBeenCalledWith('esc1', 2026);
    expect(mockListSnapshots).toHaveBeenCalledWith('esc1', 2026);
    expect(mockGetFlow).toHaveBeenCalledWith('esc1', 2026);
    expect(mockListRoster).toHaveBeenCalledWith('esc1', 2026);
    expect(mockListGrades).toHaveBeenCalledWith('esc1', 2026, 1);
  });

  it('includeGrades=false nunca consulta student_rosters/student_bimester_grades (visão global sem escola selecionada)', async () => {
    const situation = await fetchSchoolSituation(school('esc1'), [], [], 2026, { includeGrades: false, bimestre: 1 });
    expect(mockListRoster).not.toHaveBeenCalled();
    expect(mockListGrades).not.toHaveBeenCalled();
    expect(situation.notas).toBeNull();
  });
});

describe('fetchSchoolSituation — consolidação parcial quando uma fonte falha', () => {
  it('falha em UMA fonte não apaga os indicadores das outras', async () => {
    mockGetFlow.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    mockGetSchoolYear.mockResolvedValueOnce({
      id: 'esc1_2026', schoolId: 'esc1', codInep: 'INEP-esc1', escolaNome: 'Escola esc1', anoLetivo: 2026,
      matriculaInicial: 100, matriculaAtual: 95, quantidadeTurmasAtivas: 1, status: 'ativo',
      dataInicio: null, dataFim: null, ultimaAtualizacao: null,
      createdAt: 'x', updatedAt: 'x', createdBy: 'x', updatedBy: 'x',
    });

    const situation = await fetchSchoolSituation(school('esc1'), [turma('t1', 'esc1')], [], 2026, { includeGrades: false, bimestre: 1 });

    expect(situation.sourceFailures).toHaveLength(1);
    expect(situation.sourceFailures[0].source).toBe('school_flow_results');
    // Estrutura continua populada normalmente mesmo com fluxo tendo falhado.
    expect(situation.estrutura.matriculaInicial).toBe(100);
    expect(situation.fluxo.status).toBe('nao_informado');
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
    const result = await fetchPortfolioSituations(schools, [], [], 2026, { includeGrades: true, bimestre: 1, concurrency: 4 });

    expect(Object.keys(result)).toHaveLength(7);
    expect(mockListRoster).toHaveBeenCalledTimes(7);
  });

  it('arquitetura universal: funciona igual para 1, 7 ou 56 escolas, sem hardcode', async () => {
    for (const count of [1, 7, 56]) {
      mockGetSchoolYear.mockClear();
      const schools = Array.from({ length: count }, (_, i) => school(`esc${i}`));
      const result = await fetchPortfolioSituations(schools, [], [], 2026, { includeGrades: false, bimestre: 1 });
      expect(Object.keys(result)).toHaveLength(count);
      expect(mockGetSchoolYear).toHaveBeenCalledTimes(count);
    }
  });

  it('usa DEFAULT_SITUATION_CONCURRENCY quando nenhuma concorrência é informada', () => {
    expect(DEFAULT_SITUATION_CONCURRENCY).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_SITUATION_CONCURRENCY).toBeLessThanOrEqual(5);
  });

  it('falha isolada em UMA escola do lote não afeta as demais', async () => {
    mockGetFlow.mockImplementation(async (schoolId: string) => {
      if (schoolId === 'esc-falha') throw new Error('Erro simulado');
      return null;
    });

    const schools = [school('esc-ok'), school('esc-falha')];
    const result = await fetchPortfolioSituations(schools, [], [], 2026, { includeGrades: false, bimestre: 1 });

    expect(result['esc-ok'].sourceFailures).toHaveLength(0);
    expect(result['esc-falha'].sourceFailures).toHaveLength(1);
  });
});
