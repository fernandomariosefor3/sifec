// @vitest-environment jsdom
// Hotfix estabilização — isCurrentUserAuthorized() (ver
// src/lib/superintendentService.ts) distingue "não cadastrado"/"inativo" de
// "admin raiz" e "superintendente ativo". Precisa de jsdom só por causa do
// localStorage usado por getSuperintendents(); auth.currentUser é mockado
// para não depender do Firebase de verdade.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { email: string } | null },
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
}));

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';

describe('isCurrentUserAuthorized', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAuth.currentUser = null;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('retorna false quando ninguém está logado', async () => {
    const { isCurrentUserAuthorized } = await import('../src/lib/superintendentService');
    expect(isCurrentUserAuthorized()).toBe(false);
  });

  it('admin raiz continua autorizado mesmo sem registro em superintendents', async () => {
    mockAuth.currentUser = { email: ADMIN_EMAIL };
    const { isCurrentUserAuthorized } = await import('../src/lib/superintendentService');
    expect(isCurrentUserAuthorized()).toBe(true);
  });

  it('usuário não cadastrado é bloqueado', async () => {
    mockAuth.currentUser = { email: 'estranho@example.com' };
    const { isCurrentUserAuthorized } = await import('../src/lib/superintendentService');
    expect(isCurrentUserAuthorized()).toBe(false);
  });

  it('superintendente ativo e cadastrado é autorizado', async () => {
    mockAuth.currentUser = { email: 'super.ativo@example.com' };
    const { getSuperintendents, saveSuperintendents, isCurrentUserAuthorized } = await import('../src/lib/superintendentService');
    saveSuperintendents([
      ...getSuperintendents(),
      { id: 'super-ativo', nome: 'Super Ativo', cargo: 'Superintendente Regional', email: 'super.ativo@example.com', escolas: [], ativo: true, role: 'superintendent' },
    ]);
    expect(isCurrentUserAuthorized()).toBe(true);
  });

  it('superintendente inativo é bloqueado', async () => {
    mockAuth.currentUser = { email: 'super.inativo@example.com' };
    const { getSuperintendents, saveSuperintendents, isCurrentUserAuthorized } = await import('../src/lib/superintendentService');
    saveSuperintendents([
      ...getSuperintendents(),
      { id: 'super-inativo', nome: 'Super Inativo', cargo: 'Superintendente Regional', email: 'super.inativo@example.com', escolas: [], ativo: false, role: 'superintendent' },
    ]);
    expect(isCurrentUserAuthorized()).toBe(false);
  });
});
