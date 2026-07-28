// @vitest-environment jsdom
// Hotfix estabilização — seção 5: falha ao sincronizar o cadastro do
// superintendente depois do login não pode virar uma rejeição não tratada
// nem ficar só no console (ver App.tsx, dentro de auth.onAuthStateChanged).
// As views de cada aba são stubadas porque não são o alvo deste teste — só
// o fluxo de autenticação/sincronização importa aqui.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import App from '../src/App';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { authStateListeners, mockAuth, mockSync, mockLogin } = vi.hoisted(() => {
  const listeners: Array<(user: unknown) => void> = [];
  return {
    authStateListeners: listeners,
    mockAuth: {
      currentUser: null as { email: string } | null,
      onAuthStateChanged: (cb: (user: unknown) => void) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
    },
    mockSync: vi.fn(),
    mockLogin: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
  loginWithGoogle: mockLogin,
  logout: vi.fn(),
  EXPECTED_FIREBASE_PROJECT_ID: 'sifec-sefor3',
}));

vi.mock('../src/lib/firebaseService', () => ({
  SEED_SCHOOLS: [],
}));

vi.mock('../src/lib/superintendentService', () => ({
  getSuperintendents: () => [],
  getActiveSuperintendentId: () => 'all',
  setActiveSuperintendentId: vi.fn(),
  syncSuperintendentsFromFirestore: () => mockSync(),
  ADMIN_EMAIL: 'fernandomariodasmartins@gmail.com',
  getWatchedSchoolCount: () => 0,
  getSchoolsForCurrentScope: () => [],
  getSchoolScopeLabel: () => '',
  getAdminSchoolScope: () => 'portfolio',
  setAdminSchoolScope: vi.fn(),
  isScopedAdmin: () => false,
}));

vi.mock('../src/components/EscolasView', () => ({ default: () => <div>EscolasView (stub)</div> }));
vi.mock('../src/components/FluxoView', () => ({ default: () => <div>FluxoView (stub)</div> }));
vi.mock('../src/components/NotasView', () => ({ default: () => <div>NotasView (stub)</div> }));
vi.mock('../src/components/CdgView', () => ({ default: () => <div>CdgView (stub)</div> }));
vi.mock('../src/components/ExtraViews', () => ({
  BuscaAtivaView: () => <div>BuscaAtivaView (stub)</div>,
  PpdtView: () => <div>PpdtView (stub)</div>,
  RecomposicaoView: () => <div>RecomposicaoView (stub)</div>,
}));
vi.mock('../src/components/SuperintendentesView', () => ({ default: () => <div>SuperintendentesView (stub)</div> }));
vi.mock('../src/components/DevPanel', () => ({ default: () => <div>DevPanel (stub)</div> }));

describe('App — sincronização pós-login', () => {
  beforeEach(() => {
    authStateListeners.length = 0;
    mockAuth.currentUser = null;
  });

  it('falha na sincronização de superintendentes é apresentada de forma visível, não só no console', async () => {
    mockSync.mockRejectedValue(new Error('permission-denied'));
    render(<App />);

    expect(authStateListeners.length).toBeGreaterThan(0);

    await act(async () => {
      mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
      authStateListeners[0]({ email: 'fernandomariodasmartins@gmail.com' });
    });

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível concluir a sincronização do seu acesso. Tente novamente.')
      ).toBeInTheDocument()
    );
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it('sincronização bem-sucedida não mostra nenhum erro', async () => {
    mockSync.mockResolvedValue(undefined);
    render(<App />);

    await act(async () => {
      mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
      authStateListeners[0]({ email: 'fernandomariodasmartins@gmail.com' });
    });

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText('Não foi possível concluir a sincronização do seu acesso. Tente novamente.')
    ).not.toBeInTheDocument();
  });

  it('retry de erro de sincronização repete somente a sincronização — nunca chama loginWithGoogle (hotfix estabilização, seção 2)', async () => {
    mockSync.mockRejectedValueOnce(new Error('permission-denied'));
    mockSync.mockResolvedValueOnce(undefined);
    render(<App />);

    await act(async () => {
      mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
      authStateListeners[0]({ email: 'fernandomariodasmartins@gmail.com' });
    });

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível concluir a sincronização do seu acesso. Tente novamente.')
      ).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    });

    await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('retry de sincronização bem-sucedido limpa o erro e libera o sistema', async () => {
    mockSync.mockRejectedValueOnce(new Error('unavailable'));
    mockSync.mockResolvedValueOnce(undefined);
    render(<App />);

    await act(async () => {
      mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
      authStateListeners[0]({ email: 'fernandomariodasmartins@gmail.com' });
    });

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível concluir a sincronização do seu acesso. Tente novamente.')
      ).toBeInTheDocument()
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    });

    await waitFor(() =>
      expect(
        screen.queryByText('Não foi possível concluir a sincronização do seu acesso. Tente novamente.')
      ).not.toBeInTheDocument()
    );
  });

  it('falha técnica de sincronização não mostra "conta não cadastrada" nem "conta inativa"', async () => {
    mockSync.mockRejectedValue(new Error('permission-denied'));
    render(<App />);

    await act(async () => {
      mockAuth.currentUser = { email: 'super.tecnico@example.com' };
      authStateListeners[0]({ email: 'super.tecnico@example.com' });
    });

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível concluir a sincronização do seu acesso. Tente novamente.')
      ).toBeInTheDocument()
    );
    expect(
      screen.queryByText('Sua conta não está cadastrada no SIFEC — contate o administrador.')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Sua conta está inativa no SIFEC — contate o administrador.')
    ).not.toBeInTheDocument();
  });
});
