// @vitest-environment jsdom
// Hotfix estabilização — seção 1: getCurrentUserSuperRecord,
// loadSuperintendentsFromFirestore e syncSuperintendentsFromFirestore não
// podem mais engolir falhas técnicas do Firestore (permission-denied,
// unavailable, erro de rede) transformando-as em null/[]/sucesso silencioso
// — isso fazia um erro real virar "conta não cadastrada"/"conta inativa" no
// App (ver App.tsx). auth e o SDK do Firestore são mockados para não
// depender do Firebase de verdade nem do emulador (a validação das regras
// de segurança em si é feita à parte, em test:rules).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockGetDoc, mockGetDocs } = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { email: string } | null },
  mockGetDoc: vi.fn(),
  mockGetDocs: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
  doc: vi.fn((_db: unknown, name: string, id: string) => ({ __doc: `${name}/${id}` })),
  getDoc: mockGetDoc,
  getDocs: mockGetDocs,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';

function permissionDeniedError() {
  return Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
}

function unavailableError() {
  return Object.assign(new Error('unavailable'), { code: 'unavailable' });
}

describe('getCurrentUserSuperRecord', () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('retorna null quando ninguém está logado, sem consultar o Firestore', async () => {
    const { getCurrentUserSuperRecord } = await import('../src/lib/superintendentService');
    await expect(getCurrentUserSuperRecord()).resolves.toBeNull();
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it('retorna null quando o documento realmente não existe', async () => {
    mockAuth.currentUser = { email: 'estranho@example.com' };
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const { getCurrentUserSuperRecord } = await import('../src/lib/superintendentService');
    await expect(getCurrentUserSuperRecord()).resolves.toBeNull();
  });

  it('propaga permission-denied em vez de virar null ("conta não cadastrada")', async () => {
    mockAuth.currentUser = { email: 'super.ativo@example.com' };
    mockGetDoc.mockRejectedValue(permissionDeniedError());
    const { getCurrentUserSuperRecord } = await import('../src/lib/superintendentService');
    await expect(getCurrentUserSuperRecord()).rejects.toThrow('Missing or insufficient permissions.');
  });

  it('propaga unavailable em vez de virar null', async () => {
    mockAuth.currentUser = { email: 'super.ativo@example.com' };
    mockGetDoc.mockRejectedValue(unavailableError());
    const { getCurrentUserSuperRecord } = await import('../src/lib/superintendentService');
    await expect(getCurrentUserSuperRecord()).rejects.toThrow('unavailable');
  });

  it('propaga erro de rede em vez de virar null', async () => {
    mockAuth.currentUser = { email: 'super.ativo@example.com' };
    mockGetDoc.mockRejectedValue(new Error('network error'));
    const { getCurrentUserSuperRecord } = await import('../src/lib/superintendentService');
    await expect(getCurrentUserSuperRecord()).rejects.toThrow('network error');
  });
});

describe('loadSuperintendentsFromFirestore', () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('propaga falha do Firestore em vez de retornar lista vazia', async () => {
    mockGetDocs.mockRejectedValue(permissionDeniedError());
    const { loadSuperintendentsFromFirestore } = await import('../src/lib/superintendentService');
    await expect(loadSuperintendentsFromFirestore()).rejects.toThrow('Missing or insufficient permissions.');
  });
});

describe('syncSuperintendentsFromFirestore', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuth.currentUser = null;
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('propaga falha técnica ao chamador (App.tsx) em vez de resolver silenciosamente', async () => {
    mockAuth.currentUser = { email: 'super.ativo@example.com' };
    mockGetDoc.mockRejectedValue(permissionDeniedError());
    const { syncSuperintendentsFromFirestore } = await import('../src/lib/superintendentService');
    await expect(syncSuperintendentsFromFirestore()).rejects.toThrow('Missing or insufficient permissions.');
  });

  it('admin raiz: falha ao carregar a lista completa propaga em vez de virar sucesso silencioso', async () => {
    mockAuth.currentUser = { email: ADMIN_EMAIL };
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockRejectedValue(unavailableError());
    const { syncSuperintendentsFromFirestore } = await import('../src/lib/superintendentService');
    await expect(syncSuperintendentsFromFirestore()).rejects.toThrow('unavailable');
  });

  it('usuário genuinamente não cadastrado não gera erro técnico (resolve normalmente)', async () => {
    mockAuth.currentUser = { email: 'estranho@example.com' };
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const { syncSuperintendentsFromFirestore } = await import('../src/lib/superintendentService');
    await expect(syncSuperintendentsFromFirestore()).resolves.toBeUndefined();
  });
});
