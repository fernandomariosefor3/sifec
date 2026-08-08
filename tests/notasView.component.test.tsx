// @vitest-environment jsdom
// Fase 2C.1 — orquestração de NotasView (seleção de escola, escopo
// multiusuário, filtros, estados vazios, recarregamento após salvar, modo
// demonstração, ano letivo). Usa o superintendentService.ts REAL (via
// localStorage, mesmo padrão de tests/fluxoView.component.test.tsx) para
// exercitar o escopo de verdade — só firebase.ts (auth), classService.ts
// (listClassroomsForSchool) e gradeEntryMonitoringService.ts são mockados.
// NotasView agora é o acompanhamento AGREGADO por turma (nunca por
// estudante — ver docs/descontinuacao-prototipo-notas-nominais.md); não há
// mais drill-down por estudante, cada turma já tem sua própria ação
// "Registrar/Atualizar acompanhamento" direto na tabela.
//
// Revisão do code review do PR #17: turmas passam a vir de
// listClassroomsForSchool (consulta escopada por escola — seção 2), nunca
// mais de subscribeToCollection('turmas') completo. mockListClassrooms
// simula esse comportamento filtrando SEED_TURMAS por escolaId, provando
// que a consulta é escopada por escola (o mock só devolveria turma de
// outra escola se o chamador pedisse o schoolId errado). Falha de leitura
// de turmas OU de grade_entry_monitoring nunca é tratada como "nenhum
// relatório informado" (seção 1).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import NotasView from '../src/components/NotasView';
import { getSuperintendents, saveSuperintendents, setActiveSuperintendentId, setAdminSchoolScope } from '../src/lib/superintendentService';
import { SEED_TURMAS } from '../src/lib/firebaseService';
import type { Turma } from '../src/types/classroom';

