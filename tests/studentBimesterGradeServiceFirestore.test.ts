// Fase 2C — orquestração assíncrona do StudentBimesterGradeService (getDocs/
// batch em torno do núcleo puro já coberto por
// tests/studentBimesterGradeService.test.ts). getStudentRosterEntry
// (studentRosterService.ts) é mockado diretamente — seu comportamento
// próprio já é coberto por tests/studentRosterServiceFirestore.test.ts;
// aqui só importa que saveStudentBimesterGrade o CONSULTA antes de gravar
// e rejeita quando o roster não existe ou está inativo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveStudentBimesterGradeInput } from '../src/lib/studentBimesterGradeService';

const {
  mockGetDoc, mockGetDocs, mockWriteBatch, mockBatchSet, mockBatchCommit,
  mockQueueAuditLog, mockDoc, mockCollection, mockGetStudentRosterEntry,
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
    mockGetStudentRosterEntry: vi.fn(),
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

vi.mock('../src/lib/studentRosterService', () => ({
  getStudentRosterEntry: mockGetStudentRosterEntry,
}));

const FULL_SCORES = { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 };

function activeRoster() {
  return {
    id: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
    studentKey: 'a1b2c3d4-uuid',
    schoolId: 'diva-cabral',
    turmaId: 'turma-3a-diva',
    anoLetivo: 2026,
    active: true,
  };
}

function baseInput(overrides: Partial<SaveStudentBimesterGradeInput> = {}): SaveStudentBimesterGradeInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    studentKey: 'a1b2c3d4-uuid',
    bimestre: 1,
    scores: FULL_SCORES,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-03-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('getStudentBimesterGrade', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('nunca usa getDoc direto — só query + getDocs', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await getStudentBimesterGrade('diva-cabral', 'roster-1', 2026, 1);
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('consulta vazia retorna null', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await expect(getStudentBimesterGrade('diva-cabral', 'roster-1', 2026, 1)).resolves.toBeNull();
  });

  it('consulta sempre filtra por schoolId, rosterId, anoLetivo e bimestre, com limit(1)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const firestore = await import('firebase/firestore');
    const { getStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await getStudentBimesterGrade('diva-cabral', 'roster-1', 2026, 1);

    expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
    expect(firestore.where).toHaveBeenCalledWith('rosterId', '==', 'roster-1');
    expect(firestore.where).toHaveBeenCalledWith('anoLetivo', '==', 2026);
    expect(firestore.where).toHaveBeenCalledWith('bimestre', '==', 1);
    expect(firestore.limit).toHaveBeenCalledWith(1);
  });

  it('erro real do Firestore continua sendo propagado', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { getStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await expect(getStudentBimesterGrade('diva-cabral', 'roster-1', 2026, 1)).rejects.toThrow('Missing or insufficient permissions.');
  });
});

describe('listStudentBimesterGradesForSchool / listStudentBimesterGradesForClass', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('ambas sempre filtram por schoolId', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const firestore = await import('firebase/firestore');
    const { listStudentBimesterGradesForSchool, listStudentBimesterGradesForClass } = await import('../src/lib/studentBimesterGradeService');

    await listStudentBimesterGradesForSchool('diva-cabral', 2026, 1);
    expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');

    await listStudentBimesterGradesForClass('diva-cabral', 'turma-3a-diva', 2026, 1);
    expect(firestore.where).toHaveBeenCalledWith('turmaId', '==', 'turma-3a-diva');
  });
});

