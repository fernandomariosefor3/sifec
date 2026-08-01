// Fase 2D — revisão do code review do PR #16, seção 5: fetchTurmasForSchools/
// fetchVisitasForSchools NUNCA leem a coleção inteira. Turmas é consultado
// só pelas escolas do escopo visível (query em chunks de escolaId, nunca
// mais de TURMA_QUERY_CHUNK_SIZE IDs por consulta); visitas é consultado
// uma escola de cada vez, com um pool de concorrência (nunca where-in com
// todas as escolas de uma visão global), e o resultado é sanitizado para
// {escola, data} — nenhum outro campo do documento chega a existir fora do
// serviço.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDocs, mockCollection, mockQuery, mockWhere } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockCollection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
  mockQuery: vi.fn((...args: unknown[]) => ({ __query: args })),
  mockWhere: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
}));

vi.mock('../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  getDocs: mockGetDocs,
  query: mockQuery,
  where: mockWhere,
}));

import {
  fetchTurmasForSchools,
  fetchVisitasForSchools,
  TURMA_QUERY_CHUNK_SIZE,
  VISIT_QUERY_CONCURRENCY,
  type SchoolSituationSchoolInput,
} from '../src/lib/schoolSituationService';

function school(id: string, nome: string): SchoolSituationSchoolInput {
  return { id, nome, codInep: `INEP-${id}` };
}

beforeEach(() => {
  mockGetDocs.mockReset();
  mockCollection.mockClear();
  mockQuery.mockClear();
  mockWhere.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('fetchTurmasForSchools — escopo, nunca a coleção inteira', () => {
  it('lista vazia de escolas não consulta o Firestore', async () => {
    const result = await fetchTurmasForSchools([]);
    expect(result).toEqual({ status: 'success', data: [] });
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('uma escola só: consulta por escolaId com um único elemento', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    await fetchTurmasForSchools(['diva-cabral']);

    expect(mockWhere).toHaveBeenCalledWith('escolaId', 'in', ['diva-cabral']);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('carteira de sete escolas: uma única consulta em chunk (cabe no limite)', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    const schoolIds = Array.from({ length: 7 }, (_, i) => `esc${i}`);
    await fetchTurmasForSchools(schoolIds);

    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledWith('escolaId', 'in', schoolIds);
  });

  it('visão global de 56 escolas: nunca um único where-in com as 56 — divide em chunks de até TURMA_QUERY_CHUNK_SIZE', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const schoolIds = Array.from({ length: 56 }, (_, i) => `esc${i}`);
    await fetchTurmasForSchools(schoolIds);

    const expectedChunks = Math.ceil(56 / TURMA_QUERY_CHUNK_SIZE);
    expect(mockGetDocs).toHaveBeenCalledTimes(expectedChunks);
    for (const call of mockWhere.mock.calls) {
      expect((call[2] as string[]).length).toBeLessThanOrEqual(TURMA_QUERY_CHUNK_SIZE);
    }
  });

  it('mescla e remove duplicados por id entre chunks', async () => {
    const turmaA = { id: 't1', escolaId: 'esc1', escolaNome: 'Escola 1', nome: 'Turma A', ano: '1º', periodo: 'Matutino' };
    const turmaB = { id: 't1', escolaId: 'esc1', escolaNome: 'Escola 1', nome: 'Turma A (duplicada)', ano: '1º', periodo: 'Matutino' };
    mockGetDocs
      .mockResolvedValueOnce({ docs: [{ data: () => turmaA }] })
      .mockResolvedValueOnce({ docs: [{ data: () => turmaB }] });

    const bigList = Array.from({ length: TURMA_QUERY_CHUNK_SIZE + 1 }, (_, i) => `esc${i}`);
    const result = await fetchTurmasForSchools(bigList);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.data).toHaveLength(1);
    }
  });

  it('falha na consulta vira SourceLoadResult de falha, nunca lança exceção', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    const result = await fetchTurmasForSchools(['esc1']);

    expect(result.status).toBe('failure');
    if (result.status === 'failure') {
      expect(result.error.source).toBe('turmas');
      expect(result.error.message).toContain('Missing or insufficient permissions');
    }
  });
});

describe('fetchVisitasForSchools — uma escola por vez, com pool de concorrência', () => {
  it('consulta cada escola isoladamente por escola (nunca where-in) e sanitiza para {escola, data}', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ data: () => ({ escola: 'EEM Diva Cabral', data: '2026-03-01', tecnico: 'Fulano', foco: 'Observação sensível', status: 'Realizada' }) }],
    });

    const schools = [school('diva-cabral', 'EEM Diva Cabral')];
    const result = await fetchVisitasForSchools(schools);

    expect(mockWhere).toHaveBeenCalledWith('escola', '==', 'EEM Diva Cabral');
    const entry = result['diva-cabral'];
    expect(entry.status).toBe('success');
    if (entry.status === 'success') {
      expect(entry.data).toEqual([{ escola: 'EEM Diva Cabral', data: '2026-03-01' }]);
      expect(JSON.stringify(entry.data)).not.toContain('Fulano');
      expect(JSON.stringify(entry.data)).not.toContain('Observação sensível');
      expect(JSON.stringify(entry.data)).not.toContain('Realizada');
    }
  });

  it('respeita o pool de concorrência — nunca mais de VISIT_QUERY_CONCURRENCY consultas simultâneas', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockGetDocs.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight -= 1;
      return { docs: [] };
    });

    const schools = Array.from({ length: 20 }, (_, i) => school(`esc${i}`, `Escola ${i}`));
    await fetchVisitasForSchools(schools);

    expect(maxInFlight).toBeLessThanOrEqual(VISIT_QUERY_CONCURRENCY);
  });

  it('falha em UMA escola não impede a visita das demais de carregar', async () => {
    // Inspeciona o objeto de query diretamente (em vez de depender da ordem
    // de chamadas do mock) — mockQuery devolve { __query: [collectionRef,
    // whereClause] } e mockWhere devolve { __where: [field, op, value] },
    // então dá para achar o nome da escola desta consulta específica sem
    // presumir nada sobre a ordem de execução entre workers concorrentes.
    mockGetDocs.mockImplementation(async (q: { __query: [unknown, { __where: [string, string, string] }] }) => {
      const [, whereClause] = q.__query;
      const schoolName = whereClause.__where[2];
      if (schoolName === 'Escola falha') throw new Error('unavailable');
      return { docs: [{ data: () => ({ escola: schoolName, data: '2026-04-01' }) }] };
    });

    const schools = [school('esc-falha', 'Escola falha'), school('esc-ok', 'Escola ok')];
    const result = await fetchVisitasForSchools(schools);

    expect(result['esc-falha'].status).toBe('failure');
    expect(result['esc-ok'].status).toBe('success');
  });

  it('lista vazia de escolas devolve objeto vazio sem consultar o Firestore', async () => {
    const result = await fetchVisitasForSchools([]);
    expect(result).toEqual({});
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});
