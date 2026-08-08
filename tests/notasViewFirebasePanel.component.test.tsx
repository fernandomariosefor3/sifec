// @vitest-environment jsdom
// Hotfix original: o painel "Ativar Conexão com Firebase" de NotasView
// (login/seed/desconectar manuais) exibia um texto hardcoded referenciando
// o projeto Firebase de outro sistema (emdiafinanceiro-13483). A Fase 2C
// removeu esse painel manual por completo ao reescrever NotasView.tsx
// (substituição pelo módulo de Notas Bimestrais, na Fase 2C.1 corrigido
// para o acompanhamento agregado por turma — ver
// docs/descontinuacao-prototipo-notas-nominais.md) — este arquivo agora
// confirma que a proteção original continua válida: nenhum painel manual,
// nenhuma referência ao projeto errado, em nenhum ambiente.
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
    currentUser: null,
    onAuthStateChanged: (callback: (user: unknown) => void) => {
      callback(null);
      return () => {};
    },
  },
}));

vi.mock('../src/lib/firebaseService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/firebaseService')>();
  return { ...actual, subscribeToCollection: () => () => {} };
});

vi.mock('../src/lib/gradeEntryMonitoringService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/gradeEntryMonitoringService')>();
  return { ...actual, listGradeEntryMonitoringForSchool: vi.fn().mockResolvedValue([]) };
});

describe('NotasView — sem painel manual de conexão Firebase (Fase 2C removeu essa UI)', () => {
  it('nunca renderiza um painel de conexão/seed manual, em produção', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    render(<NotasView />);

    expect(screen.queryByText(/Ativar Conexão com Firebase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Inserir Cópia Temp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Puxar do Firebase/i)).not.toBeInTheDocument();
  });

  it('nunca renderiza um painel de conexão/seed manual, em desenvolvimento', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);
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

  it('modo demonstração (sem Firestore) continua funcionando em produção', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);
    render(<NotasView />);

    expect(screen.getByText('Acompanhamento de Notas')).toBeInTheDocument();
  });
});
