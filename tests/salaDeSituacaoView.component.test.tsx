// @vitest-environment jsdom
// Fase 2D — Sala de Situação (SalaDeSituacaoView + subcomponentes). Usa o
// superintendentService.ts REAL (via localStorage, mesmo padrão de
// tests/fluxoView.component.test.tsx) para exercitar o escopo multiusuário
// de verdade — só firebase.ts (auth) e schoolSituationService.ts são
// mockados (a orquestração Firestore em si já é coberta por
// tests/schoolSituationService.test.ts). Assinatura da escola sempre
// confirmada DENTRO da tabela (within), porque o mesmo nome também aparece
// como opção no seletor de escola — getByText sem escopo bateria nos dois.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within, act } from '@testing-library/react';
import SalaDeSituacaoView from '../src/components/SalaDeSituacaoView';
import { getSuperintendents, saveSuperintendents, setActiveSuperintendentId, setAdminSchoolScope } from '../src/lib/superintendentService';
import type { SchoolSituation } from '../src/types/schoolSituation';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { authStateListeners, mockAuth, mockFetchAllTurmas, mockFetchAllVisitas, mockFetchPortfolioSituations, mockFetchSchoolSituation } = vi.hoisted(() => {
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
    mockFetchAllTurmas: vi.fn(),
    mockFetchAllVisitas: vi.fn(),
    mockFetchPortfolioSituations: vi.fn(),
    mockFetchSchoolSituation: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/schoolSituationService', () => ({
  fetchAllTurmas: (...args: unknown[]) => mockFetchAllTurmas(...args),
  fetchAllVisitas: (...args: unknown[]) => mockFetchAllVisitas(...args),
  fetchPortfolioSituations: (...args: unknown[]) => mockFetchPortfolioSituations(...args),
  fetchSchoolSituation: (...args: unknown[]) => mockFetchSchoolSituation(...args),
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

function buildSituation(schoolId: string, escolaNome: string, overrides: Partial<SchoolSituation> = {}): SchoolSituation {
  return {
    schoolId, codInep: `INEP-${schoolId}`, escolaNome, anoLetivo: 2026,
    estrutura: { turmasCadastradas: 4, turmasAtivas: 4, matriculaInicial: 100, matriculaAtual: 98, mediaAlunosPorTurma: 24.5, anoLetivoConfigurado: true, dataQuality: 'atualizado' },
    matricula: { matriculaInicial: 100, novasMatriculas: 5, transferenciasEntrada: 0, transferenciasSaida: 1, abandono: 0, outrasSaidas: 0, matriculaFinalCalculada: 98, ultimoMesPreenchido: '2026-03', quantidadeMesesRegistrados: 3, quantidadeMesesPendentes: 0, dataQuality: 'atualizado' },
    fluxo: { aprovados: 80, reprovados: 10, abandono: 8, totalInformado: 98, percentualAprovacao: 81.6, percentualReprovacao: 10.2, percentualAbandono: 8.2, status: 'confirmado', dataQuality: 'atualizado' },
    notas: null,
    visitas: { quantidadeVisitasNoAno: 1, dataUltimaVisita: '2026-03-10', semVisitaNoAno: false, dataQuality: 'atualizado' },
    pendencias: [],
    inconsistencias: [],
    qualidadeGeral: 'atualizado',
    sourceFailures: [],
    ...overrides,
  };
}

async function loginAs(email: string) {
  await act(async () => {
    mockAuth.currentUser = { email };
    authStateListeners.forEach(cb => cb({ email }));
  });
}

async function getTable() {
  return screen.findByRole('table');
}

describe('SalaDeSituacaoView', () => {
  beforeEach(() => {
    localStorage.clear();
    authStateListeners.length = 0;
    mockAuth.currentUser = null;
    mockFetchAllTurmas.mockReset().mockResolvedValue([]);
    mockFetchAllVisitas.mockReset().mockResolvedValue([]);
    mockFetchPortfolioSituations.mockReset().mockImplementation(async (schools: Array<{ id: string; nome: string }>) =>
      Object.fromEntries(schools.map(s => [s.id, buildSituation(s.id, s.nome)]))
    );
    mockFetchSchoolSituation.mockReset();
  });

  it('sem escola selecionada mostra a tabela consolidada, não o detalhe', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);

    const table = await getTable();
    expect(within(table).getByText('EEM Diva Cabral')).toBeInTheDocument();
    expect(screen.queryByText('Fechar detalhe')).not.toBeInTheDocument();
  });

  it('visão carteira: superintendente comum não vê escola fora da própria carteira', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);

    const table = await getTable();
    expect(within(table).getByText('EEM Diva Cabral')).toBeInTheDocument();
    expect(screen.queryByText('EEM Figueiredo Correia')).not.toBeInTheDocument();
    expect(mockFetchPortfolioSituations).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'diva-cabral' })], expect.anything(), expect.anything(), expect.any(Number), expect.anything()
    );
  });

  it('administrador alterna entre carteira (7 escolas) e visão global (56 escolas)', async () => {
    setAdminSchoolScope('portfolio');

    render(<SalaDeSituacaoView />);
    await loginAs(ADMIN_EMAIL);
    await waitFor(() => expect(screen.getByText('7 Escolas')).toBeInTheDocument());

    act(() => {
      setAdminSchoolScope('global');
    });
    await waitFor(() => expect(screen.getByText('56 Escolas')).toBeInTheDocument());
  });

  it('ação "Ver detalhes" abre o painel da escola e "Fechar detalhe" volta à tabela', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);
    await getTable();

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));
    await waitFor(() => expect(screen.getByText('Detalhe da escola — 2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhe' }));
    await waitFor(() => expect(screen.queryByText('Detalhe da escola — 2026')).not.toBeInTheDocument());
    await getTable();
  });

  it('filtro por qualidade dos dados esconde escolas que não correspondem', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockFetchPortfolioSituations.mockImplementation(async (schools: Array<{ id: string; nome: string }>) =>
      Object.fromEntries(schools.map(s => [
        s.id,
        buildSituation(s.id, s.nome, s.id === 'diva-cabral' ? { qualidadeGeral: 'atualizado' } : { qualidadeGeral: 'sem_dados' }),
      ]))
    );

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);
    let table = await getTable();
    expect(within(table).getByText('EEM Diva Cabral')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Situação dos dados'), { target: { value: 'sem_dados' } });

    await waitFor(() => {
      table = screen.getByRole('table');
      expect(within(table).queryByText('EEM Diva Cabral')).not.toBeInTheDocument();
    });
    expect(within(table).getByText('EEM Figueiredo Correia')).toBeInTheDocument();
  });

  it('filtro por tipo de pendência mostra só escolas com aquela pendência', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const pendenciaFluxo = [{
      type: 'fluxo_nao_informado' as const, schoolId: 'diva-cabral', message: 'Fluxo escolar ainda não foi informado.',
      period: '2026', sourceCollection: 'school_flow_results', resolutionAction: 'Registrar o fluxo escolar em Fluxo Escolar.',
    }];
    mockFetchPortfolioSituations.mockImplementation(async (schools: Array<{ id: string; nome: string }>) =>
      Object.fromEntries(schools.map(s => [
        s.id,
        buildSituation(s.id, s.nome, s.id === 'diva-cabral' ? { pendencias: pendenciaFluxo } : {}),
      ]))
    );

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);
    let table = await getTable();
    expect(within(table).getByText('EEM Diva Cabral')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tipo de pendência'), { target: { value: 'fluxo_nao_informado' } });

    await waitFor(() => {
      table = screen.getByRole('table');
      expect(within(table).queryByText('EEM Figueiredo Correia')).not.toBeInTheDocument();
    });
    expect(within(table).getByText('EEM Diva Cabral')).toBeInTheDocument();
  });

  it('erro real de carregamento permanece visível, com "Tentar novamente"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockFetchAllTurmas.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);

    await waitFor(() => expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    mockFetchAllTurmas.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.queryByText('Missing or insufficient permissions.')).not.toBeInTheDocument());
  });

  it('nenhuma informação nominal é exibida, mesmo no detalhe da escola', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    // Superintendente comum sempre usa escopo 'carteira' (poucas escolas),
    // então o detalhe vem de fetchPortfolioSituations, não de
    // fetchSchoolSituation (só usada na visão global — ver useSchoolSituation.ts).
    mockFetchPortfolioSituations.mockImplementation(async (schools: Array<{ id: string; nome: string }>) =>
      Object.fromEntries(schools.map(s => [s.id, buildSituation(s.id, s.nome, {
        notas: { estudantesAtivos: 30, completos: 20, parciais: 8, semNotas: 2, abaixoReferencia: 5, percentualPreenchimento: 90, turmasComPreenchimentoCompleto: 1, turmasComPendencia: 1, dataQuality: 'incompleto' },
      })]))
    );

    render(<SalaDeSituacaoView />);
    await loginAs(SUPER_A_EMAIL);
    await getTable();

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/i }));
    await waitFor(() => expect(screen.getByText('Detalhe da escola — 2026')).toBeInTheDocument());

    expect(screen.queryByText(/studentName/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Estudante /)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/CPF/i);
  });

  it('modo demonstração nunca aparece depois do login', async () => {
    render(<SalaDeSituacaoView />);
    await waitFor(() => expect(screen.getByText('Modo demonstração — faça login para ver dados reais')).toBeInTheDocument());
    // Número claramente fictício do fixture de demonstração (nunca
    // coincide com o que o mock real usa abaixo, 98).
    const demoTable = await getTable();
    expect(within(demoTable).getByText('472')).toBeInTheDocument();

    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    await loginAs(SUPER_A_EMAIL);

    await waitFor(() =>
      expect(screen.queryByText('Modo demonstração — faça login para ver dados reais')).not.toBeInTheDocument()
    );
    const realTable = await getTable();
    await waitFor(() => expect(within(realTable).getByText('EEM Diva Cabral')).toBeInTheDocument());
    expect(within(realTable).queryByText('472')).not.toBeInTheDocument();
    expect(within(realTable).getByText('98')).toBeInTheDocument();
  });
});
