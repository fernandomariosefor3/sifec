// @vitest-environment jsdom
// Fase 2C.1 — orquestração de NotasView (seleção de escola, escopo
// multiusuário, filtros, estados vazios, recarregamento após salvar, modo
// demonstração, ano letivo). Usa o superintendentService.ts REAL (via
// localStorage, mesmo padrão de tests/fluxoView.component.test.tsx) para
// exercitar o escopo de verdade — só firebase.ts (auth) e
// gradeEntryMonitoringService.ts são mockados. NotasView agora é o
// acompanhamento AGREGADO por turma (nunca por estudante — ver
// docs/descontinuacao-prototipo-notas-nominais.md); não há mais drill-down
// por estudante, cada turma já tem sua própria ação "Registrar/Atualizar
// acompanhamento" direto na tabela.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import NotasView from '../src/components/NotasView';
import { getSuperintendents, saveSuperintendents, setActiveSuperintendentId, setAdminSchoolScope } from '../src/lib/superintendentService';

const FIXED_NOW = new Date('2026-03-15T12:00:00.000Z');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const { authStateListeners, mockAuth, mockListMonitoring, mockSaveMonitoring } = vi.hoisted(() => {
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
    mockListMonitoring: vi.fn(),
    mockSaveMonitoring: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

// subscribeToCollection('turmas', ...) real tentaria abrir um onSnapshot
// contra o Firestore de verdade — nestes testes as turmas continuam vindo
// de SEED_TURMAS, preservando os demais exports reais (SEED_SCHOOLS/
// SEED_TURMAS).
vi.mock('../src/lib/firebaseService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/firebaseService')>();
  return { ...actual, subscribeToCollection: () => () => {} };
});

vi.mock('../src/lib/gradeEntryMonitoringService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/gradeEntryMonitoringService')>();
  return {
    ...actual,
    listGradeEntryMonitoringForSchool: (...args: unknown[]) => mockListMonitoring(...args),
    saveGradeEntryMonitoring: (...args: unknown[]) => mockSaveMonitoring(...args),
  };
});

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const SUPER_A_EMAIL = 'super.a@example.com';
const DIVA_SCHOOL_ID = 'diva-cabral';

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

async function loginAs(email: string) {
  await act(async () => {
    mockAuth.currentUser = { email };
    authStateListeners.forEach(cb => cb({ email }));
  });
}

async function selectSchool(name: string) {
  fireEvent.change(screen.getByLabelText('Escola'), { target: { value: getSchoolIdByName(name) } });
}

// SEED_SCHOOLS ids usados nestes testes — evita depender de um lookup
// pesado só para resolver o value do <option>.
function getSchoolIdByName(name: string): string {
  const map: Record<string, string> = {
    'EEM Diva Cabral': 'diva-cabral',
    'EEM Figueiredo Correia': 'figueiredo-correia',
    'EEMTI Estado do Amazonas': 'estado-amazonas',
  };
  return map[name];
}