describe('saveStudentBimesterGrade', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockWriteBatch.mockClear();
    mockBatchSet.mockReset();
    mockBatchCommit.mockReset();
    mockQueueAuditLog.mockReset();
    mockDoc.mockClear();
    mockGetStudentRosterEntry.mockReset();
    mockQueueAuditLog.mockReturnValue({ id: 'audit-log-id' });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('rejeita quando o roster não existe — nunca chega a consultar/gravar a nota', async () => {
    mockGetStudentRosterEntry.mockResolvedValue(null);
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await expect(saveStudentBimesterGrade(baseInput())).rejects.toThrow(
      'Cadastro do estudante não encontrado para esta escola, turma e ano letivo.'
    );
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('rejeita quando o roster existe mas está inativo', async () => {
    mockGetStudentRosterEntry.mockResolvedValue({ ...activeRoster(), active: false });
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await expect(saveStudentBimesterGrade(baseInput())).rejects.toThrow(
      'Não é possível registrar notas para um estudante inativo.'
    );
    expect(mockWriteBatch).not.toHaveBeenCalled();
  });

  it('primeiro registro (roster ativo, consulta de nota vazia) enfileira o set no batch', async () => {
    mockGetStudentRosterEntry.mockResolvedValue(activeRoster());
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');

    const result = await saveStudentBimesterGrade(baseInput());

    expect(result.id).toBe('diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid_b1');
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
  });

  it('nota e auditoria são colocadas no MESMO batch, e só um commit é executado', async () => {
    mockGetStudentRosterEntry.mockResolvedValue(activeRoster());
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');

    await saveStudentBimesterGrade(baseInput());

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    const batchInstance = mockWriteBatch.mock.results[0].value;
    expect(mockQueueAuditLog).toHaveBeenCalledWith(batchInstance, expect.any(Object));
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it('resumo de auditoria nunca inclui nome/valores de nota/média/observação — só metadados + fieldsFilled', async () => {
    mockGetStudentRosterEntry.mockResolvedValue(activeRoster());
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockResolvedValue(undefined);
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');

    await saveStudentBimesterGrade(baseInput({ observacao: 'Sigilosa, nunca deve aparecer na auditoria.' }));

    const [, call] = mockQueueAuditLog.mock.calls[0];
    expect(call.newValue).toEqual({
      action: 'create',
      gradeId: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid_b1',
      rosterId: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
      turmaId: 'turma-3a-diva',
      anoLetivo: 2026,
      bimestre: 1,
      fieldsFilled: 4,
    });
    const serialized = JSON.stringify(call.newValue);
    expect(serialized).not.toContain('Sigilosa');
    expect(serialized).not.toContain('linguaPortuguesa');
  });

  it('criação usa operation: create; correção usa operation: update', async () => {
    mockGetStudentRosterEntry.mockResolvedValue(activeRoster());
    mockBatchCommit.mockResolvedValue(undefined);

    mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await saveStudentBimesterGrade(baseInput());
    expect(mockQueueAuditLog.mock.calls[0][1].operation).toBe('create');

    const existing = {
      id: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid_b1',
      rosterId: 'diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid',
      studentKey: 'a1b2c3d4-uuid',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3a-diva',
      turmaNome: '3º Ano A - Matutino',
      anoLetivo: 2026,
      bimestre: 1,
      scores: FULL_SCORES,
      createdAt: '2026-03-01T12:00:00.000Z',
      createdBy: 'super.ativo@example.com',
      updatedAt: '2026-03-01T12:00:00.000Z',
      updatedBy: 'super.ativo@example.com',
    };
    mockGetDocs.mockResolvedValueOnce({ empty: false, docs: [{ data: () => existing }] });
    const result = await saveStudentBimesterGrade(baseInput({ scores: { ...FULL_SCORES, matematica: 9 } }));
    expect(result.createdAt).toBe(existing.createdAt);
    expect(mockQueueAuditLog.mock.calls[1][1].operation).toBe('update');
  });

  it('falha no commit propaga erro — nunca produz sucesso parcial', async () => {
    mockGetStudentRosterEntry.mockResolvedValue(activeRoster());
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockBatchCommit.mockRejectedValue(new Error('permission-denied'));
    const { saveStudentBimesterGrade } = await import('../src/lib/studentBimesterGradeService');
    await expect(saveStudentBimesterGrade(baseInput())).rejects.toThrow('permission-denied');
  });
});
