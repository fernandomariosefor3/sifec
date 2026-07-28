// Fase 2B — orquestração assíncrona do SchoolFlowService (getDocs/batch em
// torno do núcleo puro já coberto por tests/schoolFlowService.test.ts).
// Hotfix: saveSchoolFlowResult passou de duas escritas separadas (setDoc do
// resultado + recordAuditLog da auditoria) para um único writeBatch — ou os
// dois documentos são gravados, ou nenhum é (nunca mais o caso de o
// resultado já salvo mostrar erro só porque a auditoria falhou depois).
// queueAuditLog (auditService.ts) é mockado diretamente aqui — seu
// comportamento próprio (sanitização, campos opcionais) é coberto por
// tests/auditService.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveSchoolFlowResultInput } from '../src/lib/schoolFlowService';

const {
  mockGetDoc, mockGetDocs, mockWriteBatch, mockBatchSet, mockBatchCommit,
  mockQueueAuditLog, mockDoc, mockCollection,
} = vi.hoisted(() => {
  const batchSet = vi.fn();
  const batchCommit = vi.fn();
  return {
    mockGetDoc: vi.fn(),
    mockGetDocs: vi.fn(),
    mockBatchSet: batchSet,
    mockBatchCommit: batchCommit,
    mockWriteBatch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
    mockQueueAuditLog: vi.fn(),
    mockDoc: vi.fn((_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` })),
    mockCollection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
  };
});

vi.mock('../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  writeBatch: mockWriteBatch,
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
  limit: vi.fn((n: number) => ({ __limit: n })),
}));

vi.mock('../src/lib/auditService', () => ({
  queueAuditLog: mockQueueAuditLog,
}));

function baseInput(overrides: Partial<SaveSchoolFlowResultInput> = {}): SaveSchoolFlowResultInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2025,
    aprovados: 700,
    reprovados: 80,
    abandono: 20,
    status: 'confirmado',
    actingUserEmail: 'super.ativo@example.com',
    now: '2025-12-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('getSchoolFlowResult', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('nunca usa getDoc direto para verificar ausência — só query + getDocs', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getSchoolFlowResult } = await import('../src/lib/schoolFlowService');
    await getSchoolFlowResult('diva-cabral', 2025);
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('resultado inexistente retorna null (consulta vazia, sem erro)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getSchoolFlowResult } = await import('../src/lib/schoolFlowService');
    await expect(getSchoolFlowResult('diva-cabral', 2025)).resolves.toBeNull();
  });

  it('consulta sempre filtra por schoolId e anoLetivo, com limit(1)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const firestore = await import('firebase/firestore');
    const { getSchoolFlowResult } = await import('../src/lib/schoolFlowService');
    await getSchoolFlowResult('diva-cabral', 2025);

    expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
    expect(firestore.where).toHaveBeenCalledWith('anoLetivo', '==', 2025);
    expect(firestore.limit).toHaveBeenCalledWith(1);
  });

  it('resultado existente é retornado (consulta com resultado)', async () => {
    const existing = { id: 'diva-cabral_2025', schoolId: 'diva-cabral', anoLetivo: 2025, aprovados: 700 };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    const { getSchoolFlowResult } = await import('../src/lib/schoolFlowService');
    await expect(getSchoolFlowResult('diva-cabral', 2025)).resolves.toEqual(existing);
  });

  it('erro real do Firestore (permission-denied) continua sendo propagado, não vira null', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { getSchoolFlowResult } = await import('../src/lib/schoolFlowService');
    await expect(getSchoolFlowResult('diva-cabral', 2025)).rejects.toThrow('Missing or insufficient permissions.');
  });
});

describe('listSchoolFlowResultsForSchools', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('consulta cada escola isoladamente e agrupa só as que têm resultado', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ id: 'escola-a_2025', schoolId: 'escola-a', anoLetivo: 2025 }) }] })
      .mockResolvedValueOnce({ empty: true, docs: [] });

    const { listSchoolFlowResultsForSchools } = await import('../src/lib/schoolFlowService');
    const results = await listSchoolFlowResultsForSchools(['escola-a', 'escola-b'], 2025);

    expect(Object.keys(results)).toEqual(['escola-a']);
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });

  it('propaga erro real em vez de omitir a escola que falhou', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    const { listSchoolFlowResultsForSchools } = await import('../src/lib/schoolFlowService');
    await expect(listSchoolFlowResultsForSchools(['escola-a'], 2025)).rejects.toThrow('unavailable');
  });
});

describe('saveSchoolFlowResult', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockWriteBatch.mockClear();
    mockBatchSet.mockReset();
    mockBatchCommit.mockReset();
    mockQueueAuditLog.mockReset();
    mockDoc.mockClear();
    mockQueueAuditLog.mockReturnValue({ id: 'audit-log-id' });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('primeiro registro (consulta vazia) enfileira o set no batch, com o ID determinístico preservado', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    const result = await saveSchoolFlowResult(baseInput());

    expect(result.id).toBe('diva-cabral_2025');
    expect(mockDoc).toHaveBeenCalledWith({}, 'school_flow_results', 'diva-cabral_2025');
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
  });

  it('salva fluxo sem importBatchId — nenhum campo undefined chega ao batch.set', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    await saveSchoolFlowResult(baseInput());

    const [, payloadArg] = mockBatchSet.mock.calls[0];
    expect(Object.values(payloadArg as Record<string, unknown>)).not.toContain(undefined);
    expect('importBatchId' in (payloadArg as Record<string, unknown>)).toBe(false);
  });

  it('resultado e auditoria são colocados no MESMO batch — queueAuditLog recebe a instância retornada por writeBatch(db)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    await saveSchoolFlowResult(baseInput());

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    const batchInstance = mockWriteBatch.mock.results[0].value;
    expect(mockQueueAuditLog).toHaveBeenCalledWith(batchInstance, expect.any(Object));
  });

  it('apenas um batch.commit é executado, e o resultado só é retornado depois do commit bem-sucedido', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    const result = await saveSchoolFlowResult(baseInput());

    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('diva-cabral_2025');
  });

  it('registra um resumo agregado em audit_logs (só anoLetivo/aprovados/reprovados/abandono/status) — nunca dados nominais', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    await saveSchoolFlowResult(baseInput());

    expect(mockQueueAuditLog).toHaveBeenCalledTimes(1);
    const [, call] = mockQueueAuditLog.mock.calls[0];
    expect(call.collectionName).toBe('school_flow_results');
    expect(call.operation).toBe('create');
    expect(call.newValue).toEqual({ anoLetivo: 2025, aprovados: 700, reprovados: 80, abandono: 20, status: 'confirmado' });
    expect(call.previousValue).toBeNull();
    expect(Object.keys(call.newValue)).toEqual(['anoLetivo', 'aprovados', 'reprovados', 'abandono', 'status']);
  });

  it('correção do mesmo ano (consulta encontra o documento) preserva createdAt/createdBy e registra operation: update', async () => {
    const existing = {
      id: 'diva-cabral_2025',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      anoLetivo: 2025,
      aprovados: 700,
      reprovados: 80,
      abandono: 20,
      status: 'confirmado',
      createdAt: '2025-12-15T12:00:00.000Z',
      createdBy: 'super.ativo@example.com',
      updatedAt: '2025-12-15T12:00:00.000Z',
      updatedBy: 'super.ativo@example.com',
    };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    const result = await saveSchoolFlowResult(
      baseInput({ aprovados: 705, reprovados: 75, actingUserEmail: 'quem-corrigiu@example.com', now: '2026-01-05T09:00:00.000Z' })
    );

    expect(result.createdAt).toBe(existing.createdAt);
    expect(result.createdBy).toBe(existing.createdBy);
    const [, call] = mockQueueAuditLog.mock.calls[0];
    expect(call.operation).toBe('update');
    expect(call.previousValue).toEqual({ anoLetivo: 2025, aprovados: 700, reprovados: 80, abandono: 20, status: 'confirmado' });
  });

  it('erro real na consulta prévia (getDocs) continua sendo propagado, batch nunca chega a ser aberto', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');
    await expect(saveSchoolFlowResult(baseInput())).rejects.toThrow('unavailable');
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('falha no commit propaga erro — nunca produz sucesso parcial (a promise nunca resolve com um payload)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockRejectedValue(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
    const { saveSchoolFlowResult } = await import('../src/lib/schoolFlowService');

    await expect(saveSchoolFlowResult(baseInput())).rejects.toThrow('permission-denied');
    // O set já foi ENFILEIRADO localmente (parte de montar o batch), mas o
    // commit é a única operação que efetivamente toca o servidor — como ele
    // falhou, nenhum dos dois documentos existe de verdade no Firestore.
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });
});
