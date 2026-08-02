// Fase 2C.1 — revisão do PR #17, seção 5: listClassroomsForSchool precisa
// hidratar Turma.id a partir do ID REAL do documento Firestore (d.id), nunca
// confiar em um campo `id` interno de d.data() que pode estar ausente ou
// divergente. Mesmo padrão de mock de tests/schoolFlowServiceFirestore.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turma } from '../src/types/classroom';

const { mockGetDocs } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
  doc: vi.fn(),
  getDocs: mockGetDocs,
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
  setDoc: vi.fn(),
}));

function docSnap(id: string, data: Partial<Turma>) {
  return { id, data: () => data };
}

describe('listClassroomsForSchool', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('documento sem campo interno id usa o ID real do documento (d.id)', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ docs: [docSnap('turma-real-1', { escolaId: 'esc1', nome: '3A' } as Turma)] })
      .mockResolvedValueOnce({ docs: [] });
    const { listClassroomsForSchool } = await import('../src/lib/classService');

    const result = await listClassroomsForSchool('esc1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('turma-real-1');
  });

  it('campo interno id divergente NUNCA prevalece sobre d.id', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ docs: [docSnap('turma-real-2', { id: 'id-antigo-errado', escolaId: 'esc1', nome: '3B' } as Turma)] })
      .mockResolvedValueOnce({ docs: [] });
    const { listClassroomsForSchool } = await import('../src/lib/classService');

    const result = await listClassroomsForSchool('esc1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('turma-real-2');
    expect(result[0].id).not.toBe('id-antigo-errado');
  });

  it('resultados das consultas por escolaId e schoolId continuam deduplicados pelo ID real do documento', async () => {
    // Mesmo documento retornado pelas duas consultas em paralelo (turma
    // legada com escolaId E schoolId preenchidos) — precisa colapsar para
    // uma única turma, não duas.
    const snap = docSnap('turma-3', { escolaId: 'esc1', schoolId: 'esc1', nome: '3C' } as Turma);
    mockGetDocs
      .mockResolvedValueOnce({ docs: [snap] })
      .mockResolvedValueOnce({ docs: [snap] });
    const { listClassroomsForSchool } = await import('../src/lib/classService');

    const result = await listClassroomsForSchool('esc1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('turma-3');
  });

  it('duas turmas diferentes nunca são agrupadas sob undefined, mesmo sem campo interno id', async () => {
    mockGetDocs
      .mockResolvedValueOnce({
        docs: [
          docSnap('turma-a', { escolaId: 'esc1', nome: 'A' } as Turma),
          docSnap('turma-b', { escolaId: 'esc1', nome: 'B' } as Turma),
        ],
      })
      .mockResolvedValueOnce({ docs: [] });
    const { listClassroomsForSchool } = await import('../src/lib/classService');

    const result = await listClassroomsForSchool('esc1');

    expect(result).toHaveLength(2);
    expect(result.map(t => t.id).sort()).toEqual(['turma-a', 'turma-b']);
    expect(result.some(t => t.id === undefined)).toBe(false);
  });
});