describe('NotasView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    localStorage.clear();
    authStateListeners.length = 0;
    mockAuth.currentUser = null;
    mockListMonitoring.mockReset().mockResolvedValue([]);
    mockSaveMonitoring.mockReset();
  });

  it('sem escola selecionada, nenhum acompanhamento é carregado', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);

    expect(screen.getByText('Selecione uma escola para carregar o acompanhamento de notas.')).toBeInTheDocument();
    expect(mockListMonitoring).not.toHaveBeenCalled();
  });

  it('escola sem turma cadastrada mostra orientação (nunca cria turma automaticamente)', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEMTI Estado do Amazonas'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEMTI Estado do Amazonas');

    await waitFor(() =>
      expect(
        screen.getByText('Nenhuma turma cadastrada para esta escola e ano letivo — cadastre a turma em Gestão de Escolas.')
      ).toBeInTheDocument()
    );
  });

  it('escola com turmas mas sem relatório informado mostra o estado real por turma (nunca dado fictício)', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListMonitoring.mockResolvedValue([]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
    expect(screen.getByText('3º Ano B - Vespertino')).toBeInTheDocument();
    expect(screen.getAllByText('Relatório não informado').length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Registrar acompanhamento' })).toHaveLength(2);
  });

  it('turma com relatório completo mostra os totais e a ação "Atualizar acompanhamento"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListMonitoring.mockResolvedValue([{
      id: 'diva-cabral_2026_b1_turma-3a-diva',
      schoolId: DIVA_SCHOOL_ID, codInep: '23067918', escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', anoLetivo: 2026, bimestre: 1,
      totalStudents: 32, studentsWithCompleteGrades: 32, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
      expectedGradeEntries: 128, completedGradeEntries: 128, status: 'confirmado', sourceSystem: 'SIGE Escola',
      referenceDate: '2026-03-10',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL,
    }]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    // "Preenchimento completo" aparece duas vezes (rótulo do cartão-resumo
    // + badge da linha da turma) — getAllByText em vez de getByText.
    await waitFor(() => expect(screen.getAllByText('Preenchimento completo').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: 'Atualizar acompanhamento' })).toBeInTheDocument();

    // Nunca inclui nome de estudante — só totais agregados por turma.
    expect(document.body.textContent).not.toMatch(/Estudante/);
  });

  it('sucesso no registro do acompanhamento (onSaved do modal) recarrega os dados', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListMonitoring.mockResolvedValue([]);
    mockSaveMonitoring.mockResolvedValue(undefined);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar acompanhamento' })[0]);
    expect(screen.getByText('Registrar dados do relatório')).toBeInTheDocument();

    const fields: Record<string, string> = {
      'Total de estudantes': '30', 'Estudantes com notas completas': '30', 'Estudantes com preenchimento parcial': '0',
      'Estudantes sem notas': '0', 'Total de lançamentos esperados': '120', 'Total de lançamentos realizados': '120',
    };
    for (const [label, value] of Object.entries(fields)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-03-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(mockSaveMonitoring).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledTimes(2));
  });

  it('erro real de carregamento permanece visível, com "Tentar novamente"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListMonitoring.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() => expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    mockListMonitoring.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.queryByText('Missing or insufficient permissions.')).not.toBeInTheDocument());
  });

  it('superintendente comum não vê escola alheia', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);

    const select = screen.getByLabelText('Escola') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map(o => o.textContent);
    expect(optionLabels).toContain('EEM Diva Cabral');
    expect(optionLabels).not.toContain('EEM Figueiredo Correia');
  });

  it('administrador alterna entre carteira (7 acompanhadas) e visão global (56 escolas)', async () => {
    setAdminSchoolScope('portfolio');

    render(<NotasView />);
    await loginAs(ADMIN_EMAIL);
    await waitFor(() => expect(screen.getByText('7 acompanhadas')).toBeInTheDocument());

    act(() => {
      setAdminSchoolScope('global');
    });
    await waitFor(() => expect(screen.getByText(/Acesso global — 56 escolas/)).toBeInTheDocument());
  });

  it('dados demonstrativos não aparecem mais depois de autenticado (nunca fallback pós-login)', async () => {
    // Sem login, o admin padrão (fernando-mario) já acompanha EEM Diva
    // Cabral — mesma escola/ano/bimestre dos dados demonstrativos
    // (DEMO_SCHOOL_ID/DEMO_ANO_LETIVO/DEMO_BIMESTRE).
    render(<NotasView />);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() =>
      expect(screen.getByText('Modo demonstração — faça login para ver e registrar dados reais')).toBeInTheDocument()
    );
    // "Preenchimento completo" aparece duas vezes (rótulo do cartão-resumo
    // + badge da linha da turma) — getAllByText em vez de getByText.
    await waitFor(() => expect(screen.getAllByText('Preenchimento completo').length).toBeGreaterThan(0));

    mockListMonitoring.mockResolvedValue([]);
    await loginAs(ADMIN_EMAIL);

    await waitFor(() =>
      expect(screen.queryByText('Modo demonstração — faça login para ver e registrar dados reais')).not.toBeInTheDocument()
    );
    await waitFor(() => expect(mockListMonitoring).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText('Relatório não informado').length).toBeGreaterThan(0));
  });

  describe('Ano letivo', () => {
    it('seletor mostra anterior/corrente/seguinte ancorados no ano real do sistema — nunca preso em 2026', async () => {
      vi.setSystemTime(new Date('2031-06-01T00:00:00.000Z'));
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);

      const select = screen.getByLabelText('Ano letivo') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map(o => o.value);
      expect(optionValues).toEqual(['2030', '2031', '2032']);
      expect(select.value).toBe('2031');
    });

    it('trocar o ano letivo fecha modais abertos e recarrega o acompanhamento do novo ano', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValue([]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledTimes(1));
      expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2026, 1);

      fireEvent.click(screen.getAllByRole('button', { name: 'Registrar acompanhamento' })[0]);
      expect(screen.getByText('Registrar dados do relatório')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Ano letivo'), { target: { value: '2025' } });

      // Modal fechado — nunca sobrevive à troca de ano letivo.
      expect(screen.queryByText('Registrar dados do relatório')).not.toBeInTheDocument();
      await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2025, 1));
    });
  });
});
