// Fase 2C — orquestração assíncrona do StudentRosterService (getDocs/batch
// em torno do núcleo puro já coberto por tests/studentRosterService.test.ts).
// Mesmo padrão de tests/schoolFlowServiceFirestore.test.ts: mocka o SDK do
// Firestore diretamente e queueAuditLog (auditService.ts é testado à parte
// — aqui só importa que a gravação chame queueAuditLog com o MESMO batch
// usado para o cadastro, sem studentName no resumo).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveStudentRosterEntryInput } from '../src/lib/studentRosterService';

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

function baseInput(overrides: Partial<SaveStudentRosterEntryInput> = {}): SaveStudentRosterEntryInput {
  return {
    studentKey: 'a1b2c3d4-uuid',
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    studentName: 'Estudante Teste',
    active: true,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-02-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('getStudentRosterEntry', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('nunca usa getDoc direto — só query + getDocs', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await getStudentRosterEntry('diva-cabral', 2026, 'turma-3a-diva', 'key-a');
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('consulta vazia retorna null (sem erro de permissão)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await expect(getStudentRosterEntry('diva-cabral', 2026, 'turma-3a-diva', 'key-a')).resolves.toBeNull();
  });

  it('consulta sempre filtra por schoolId, anoLetivo, turmaId e studentKey, com limit(1)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const firestore = await import('firebase/firestore');
    const { getStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await getStudentRosterEntry('diva-cabral', 2026, 'turma-3a-diva', 'key-a');

    expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
    expect(firestore.where).toHaveBeenCalledWith('anoLetivo', '==', 2026);
    expect(firestore.where).toHaveBeenCalledWith('turmaId', '==', 'turma-3a-diva');
    expect(firestore.where).toHaveBeenCalledWith('studentKey', '==', 'key-a');
    expect(firestore.limit).toHaveBeenCalledWith(1);
  });

  it('erro real do Firestore continua sendo propagado, não vira null', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { getStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await expect(getStudentRosterEntry('diva-cabral', 2026, 'turma-3a-diva', 'key-a')).rejects.toThrow(
      'Missing or insufficient permissions.'
    );
  });
});

describe('listStudentRosterForSchool / listStudentRosterForClass', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('listStudentRosterForSchool sempre filtra por schoolId', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const firestore = await import('firebase/firestore');
    const { listStudentRosterForSchool } = await import('../src/lib/studentRosterService');
    await listStudentRosterForSchool('diva-cabral', 2026);
    expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
  });

  it('listStudentRosterForClass sempre filtra por schoolId e turmaId', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const firestore = await import('firebase/firestore');
    const { listStudentRosterForClass } = await import('../src/lib/studentRosterService');
    await listStudentRosterForClass('diva-cabral', 'turma-3a-diva', 2026);
    expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
    expect(firestore.where).toHaveBeenCalledWith('turmaId', '==', 'turma-3a-diva');
  });

  it('erro real propaga em ambas', async () => {
    mockGetDocs.mockRejectedValue(new Error('unavailable'));
    const { listStudentRosterForSchool, listStudentRosterForClass } = await import('../src/lib/studentRosterService');
    await expect(listStudentRosterForSchool('diva-cabral', 2026)).rejects.toThrow('unavailable');
    await expect(listStudentRosterForClass('diva-cabral', 'turma-3a-diva', 2026)).rejects.toThrow('unavailable');
  });
});

