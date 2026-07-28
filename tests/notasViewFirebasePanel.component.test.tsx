// @vitest-environment jsdom
// Hotfix — o painel "Ativar Conexão com Firebase" de NotasView (login/seed/
// desconectar manuais) exibia um texto hardcoded referenciando o projeto
// Firebase de outro sistema (emdiafinanceiro-13483) e ficava visível para
// qualquer usuário em produção. Ele agora só existe em desenvolvimento
// (import.meta.env.DEV) e, quando visível, mostra o projectId real vindo de
// firebase-applet-config.json (sifec-sefor3) em vez do texto incorreto.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NotasView from '../src/components/NotasView';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

vi.mock('../src/lib/firebase', () => ({
  auth: {
    onAuthStateChanged: (callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    },
  },
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../src/lib/firebaseService', () => ({
  seedFirestoreDatabase: vi.fn(),
  subscribeToCollection: () => () => {},
  updateDocument: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
  SEED_GRADES: [],
  SEED_TURMAS: [],
  SEED_SCHOOLS: [],
}));

vi.mock('../src/lib/superintendentService', () => ({
  isSchoolVisible: () => true,
  getActiveSuperintendentId: () => 'all',
  hasSchoolWriteAccess: () => true,
  schoolNamesMatch: (a: string, b: string) => a === b,
}));

describe('NotasView — painel manual de conexão Firebase', () => {
  it('não renderiza o painel de conexão/seed manual em produção', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    render(<NotasView />);

    expect(screen.queryByText(/Ativar Conexão com Firebase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Inserir Cópia Temp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Puxar do Firebase/i)).not.toBeInTheDocument();
  });

  it('nunca exibe o ID de outro projeto (emdiafinanceiro-13483), nem em produção nem em desenvolvimento', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    const { unmount } = render(<NotasView />);
    expect(screen.queryByText(/emdiafinanceiro/i)).not.toBeInTheDocument();
    unmount();

    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
    render(<NotasView />);
    expect(screen.queryByText(/emdiafinanceiro/i)).not.toBeInTheDocument();
  });

  it('mantém o painel manual em desenvolvimento, para uso local do time', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
    render(<NotasView />);

    expect(screen.getByText(/Ativar Conexão com Firebase/i)).toBeInTheDocument();
    expect(screen.getByText(/Puxar do Firebase/i)).toBeInTheDocument();
  });

  it('modo demonstração (sem Firestore) continua funcionando em produção', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    render(<NotasView />);

    expect(screen.getByText('Lançamento & Monitoramento de Notas')).toBeInTheDocument();
  });
});
