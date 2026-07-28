// @vitest-environment jsdom
// Fase 2B — Fluxo Escolar (FluxoView + SchoolFlowTable). Usa o
// superintendentService.ts REAL (via localStorage, mesmo padrão de
// tests/isCurrentUserAuthorized.test.ts) para exercitar o escopo
// multiusuário de verdade — só firebase.ts (auth) e schoolFlowService.ts
// são mockados. SchoolFlowResultModal é substituído por um stub simples:
// seu comportamento próprio já é coberto por
// tests/schoolFlowResultModal.component.test.tsx — aqui o alvo é a
// orquestração de FluxoView (escopo, carregamento, erro, refresh, modo
// demonstração).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import FluxoView from '../src/components/FluxoView';
import { getSuperintendents, saveSuperintendents, setActiveSuperintendentId, setAdminSchoolScope } from '../src/lib/superintendentService';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { authStateListeners, mockAuth, mockList } = vi.hoisted(() => {
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
    mockList: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/schoolFlowService', () => ({
  listSchoolFlowResultsForSchools: (...args: unknown[]) => mockList(...args),
}));

vi.mock('../src/components/SchoolFlowResultModal', () => ({
  default: (props: { school: { nome: string }; onSaved: () => void; onClose: () => void }) => (
    <div data-testid="flow-modal">
      <span>Formulário aberto — {props.school.nome}</span>
      <button onClick={props.onSaved}>Simular salvar</button>
      <button onClick={props.onClose}>Fechar</button>
    </div>
  ),
}));

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const SUPER_A_EMAIL = 'super.a@example.com';

function superComEscolas(email: string, escolas: string[], overrides: Record<string, unknown> = {}) {
  return {
    id: `super-${email}`,
    nome: 'Superintendente Teste',
    cargo: 'Superintendente Regional',
    email,
    escolas,
    ativo: true,
    role: 'superintendent' as const,
    ...overrides,
  };
}

// Simula auth.onAuthStateChanged entregando o usuário autenticado — mesmo
// padrão de tests/appAuthSync.component.test.tsx.
async function loginAs(email: string) {
  await act(async () => {
    mockAuth.currentUser = { email };
    authStateListeners.forEach(cb => cb({ email }));
  });
}

describe('FluxoView', () => {
  beforeEach(() => {
    localStorage.clear();
    authStateListeners.length = 0;
    mockAuth.currentUser = null;
    mockList.mockReset();
  });

  it('escola sem resultado mostra "Não informado"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockList.mockResolvedValue({});

    render(<FluxoView />);
    await loginAs(SUPER_A_EMAIL);

    await waitFor(() => expect(screen.getByText('EEM Diva Cabral')).toBeInTheDocument());
    expect(screen.getByText('Não informado')).toBeInTheDocument();
  });

  it('botão "Preencher fluxo" abre o formulário com a escola certa', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockList.mockResolvedValue({});

    render(<FluxoView />);
    await loginAs(SUPER_A_EMAIL);
    await waitFor(() => expect(screen.getByText('EEM Diva Cabral')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Preencher fluxo' }));

    expect(screen.getByTestId('flow-modal')).toBeInTheDocument();
    expect(screen.getByText('Formulário aberto — EEM Diva Cabral')).toBeInTheDocument();
  });

  it('sucesso (onSaved do modal) recarrega a tabela', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockList.mockResolvedValue({});

    render(<FluxoView />);
    await loginAs(SUPER_A_EMAIL);
    await waitFor(() => expect(screen.getByText('EEM Diva Cabral')).toBeInTheDocument());
    expect(mockList).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Preencher fluxo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simular salvar' }));

    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('erro real de carregamento permanece visível, com "Tentar novamente"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockList.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

    render(<FluxoView />);
    await loginAs(SUPER_A_EMAIL);

    await waitFor(() => expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    mockList.mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.queryByText('Missing or insufficient permissions.')).not.toBeInTheDocument());
  });

  it('superintendente comum não vê escola alheia', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockList.mockResolvedValue({});

    render(<FluxoView />);
    await loginAs(SUPER_A_EMAIL);

    await waitFor(() => expect(screen.getByText('EEM Diva Cabral')).toBeInTheDocument());
    expect(screen.queryByText('EEM Figueiredo Correia')).not.toBeInTheDocument();
    expect(mockList).toHaveBeenCalledWith(['diva-cabral'], expect.any(Number));
  });

  it('administrador alterna entre carteira (7 escolas) e visão global (56 escolas)', async () => {
    mockList.mockResolvedValue({});
    setAdminSchoolScope('portfolio');

    render(<FluxoView />);
    await loginAs(ADMIN_EMAIL);
    await waitFor(() => expect(screen.getByText('7 Escolas')).toBeInTheDocument());

    act(() => {
      setAdminSchoolScope('global');
    });
    await waitFor(() => expect(screen.getByText('56 Escolas')).toBeInTheDocument());
  });

  it('dados demonstrativos não aparecem como reais depois de autenticado', async () => {
    // Modo demonstração (deslogado): os totais fictícios de
    // DEMO_SCHOOL_FLOW_RESULTS aparecem normalmente.
    render(<FluxoView />);
    await waitFor(() =>
      expect(screen.getByText('Modo demonstração — faça login para ver e registrar dados reais')).toBeInTheDocument()
    );
    await waitFor(() => expect(screen.getByText('712')).toBeInTheDocument());

    // Autenticado: o serviço real (mockado aqui) passa a ser a ÚNICA fonte
    // — mesmo sem nenhum resultado ainda, o valor demonstrativo (712) nunca
    // deve continuar aparecendo como se fosse real.
    mockList.mockResolvedValue({});
    await loginAs(ADMIN_EMAIL);

    await waitFor(() =>
      expect(screen.queryByText('Modo demonstração — faça login para ver e registrar dados reais')).not.toBeInTheDocument()
    );
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.queryByText('712')).not.toBeInTheDocument();
  });
});