describe('saveStudentRosterEntry', () => {
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

  it('primeiro cadastro (consulta vazia) enfileira o set no batch, com o ID determinístico preservado', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');

    const result = await saveStudentRosterEntry(baseInput());

    expect(result.id).toBe('diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid');
    expect(mockDoc).toHaveBeenCalledWith({}, 'student_rosters', result.id);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
  });

  it('cadastro e auditoria são colocados no MESMO batch, e só um commit é executado', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');

    await saveStudentRosterEntry(baseInput());

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    const batchInstance = mockWriteBatch.mock.results[0].value;
    expect(mockQueueAuditLog).toHaveBeenCalledWith(batchInstance, expect.any(Object));
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('resumo de auditoria nunca inclui studentName — só action/rosterId/turmaId/anoLetivo', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');

    await saveStudentRosterEntry(baseInput());

    const [, call] = mockQueueAuditLog.mock.calls[0];
    expect(call.operation).toBe('create');
    expect(call.newValue).toEqual({
      action: 'create',
      rosterId: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
      turmaId: 'turma-3a-diva',
      anoLetivo: 2026,
    });
    expect(Object.keys(call.newValue)).not.toContain('studentName');
  });

  it('inativação (active: false) registra action: deactivate, operation: archive', async () => {
    const existing = {
      id: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
      studentKey: 'a1b2c3d4-uuid',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3a-diva',
      turmaNome: '3º Ano A - Matutino',
      anoLetivo: 2026,
      studentName: 'Estudante Teste',
      active: true,
      createdAt: '2026-02-10T12:00:00.000Z',
      createdBy: 'super.ativo@example.com',
      updatedAt: '2026-02-10T12:00:00.000Z',
      updatedBy: 'super.ativo@example.com',
    };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');

    await saveStudentRosterEntry(baseInput({ active: false }));

    const [, call] = mockQueueAuditLog.mock.calls[0];
    expect(call.operation).toBe('archive');
    expect(call.newValue.action).toBe('deactivate');
  });

  it('correção (consulta encontra o cadastro) preserva createdAt/createdBy e registra operation: update', async () => {
    const existing = {
      id: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
      studentKey: 'a1b2c3d4-uuid',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3a-diva',
      turmaNome: '3º Ano A - Matutino',
      anoLetivo: 2026,
      studentName: 'Estudante Teste',
      active: true,
      createdAt: '2026-02-10T12:00:00.000Z',
      createdBy: 'super.ativo@example.com',
      updatedAt: '2026-02-10T12:00:00.000Z',
      updatedBy: 'super.ativo@example.com',
    };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');

    const result = await saveStudentRosterEntry(baseInput({ studentName: 'Nome Corrigido', actingUserEmail: 'quem-corrigiu@example.com' }));

    expect(result.createdAt).toBe(existing.createdAt);
    expect(result.createdBy).toBe(existing.createdBy);
    const [, call] = mockQueueAuditLog.mock.calls[0];
    expect(call.operation).toBe('update');
  });

  it('erro real na consulta prévia continua sendo propagado, batch nunca chega a ser aberto', async () => {
    mockGetDocs.mockRejectedValue(new Error('unavailable'));
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await expect(saveStudentRosterEntry(baseInput())).rejects.toThrow('unavailable');
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('falha no commit propaga erro — nunca produz sucesso parcial', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockRejectedValue(new Error('permission-denied'));
    const { saveStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await expect(saveStudentRosterEntry(baseInput())).rejects.toThrow('permission-denied');
  });
});

describe('deactivateStudentRosterEntry / activateStudentRosterEntry', () => {
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

  it('deactivateStudentRosterEntry lança erro quando o cadastro não existe', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { deactivateStudentRosterEntry } = await import('../src/lib/studentRosterService');
    await expect(
      deactivateStudentRosterEntry({
        schoolId: 'diva-cabral', anoLetivo: 2026, turmaId: 'turma-3a-diva', studentKey: 'inexistente',
        actingUserEmail: 'super.ativo@example.com', now: '2026-02-10T12:00:00.000Z',
      })
    ).rejects.toThrow('Cadastro do estudante não encontrado.');
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('activateStudentRosterEntry reativa um cadastro inativo preservando o nome', async () => {
    const existing = {
      id: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
      studentKey: 'a1b2c3d4-uuid',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3a-diva',
      turmaNome: '3º Ano A - Matutino',
      anoLetivo: 2026,
      studentName: 'Estudante Teste',
      active: false,
      createdAt: '2026-02-10T12:00:00.000Z',
      createdBy: 'super.ativo@example.com',
      updatedAt: '2026-02-10T12:00:00.000Z',
      updatedBy: 'super.ativo@example.com',
    };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { activateStudentRosterEntry } = await import('../src/lib/studentRosterService');

    const result = await activateStudentRosterEntry({
      schoolId: 'diva-cabral', anoLetivo: 2026, turmaId: 'turma-3a-diva', studentKey: 'a1b2c3d4-uuid',
      actingUserEmail: 'quem-reativou@example.com', now: '2026-05-01T00:00:00.000Z',
    });

    expect(result.active).toBe(true);
    expect(result.studentName).toBe('Estudante Teste');
  });
});
