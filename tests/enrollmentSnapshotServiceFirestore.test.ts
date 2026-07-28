// Hotfix — primeiro registro mensal não salvava: getEnrollmentSnapshot()
// usava getDoc(id determinístico), e um getDoc direto num documento que
// ainda não existe força a regra de segurança a avaliar resource.data contra
// um resource nulo, o que sempre falha como "Missing or insufficient
// permissions" mesmo com acesso legítimo — o setDoc em saveEnrollmentSnapshot
// nunca era alcançado. Mesmo padrão já corrigido em getSchoolYear() (ver
// tests/superintendentService.test.ts para o precedente de mockar
// firebase/firestore diretamente quando a função não tem núcleo puro
// separável). Este arquivo cobre a orquestração assíncrona (getDoc/getDocs/
// setDoc); tests/enrollmentSnapshotService.test.ts já cobre o núcleo puro
// (validate/build).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetDoc, mockGetDocs, mockSetDoc, mockQuery, mockWhere, mockLimit, mockCollection, mockDoc } = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockSetDoc: vi.fn(),
  mockQuery: vi.fn((...args: unknown[]) => ({ __query: args })),
  mockWhere: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
  mockLimit: vi.fn((n: number) => ({ __limit: n })),
  mockCollection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
  mockDoc: vi.fn((_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` })),
}));

vi.mock('../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  query: mockQuery,
  setDoc: mockSetDoc,
  where: mockWhere,
  limit: mockLimit,
}));

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    mesReferencia: '2026-07',
    matriculaInicioMes: 41,
    novasMatriculas: 0,
    transferenciasEntrada: 0,
    transferenciasSaida: 0,
    abandono: 0,
    outrasSaidas: 0,
    matriculaFimMes: 41,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

describe('getEnrollmentSnapshot', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockSetDoc.mockReset();
    mockQuery.mockClear();
    mockWhere.mockClear();
    mockLimit.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('nunca usa getDoc direto para verificar ausência — só query + getDocs', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');
    await getEnrollmentSnapshot('diva-cabral', 'turma-3a-diva', '2026-07');
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('snapshot inexistente retorna null (consulta vazia, sem erro)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');
    await expect(getEnrollmentSnapshot('diva-cabral', 'turma-3a-diva', '2026-07')).resolves.toBeNull();
  });

  it('consulta sempre filtra por schoolId, turmaId e mesReferencia, com limit(1)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    const { getEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');
    await getEnrollmentSnapshot('diva-cabral', 'turma-3a-diva', '2026-07');

    expect(mockWhere).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
    expect(mockWhere).toHaveBeenCalledWith('turmaId', '==', 'turma-3a-diva');
    expect(mockWhere).toHaveBeenCalledWith('mesReferencia', '==', '2026-07');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('snapshot existente é retornado (consulta com resultado)', async () => {
    const existing = { id: 'diva-cabral_turma-3a-diva_2026-07', schoolId: 'diva-cabral', matriculaFimMes: 41 };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    const { getEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');
    await expect(getEnrollmentSnapshot('diva-cabral', 'turma-3a-diva', '2026-07')).resolves.toEqual(existing);
  });

  it('erro real do Firestore (permission-denied) continua sendo propagado, não vira null', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    const { getEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');
    await expect(getEnrollmentSnapshot('diva-cabral', 'turma-3a-diva', '2026-07')).rejects.toThrow(
      'Missing or insufficient permissions.'
    );
  });
});

describe('saveEnrollmentSnapshot', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockSetDoc.mockReset();
    mockDoc.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('primeiro registro do mês (consulta vazia) chega ao setDoc, com o ID determinístico preservado', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockSetDoc.mockResolvedValue(undefined);
    const { saveEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');

    const result = await saveEnrollmentSnapshot(baseInput());

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('diva-cabral_turma-3a-diva_2026-07');
    expect(mockDoc).toHaveBeenCalledWith({}, 'enrollment_snapshots', 'diva-cabral_turma-3a-diva_2026-07');
    expect(result.createdAt).toBe('2026-07-31T12:00:00.000Z');
    expect(result.createdBy).toBe('super.ativo@example.com');
    expect(result.reviewStatus).toBe('manual');
  });

  it('correção do mesmo mês (consulta encontra o documento) preserva createdAt/createdBy e marca reviewStatus: corrigido', async () => {
    const existing = {
      id: 'diva-cabral_turma-3a-diva_2026-07',
      schoolId: 'diva-cabral',
      createdAt: '2026-07-31T12:00:00.000Z',
      createdBy: 'super.ativo@example.com',
    };
    mockGetDocs.mockResolvedValue({ empty: false, docs: [{ data: () => existing }] });
    mockSetDoc.mockResolvedValue(undefined);
    const { saveEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');

    const result = await saveEnrollmentSnapshot(
      baseInput({ matriculaFimMes: 42, novasMatriculas: 1, actingUserEmail: 'quem-corrigiu@example.com', now: '2026-08-01T09:00:00.000Z' })
    );

    expect(result.id).toBe(existing.id);
    expect(result.createdAt).toBe('2026-07-31T12:00:00.000Z');
    expect(result.createdBy).toBe('super.ativo@example.com');
    expect(result.updatedAt).toBe('2026-08-01T09:00:00.000Z');
    expect(result.updatedBy).toBe('quem-corrigiu@example.com');
    expect(result.reviewStatus).toBe('corrigido');
  });

  it('mês diferente gera outro documento (ID diferente, sem tocar o mês anterior)', async () => {
    mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
    mockSetDoc.mockResolvedValue(undefined);
    const { saveEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');

    const julho = await saveEnrollmentSnapshot(baseInput({ mesReferencia: '2026-07' }));
    const agosto = await saveEnrollmentSnapshot(
      baseInput({ mesReferencia: '2026-08', matriculaInicioMes: 41, matriculaFimMes: 41 })
    );

    expect(julho.id).not.toBe(agosto.id);
    expect(julho.id).toBe('diva-cabral_turma-3a-diva_2026-07');
    expect(agosto.id).toBe('diva-cabral_turma-3a-diva_2026-08');
  });

  it('erro real do Firestore continua sendo propagado ao chamador (App/painel)', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    const { saveEnrollmentSnapshot } = await import('../src/lib/enrollmentSnapshotService');
    await expect(saveEnrollmentSnapshot(baseInput())).rejects.toThrow('unavailable');
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