const FIXED_NOW = new Date('2026-03-15T12:00:00.000Z');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const { authStateListeners, mockAuth, mockListMonitoring, mockSaveMonitoring, mockListClassrooms } = vi.hoisted(() => {
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
    mockListClassrooms: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/classService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/classService')>();
  return { ...actual, listClassroomsForSchool: (...args: unknown[]) => mockListClassrooms(...args) };
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
    // Comportamento padrão: filtra SEED_TURMAS por escolaId, provando que a
    // consulta é escopada — nunca a coleção inteira (seção 2 do code
    // review do PR #17).
    mockListClassrooms.mockReset().mockImplementation(async (schoolId: string) =>
      (SEED_TURMAS as unknown as Turma[]).filter(t => t.escolaId === schoolId)
    );
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

    // Integração do fluxo do PR #18: a mensagem não afirma mais que
    // "cadastre a turma em Gestão de Escolas" é o único caminho — o
    // relatório do SIGE também pode criar a turma (ver describe
    // "botão Registrar relatório do SIGE" abaixo).
    await waitFor(() =>
      expect(screen.getByText('Nenhuma turma cadastrada para esta escola e ano letivo.')).toBeInTheDocument()
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

  // Revisão do code review do PR #17, seção 2: turmas consultadas por UMA
  // escola de cada vez (nunca a coleção inteira) — a escola A nunca vê
  // turma da escola B, e a consulta é sempre feita com o schoolId correto.
  it('escola A não carrega turma da escola B — consulta escopada por schoolId', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() => expect(mockListClassrooms).toHaveBeenCalledWith(DIVA_SCHOOL_ID));
    await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
    // mockListClassrooms nunca foi chamado com o schoolId da outra escola —
    // a consulta é sempre escopada à escola selecionada.
    expect(mockListClassrooms).not.toHaveBeenCalledWith('figueiredo-correia');
  });

  it('superintendente com uma única escola: consulta de turmas é feita só com o schoolId dessa escola', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() => expect(mockListClassrooms).toHaveBeenCalledTimes(1));
    expect(mockListClassrooms).toHaveBeenCalledWith(DIVA_SCHOOL_ID);
  });

  it('trocar de escola dispara uma nova consulta escopada de turmas', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListClassrooms).toHaveBeenCalledWith(DIVA_SCHOOL_ID));

    await selectSchool('EEM Figueiredo Correia');
    await waitFor(() => expect(mockListClassrooms).toHaveBeenCalledWith('figueiredo-correia'));
    await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
  });

  describe('falha de leitura de turmas (seção 2 do code review do PR #17)', () => {
    it('falha ao carregar turmas mostra aviso com "Tentar novamente" — nunca "nenhuma turma cadastrada"', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListClassrooms.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');

      await waitFor(() => expect(screen.getByText(/Não foi possível carregar as turmas desta escola/)).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
      expect(screen.queryByText('Nenhuma turma cadastrada para esta escola e ano letivo — cadastre a turma em Gestão de Escolas.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar acompanhamento' })).not.toBeInTheDocument();
    });

    it('falha ao carregar turmas nunca restaura SEED_TURMAS', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListClassrooms.mockRejectedValueOnce(new Error('unavailable'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');

      await waitFor(() => expect(screen.getByText(/Não foi possível carregar as turmas desta escola/)).toBeInTheDocument());
      expect(screen.queryByText('3º Ano A - Matutino')).not.toBeInTheDocument();
    });

    it('retry bem-sucedido depois de uma falha de turmas restaura a tabela normal', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListClassrooms.mockRejectedValueOnce(new Error('unavailable'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(screen.getByText(/Não foi possível carregar as turmas desta escola/)).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
      expect(screen.queryByText(/Não foi possível carregar as turmas desta escola/)).not.toBeInTheDocument();
    });
  });

  describe('falha de leitura de grade_entry_monitoring (seção 1 do code review do PR #17)', () => {
    it('falha nunca classifica turma como "Relatório não informado" nem mostra 0%, e desabilita o registro', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');

      await waitFor(() => expect(screen.getByText('Acompanhamento indisponível — não foi possível carregar o relatório de notas desta escola.')).toBeInTheDocument());
      expect(screen.queryByText('Relatório não informado')).not.toBeInTheDocument();
      expect(screen.queryByText('0%')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Registrar acompanhamento' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Atualizar acompanhamento' })).not.toBeInTheDocument();
    });

    it('retry bem-sucedido depois de uma falha de grade_entry_monitoring restaura tabela e indicadores normais', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockRejectedValueOnce(new Error('unavailable'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(screen.getByText('Acompanhamento indisponível — não foi possível carregar o relatório de notas desta escola.')).toBeInTheDocument());

      mockListMonitoring.mockResolvedValueOnce([]);
      fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

      await waitFor(() => expect(screen.getAllByText('Relatório não informado').length).toBe(2));
      expect(screen.queryByText('Acompanhamento indisponível — não foi possível carregar o relatório de notas desta escola.')).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Registrar acompanhamento' })).toHaveLength(2);
    });

    // Revisão do code review do PR #17, seção 1: trocar de escola enquanto o
    // acompanhamento está carregando nunca mostra a tabela da escola
    // ANTERIOR — o estado de carregamento cobre a transição inteira.
    it('trocar de escola nunca mostra o acompanhamento da escola anterior enquanto o novo carrega', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());

      let resolveNext: (value: unknown[]) => void = () => {};
      mockListMonitoring.mockReturnValue(new Promise(resolve => { resolveNext = resolve; }));

      await selectSchool('EEM Figueiredo Correia');

      // Enquanto a nova consulta está em andamento, a turma da escola
      // ANTERIOR nunca continua visível — a tabela mostra "Carregando".
      expect(screen.queryByText('3º Ano B - Vespertino')).not.toBeInTheDocument();
      expect(screen.getByText('Carregando turmas...')).toBeInTheDocument();

      resolveNext([]);
      await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
    });
  });

  // Revisão do code review do PR #17, seção 4: useGradeEntryMonitoring e
  // useSchoolClassrooms guardam uma chave de contexto
  // (escola+ano+bimestre+modo) e nunca dependem só do useEffect para
  // limpar a tela — o valor exposto pelo hook já reflete o novo contexto
  // (monitoring vazio, status loading) desde o primeiro render depois da
  // troca, sem esperar a nova Promise resolver.
  describe('proteção contra contexto obsoleto (seção 4 do code review do PR #17)', () => {
    function monitoringDocCompleto(overrides: Record<string, unknown> = {}) {
      return {
        id: 'diva-cabral_2026_b1_turma-3a-diva',
        schoolId: DIVA_SCHOOL_ID, codInep: '23067918', escolaNome: 'EEM Diva Cabral',
        turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', anoLetivo: 2026, bimestre: 1,
        totalStudents: 32, studentsWithCompleteGrades: 32, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
        expectedGradeEntries: 128, completedGradeEntries: 128, status: 'confirmado', sourceSystem: 'SIGE Escola',
        referenceDate: '2026-03-10',
        createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
        createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL,
        ...overrides,
      };
    }

    it('trocar o bimestre nunca mostra o relatório do bimestre anterior enquanto o novo carrega', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValueOnce([monitoringDocCompleto({ expectedGradeEntries: 130, completedGradeEntries: 128 })]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      // "128" (completedGradeEntries, distinto de expectedGradeEntries:
      // 130 para evitar ambiguidade) só aparece na célula "Realizados" da
      // linha da turma quando o relatório do bimestre 1 está carregado —
      // nunca colide com os cartões-resumo (que mostram CONTAGEM de
      // turmas, não o total de lançamentos).
      await waitFor(() => expect(screen.getByText('128')).toBeInTheDocument());
      expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2026, 1);

      let resolveNext: (value: unknown[]) => void = () => {};
      mockListMonitoring.mockImplementation(() => new Promise(resolve => { resolveNext = resolve; }));

      fireEvent.change(screen.getByLabelText('Bimestre'), { target: { value: '2' } });

      // Enquanto a consulta do bimestre 2 está pendente, o relatório do
      // bimestre 1 nunca continua visível.
      expect(screen.queryByText('128')).not.toBeInTheDocument();
      expect(screen.getByText('Carregando turmas...')).toBeInTheDocument();

      resolveNext([]);
      await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2026, 2));
      await waitFor(() => expect(screen.getAllByText('Relatório não informado').length).toBeGreaterThan(0));
    });

    it('trocar o ano letivo nunca mostra o relatório do ano anterior enquanto o novo carrega', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValueOnce([monitoringDocCompleto({ expectedGradeEntries: 130, completedGradeEntries: 128 })]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(screen.getByText('128')).toBeInTheDocument());

      let resolveNext: (value: unknown[]) => void = () => {};
      mockListMonitoring.mockImplementation(() => new Promise(resolve => { resolveNext = resolve; }));

      fireEvent.change(screen.getByLabelText('Ano letivo'), { target: { value: '2025' } });

      expect(screen.queryByText('128')).not.toBeInTheDocument();
      expect(screen.getByText('Carregando turmas...')).toBeInTheDocument();

      resolveNext([]);
      await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2025, 1));
    });

    it('trocar de escola nunca mostra a turma da escola anterior enquanto só a consulta de turmas está pendente', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValue([]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      // "3º Ano B - Vespertino" só existe em EEM Diva Cabral — marcador
      // inequívoco de que a escola ANTERIOR ainda está na tela.
      await waitFor(() => expect(screen.getByText('3º Ano B - Vespertino')).toBeInTheDocument());

      let resolveNext: (value: Turma[]) => void = () => {};
      mockListClassrooms.mockImplementation(() => new Promise(resolve => { resolveNext = resolve; }));

      await selectSchool('EEM Figueiredo Correia');

      expect(screen.queryByText('3º Ano B - Vespertino')).not.toBeInTheDocument();
      expect(screen.getByText('Carregando turmas...')).toBeInTheDocument();

      resolveNext((SEED_TURMAS as unknown as Turma[]).filter(t => t.escolaId === 'figueiredo-correia'));
      await waitFor(() => expect(mockListClassrooms).toHaveBeenCalledWith('figueiredo-correia'));
    });

    // Item 4 do plano: resolver a Promise do bimestre ANTERIOR depois de já
    // ter trocado de bimestre nunca pode sobrescrever o contexto atual —
    // protegido pela flag `cancelled` do useEffect mais a chave de
    // contexto do próprio hook.
    it('resolver a Promise do bimestre anterior depois de já ter trocado de bimestre nunca sobrescreve o contexto atual', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

      let resolveBimestre1: (value: unknown[]) => void = () => {};
      mockListMonitoring.mockImplementationOnce(() => new Promise(resolve => { resolveBimestre1 = resolve; }));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2026, 1));

      let resolveBimestre2: (value: unknown[]) => void = () => {};
      mockListMonitoring.mockImplementationOnce(() => new Promise(resolve => { resolveBimestre2 = resolve; }));

      fireEvent.change(screen.getByLabelText('Bimestre'), { target: { value: '2' } });
      await waitFor(() => expect(mockListMonitoring).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2026, 2));

      // Resolve a Promise ANTIGA (bimestre 1) só DEPOIS de já estar no
      // bimestre 2 — a resposta desatualizada nunca pode sobrescrever o
      // contexto atual, mesmo chegando fora de ordem.
      resolveBimestre1([monitoringDocCompleto()]);
      resolveBimestre2([]);

      await waitFor(() => expect(screen.getAllByText('Relatório não informado').length).toBeGreaterThan(0));
      // "128" (completedGradeEntries do documento do bimestre 1, obsoleto)
      // nunca aparece — a resposta antiga foi descartada mesmo chegando
      // depois da resposta atual.
      expect(screen.queryByText('128')).not.toBeInTheDocument();
    });
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

  // Ajuste cirúrgico pós-PR #17: consolidateGradeEntryMonitoring (usado
  // DIRETAMENTE por NotasView, sem passar por
  // calculateGradeEntryMonitoringIndicators) precisa esconder o percentual
  // geral quando existe turma inconsistente — mesmo que os totais, olhados
  // isoladamente, pareçam "100% preenchidos" só com a turma válida.
  it('turma válida + turma inconsistente: tela principal de notas nunca mostra percentual enganoso, avisa da inconsistência e mantém a linha visível', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListMonitoring.mockResolvedValue([
      {
        id: 'diva-cabral_2026_b1_turma-3a-diva',
        schoolId: DIVA_SCHOOL_ID, codInep: '23067918', escolaNome: 'EEM Diva Cabral',
        turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', anoLetivo: 2026, bimestre: 1,
        totalStudents: 32, studentsWithCompleteGrades: 32, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
        expectedGradeEntries: 100, completedGradeEntries: 100, status: 'confirmado', sourceSystem: 'SIGE Escola',
        referenceDate: '2026-03-10',
        createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
        createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL,
      },
      {
        // completedGradeEntries > expectedGradeEntries: inconsistente.
        id: 'diva-cabral_2026_b1_turma-3b-diva',
        schoolId: DIVA_SCHOOL_ID, codInep: '23067918', escolaNome: 'EEM Diva Cabral',
        turmaId: 'turma-3b-diva', turmaNome: '3º Ano B - Vespertino', anoLetivo: 2026, bimestre: 1,
        totalStudents: 20, studentsWithCompleteGrades: 20, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
        expectedGradeEntries: 80, completedGradeEntries: 999, status: 'confirmado', sourceSystem: 'SIGE Escola',
        referenceDate: '2026-03-10',
        createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
        createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL,
      },
    ]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    // Aviso agregado de inconsistência aparece (cartão-resumo + banner).
    await waitFor(() => expect(screen.getByText('Revisar inconsistências')).toBeInTheDocument());
    expect(screen.getByText(/1 turma com relatório inconsistente/)).toBeInTheDocument();
    // "Inconsistente" aparece duas vezes (botão do filtro de situação +
    // badge da linha da turma) — getAllByText em vez de getByText.
    expect(screen.getAllByText('Inconsistente').length).toBe(2);

    // O cartão-resumo "Preenchimento geral" nunca mostra um percentual
    // calculado (nem "100%", que seria o resultado só com a turma válida,
    // nem "Não informado", que sugeriria ausência de relatório em vez de
    // um relatório presente porém inconsistente) — só "Revisar
    // inconsistências", já confirmado acima.
    expect(screen.queryByText('Não informado')).not.toBeInTheDocument();

    // A linha da turma inconsistente continua visível na tabela, com ação
    // de correção habilitada — nunca escondida ou filtrada.
    expect(screen.getByText('3º Ano B - Vespertino')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Atualizar acompanhamento' }).length).toBe(2);
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

  // Auditoria da reestruturação SIFEC, seção 5: o agregado regional
  // processa escola por escola — a falha de UMA escola nunca apaga o
  // resultado das demais nem vira um "erro genérico" de página inteira.
  describe('Agregados regionais — isolamento de falha por escola', () => {
    it('falha ao carregar turmas de UMA escola não apaga o agregado das demais — mostra cobertura e aviso discreto', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListClassrooms.mockReset().mockImplementation(async (schoolId: string) => {
        if (schoolId === 'figueiredo-correia') throw new Error('Falha simulada ao carregar turmas.');
        return (SEED_TURMAS as unknown as Turma[]).filter(t => t.escolaId === schoolId);
      });

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      fireEvent.click(screen.getByRole('button', { name: /Agregados regionais/ }));

      await waitFor(() => expect(screen.getByText(/1 de 2 escola\(s\) carregada\(s\) com sucesso\./)).toBeInTheDocument());
      const failureBanner = screen.getByText(/1 escola\(s\) não puderam ser carregadas/);
      expect(failureBanner).toBeInTheDocument();
      // "EEM Figueiredo Correia" também aparece na <option> do seletor de
      // escola — a asserção precisa ficar restrita ao aviso de falha.
      expect(failureBanner.textContent).toMatch(/EEM Figueiredo Correia/);
      // O agregado da escola que carregou com sucesso continua visível —
      // nunca substituído por um erro de página inteira.
      expect(screen.getByText('Turmas no escopo')).toBeInTheDocument();
      expect(screen.queryByText('Não foi possível carregar a visão agregada.')).not.toBeInTheDocument();
    });

    it('todas as escolas carregando com sucesso mostram a cobertura completa, sem aviso de falha', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral', 'EEM Figueiredo Correia'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      fireEvent.click(screen.getByRole('button', { name: /Agregados regionais/ }));

      await waitFor(() => expect(screen.getByText(/2 de 2 escola\(s\) carregada\(s\) com sucesso\./)).toBeInTheDocument());
      expect(screen.queryByText(/não puderam ser carregadas/)).not.toBeInTheDocument();
    });
  });

  // Integração do fluxo do PR #18 ao PR #19 — botão permanente "Registrar
  // relatório do SIGE" em Acompanhamento de Notas, com o gating explícito
  // exigido: só habilitado quando turmas E grade_entry_monitoring estão em
  // status 'success', nenhuma fonte carregando, nenhuma fonte falhou.
  describe('botão "Registrar relatório do SIGE"', () => {
    it('não aparece enquanto as fontes ainda estão carregando', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      let resolveMonitoring: (value: unknown[]) => void = () => {};
      mockListMonitoring.mockReset().mockImplementation(
        () => new Promise(resolve => { resolveMonitoring = resolve; })
      );

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');

      // Escola selecionada, mas grade_entry_monitoring ainda está pendente
      // (nunca resolvido) — a tabela mostra "Carregando turmas..." e o
      // botão não pode aparecer até AMBAS as fontes terminarem com sucesso.
      await waitFor(() => expect(screen.getByText('Carregando turmas...')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /Registrar relatório do SIGE/ })).not.toBeInTheDocument();

      await act(async () => { resolveMonitoring([]); });
      await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /Registrar relatório do SIGE/ })).toBeInTheDocument();
    });

    it('não aparece quando a fonte de acompanhamento falhou', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockReset().mockRejectedValue(new Error('unavailable'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');

      await waitFor(() => expect(screen.getByText(/Acompanhamento indisponível/)).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /Registrar relatório do SIGE/ })).not.toBeInTheDocument();
    });

    it('não aparece quando a fonte de turmas falhou', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListClassrooms.mockReset().mockRejectedValue(new Error('unavailable'));

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');

      await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /Registrar relatório do SIGE/ })).not.toBeInTheDocument();
    });

    // Seção 3 do pedido de integração: registro permitido mesmo quando
    // ainda não existem turmas — o botão nunca depende de uma linha existir.
    it('aparece mesmo quando a escola ainda não tem nenhuma turma cadastrada', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEMTI Estado do Amazonas'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValue([]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEMTI Estado do Amazonas');

      await waitFor(() => expect(screen.getByText('Nenhuma turma cadastrada para esta escola e ano letivo.')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /Registrar relatório do SIGE/ })).toBeInTheDocument();
    });

    it('clicar no botão abre o modal em três etapas, iniciando pela identificação', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValue([]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(screen.getByRole('button', { name: /Registrar relatório do SIGE/ })).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: /Registrar relatório do SIGE/ }));

      // O botão do cabeçalho continua na tela por trás do modal — a
      // asserção usa o heading do modal (role específico), nunca getByText
      // solto, que bateria também no texto do botão.
      expect(screen.getByRole('heading', { name: 'Registrar relatório do SIGE' })).toBeInTheDocument();
      expect(screen.getByText(/Etapa 1 de 3: Identificação/)).toBeInTheDocument();
    });

    it('fechar o modal (Cancelar) não deixa nenhum registro pendente nem refaz a consulta sem necessidade', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListMonitoring.mockResolvedValue([]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(screen.getByRole('button', { name: /Registrar relatório do SIGE/ })).toBeInTheDocument());

      const turmasCallsBefore = mockListClassrooms.mock.calls.length;
      const monitoringCallsBefore = mockListMonitoring.mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: /Registrar relatório do SIGE/ }));
      expect(screen.getByRole('heading', { name: 'Registrar relatório do SIGE' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('heading', { name: 'Registrar relatório do SIGE' })).not.toBeInTheDocument();
      // Abrir/fechar o modal sem confirmar nada nunca dispara uma nova
      // consulta — nenhum loop de refetch (mesma classe de bug já corrigida
      // para selectedSchool/getSuperintendents em outras telas).
      expect(mockListClassrooms.mock.calls.length).toBe(turmasCallsBefore);
      expect(mockListMonitoring.mock.calls.length).toBe(monitoringCallsBefore);
    });
  });
});
