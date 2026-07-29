// @vitest-environment jsdom
// Fase 2C — orquestração de NotasView (seleção de escola, escopo
// multiusuário, filtros, estados vazios, recarregamento após salvar,
// modo demonstração, ativação/inativação). Usa o superintendentService.ts
// REAL (via localStorage, mesmo padrão de tests/fluxoView.component.test.tsx)
// para exercitar o escopo de verdade — só firebase.ts (auth),
// studentRosterService.ts e studentBimesterGradeService.ts são mockados.
// Os dois modais (StudentRegistrationModal/StudentBimesterGradeFormModal)
// são substituídos por stubs simples: seu comportamento próprio já é
// coberto por tests/notasModals.component.test.tsx — aqui o alvo é a
// orquestração de NotasView.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import NotasView from '../src/components/NotasView';
import { getSuperintendents, saveSuperintendents, setActiveSuperintendentId, setAdminSchoolScope } from '../src/lib/superintendentService';
import type { StudentRosterEntry } from '../src/types/studentRoster';
import type { StudentBimesterGrade } from '../src/types/studentBimesterGrade';

// Só `Date` é congelado (toFake: ['Date']) — setTimeout/setInterval
// continuam reais, então waitFor()/fireEvent seguem funcionando
// normalmente. Ancora o "ano corrente" em 2026 para bater com
// SEED_TURMAS/DEMO_ANO_LETIVO nos testes que não mexem no seletor de ano
// letivo, sem depender do relógio real da máquina (revisão do PR #15,
// item 2 — ver também tests/anoLetivoOptions.test.ts para o gerador puro).
const FIXED_NOW = new Date('2026-03-15T12:00:00.000Z');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const { authStateListeners, mockAuth, mockListRoster, mockListGrades, mockDeactivate, mockActivate } = vi.hoisted(() => {
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
    mockListRoster: vi.fn(),
    mockListGrades: vi.fn(),
    mockDeactivate: vi.fn(),
    mockActivate: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

// subscribeToCollection('turmas', ...) real tentaria abrir um onSnapshot
// contra o Firestore de verdade — nestes testes as turmas continuam vindo
// de SEED_TURMAS (mesmo padrão de tests/notasViewFirebasePanel.component.test.tsx),
// preservando os demais exports reais (SEED_SCHOOLS/SEED_TURMAS).
vi.mock('../src/lib/firebaseService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/firebaseService')>();
  return { ...actual, subscribeToCollection: () => () => {} };
});

vi.mock('../src/lib/studentRosterService', () => ({
  listStudentRosterForSchool: (...args: unknown[]) => mockListRoster(...args),
  deactivateStudentRosterEntry: (...args: unknown[]) => mockDeactivate(...args),
  activateStudentRosterEntry: (...args: unknown[]) => mockActivate(...args),
}));

vi.mock('../src/lib/studentBimesterGradeService', () => ({
  listStudentBimesterGradesForSchool: (...args: unknown[]) => mockListGrades(...args),
}));

vi.mock('../src/components/notas/StudentRegistrationModal', () => ({
  default: (props: { onSaved: () => void; onClose: () => void }) => (
    <div data-testid="registration-modal">
      <span>Cadastro aberto</span>
      <button onClick={() => { props.onSaved(); props.onClose(); }}>Simular cadastro salvo</button>
      <button onClick={props.onClose}>Fechar cadastro</button>
    </div>
  ),
}));

vi.mock('../src/components/notas/StudentBimesterGradeFormModal', () => ({
  default: (props: { studentName: string; existingObservacao?: string; onSaved: () => void; onClose: () => void }) => (
    <div data-testid="grade-modal">
      <span>Notas de {props.studentName}</span>
      <span data-testid="grade-modal-observacao">{props.existingObservacao ?? '(sem observação)'}</span>
      <button onClick={() => { props.onSaved(); props.onClose(); }}>Simular notas salvas</button>
      <button onClick={props.onClose}>Fechar notas</button>
    </div>
  ),
}));

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

function rosterEntry(overrides: Partial<StudentRosterEntry> = {}): StudentRosterEntry {
  return {
    id: 'diva-cabral_2026_turma-3a-diva_key-1',
    studentKey: 'key-1',
    schoolId: DIVA_SCHOOL_ID,
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    studentName: 'Estudante Um',
    active: true,
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
    createdBy: SUPER_A_EMAIL,
    updatedBy: SUPER_A_EMAIL,
    ...overrides,
  };
}

function gradeEntry(rosterId: string, scores: StudentBimesterGrade['scores'], overrides: Partial<StudentBimesterGrade> = {}): StudentBimesterGrade {
  return {
    id: `${rosterId}_b1`,
    rosterId,
    studentKey: 'key-1',
    schoolId: DIVA_SCHOOL_ID,
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    bimestre: 1,
    scores,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    createdBy: SUPER_A_EMAIL,
    updatedBy: SUPER_A_EMAIL,
    ...overrides,
  };
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
    mockListRoster.mockReset();
    mockListGrades.mockReset();
    mockDeactivate.mockReset();
    mockActivate.mockReset();
    mockListRoster.mockResolvedValue([]);
    mockListGrades.mockResolvedValue([]);
  });

  it('sem escola selecionada, nenhum nome é carregado', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);

    expect(screen.getByText('Selecione uma escola para carregar o acompanhamento de notas.')).toBeInTheDocument();
    expect(mockListRoster).not.toHaveBeenCalled();
    expect(mockListGrades).not.toHaveBeenCalled();
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

  it('escola com turmas mas sem estudantes mostra o estado vazio real (nunca dado fictício)', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListRoster.mockResolvedValue([]);
    mockListGrades.mockResolvedValue([]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    expect(screen.getByText('Nenhum estudante cadastrado para esta escola, turma e ano letivo.')).toBeInTheDocument();
  });

  it('inativação preserva o cadastro e as notas anteriores (só exclui dos indicadores correntes)', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const roster = rosterEntry();
    // A 2ª chamada (disparada pelo refresh() após inativar) já devolve o
    // MESMO cadastro, agora inativo — simula o histórico preservado.
    mockListRoster
      .mockResolvedValueOnce([roster])
      .mockResolvedValueOnce([{ ...roster, active: false }]);
    mockListGrades.mockResolvedValue([gradeEntry(roster.id, { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 })]);
    mockDeactivate.mockResolvedValue(undefined);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText('Estudante Um')).toBeInTheDocument());
    expect(screen.getByText('8.0')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Inativar'));
    await waitFor(() => expect(mockDeactivate).toHaveBeenCalledTimes(1));
    expect(mockDeactivate.mock.calls[0][0]).toMatchObject({ schoolId: DIVA_SCHOOL_ID, turmaId: 'turma-3a-diva', studentKey: 'key-1' });

    // Cadastro e notas continuam visíveis (histórico preservado) — só some
    // dos indicadores correntes porque active passa a false.
    await waitFor(() => expect(screen.getByText(/Estudante Um/).textContent).toContain('(Inativo)'));
    expect(screen.getByText('8.0')).toBeInTheDocument();
  });

  // Revisão do PR #15, item 8: erro real de ativação/inativação precisa
  // ficar visível — nunca uma rejeição de Promise silenciosa.
  it('erro de inativação (ex.: falha de permissão) fica visível na interface', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const roster = rosterEntry();
    mockListRoster.mockResolvedValue([roster]);
    mockListGrades.mockResolvedValue([]);
    mockDeactivate.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText('Estudante Um')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Inativar'));
    await waitFor(() => expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument());
  });

  // Revisão do PR #15, item 8: enquanto a chamada anterior está em
  // andamento, um segundo clique no mesmo estudante não dispara outra
  // chamada ao serviço.
  it('cliques repetidos durante a inativação do mesmo estudante não disparam chamadas duplicadas', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const roster = rosterEntry();
    mockListRoster.mockResolvedValue([roster]);
    mockListGrades.mockResolvedValue([]);
    let resolveDeactivate: () => void = () => {};
    mockDeactivate.mockReturnValue(new Promise<void>(resolve => { resolveDeactivate = resolve; }));

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText('Estudante Um')).toBeInTheDocument());

    const toggleButton = screen.getByTitle('Inativar');
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);
    await waitFor(() => expect(mockDeactivate).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveDeactivate();
    });
  });

  // Revisão do PR #15, item 8: estudante inativo nunca pode receber a ação
  // "Preencher notas" habilitada.
  it('estudante inativo não recebe a ação "Preencher notas" habilitada', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListRoster.mockResolvedValue([rosterEntry({ active: false })]);
    mockListGrades.mockResolvedValue([]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText(/Estudante Um/)).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /Preencher notas/ })).toBeDisabled();
  });

  // Revisão do PR #15, item 8: estado vazio por FILTRO/busca precisa ser
  // diferente de "nenhum estudante cadastrado" (o cadastro existe, só não
  // bate com o filtro atual).
  it('estado vazio causado por busca é diferente de "nenhum estudante cadastrado"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListRoster.mockResolvedValue([rosterEntry()]);
    mockListGrades.mockResolvedValue([]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText('Estudante Um')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Buscar estudante pelo nome...'), { target: { value: 'nome que não existe' } });

    await waitFor(() =>
      expect(screen.getByText('Nenhum estudante encontrado com os filtros ou a busca atuais.')).toBeInTheDocument()
    );
    expect(screen.queryByText('Nenhum estudante cadastrado para esta escola, turma e ano letivo.')).not.toBeInTheDocument();
  });

  // Revisão do PR #15, item 6: NotasView precisa carregar a observação já
  // registrada e repassá-la ao modal de notas (o próprio modal já sabe
  // exibir/editar/apagar — coberto em tests/notasModals.component.test.tsx).
  it('observação existente na nota é repassada ao modal de preenchimento', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const roster = rosterEntry();
    mockListRoster.mockResolvedValue([roster]);
    mockListGrades.mockResolvedValue([
      gradeEntry(roster.id, { linguaPortuguesa: 8, matematica: null, cienciasNatureza: null, cienciasHumanas: null }, {
        observacao: 'Precisa de acompanhamento em leitura.',
      }),
    ]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText('Estudante Um')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Preencher notas/ }));
    await waitFor(() =>
      expect(screen.getByTestId('grade-modal-observacao').textContent).toBe('Precisa de acompanhamento em leitura.')
    );
  });

  it('estados de preenchimento (sem notas / parcial / completo) aparecem corretamente na tabela', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const semNotas = rosterEntry({ studentKey: 'k1', id: 'r1', studentName: 'Estudante Sem Notas' });
    const parcial = rosterEntry({ studentKey: 'k2', id: 'r2', studentName: 'Estudante Parcial' });
    const completo = rosterEntry({ studentKey: 'k3', id: 'r3', studentName: 'Estudante Completo' });
    mockListRoster.mockResolvedValue([semNotas, parcial, completo]);
    mockListGrades.mockResolvedValue([
      gradeEntry('r2', { linguaPortuguesa: 7, matematica: null, cienciasNatureza: null, cienciasHumanas: null }),
      gradeEntry('r3', { linguaPortuguesa: 7, matematica: 7, cienciasNatureza: 7, cienciasHumanas: 7 }),
    ]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalled());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);

    await waitFor(() => expect(screen.getByText('Estudante Sem Notas')).toBeInTheDocument());
    expect(screen.getByText(/Sem notas \(0%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Preenchimento parcial \(25%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Preenchimento completo \(100%\)/)).toBeInTheDocument();

    // Nunca classifica como Aprovado/Reprovado/Retido/Recuperação/defasagem.
    expect(screen.queryByText(/Aprovado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reprovado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Retido/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recupera[çc][ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/defasagem/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  it('filtros (Sem notas / Parcial / Completo / Abaixo da referência) restringem a lista corretamente', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    const semNotas = rosterEntry({ studentKey: 'k1', id: 'r1', studentName: 'Estudante Sem Notas' });
    const parcial = rosterEntry({ studentKey: 'k2', id: 'r2', studentName: 'Estudante Parcial' });
    const completo = rosterEntry({ studentKey: 'k3', id: 'r3', studentName: 'Estudante Completo' });
    const abaixo = rosterEntry({ studentKey: 'k4', id: 'r4', studentName: 'Estudante Abaixo Referencia' });
    mockListRoster.mockResolvedValue([semNotas, parcial, completo, abaixo]);
    mockListGrades.mockResolvedValue([
      gradeEntry('r2', { linguaPortuguesa: 7, matematica: null, cienciasNatureza: null, cienciasHumanas: null }),
      gradeEntry('r3', { linguaPortuguesa: 7, matematica: 7, cienciasNatureza: 7, cienciasHumanas: 7 }),
      // Preenchimento PARCIAL (2 de 4) e abaixo da referência — estado de
      // preenchimento e sinalização de referência são sinais independentes
      // (um estudante "completo" também pode ficar abaixo da referência).
      gradeEntry('r4', { linguaPortuguesa: 4, matematica: 4, cienciasNatureza: null, cienciasHumanas: null }),
    ]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalled());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText('Estudante Sem Notas')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sem notas' }));
    expect(screen.getByText('Estudante Sem Notas')).toBeInTheDocument();
    expect(screen.queryByText('Estudante Parcial')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Parcial' }));
    expect(screen.getByText('Estudante Parcial')).toBeInTheDocument();
    expect(screen.queryByText('Estudante Sem Notas')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Completo' }));
    expect(screen.getByText('Estudante Completo')).toBeInTheDocument();
    expect(screen.queryByText('Estudante Abaixo Referencia')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abaixo da referência' }));
    expect(screen.getByText('Estudante Abaixo Referencia')).toBeInTheDocument();
    expect(screen.queryByText('Estudante Completo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Estudante Sem Notas')).toBeInTheDocument();
    expect(screen.getByText('Estudante Parcial')).toBeInTheDocument();
    expect(screen.getByText('Estudante Completo')).toBeInTheDocument();
    expect(screen.getByText('Estudante Abaixo Referencia')).toBeInTheDocument();
  });

  it('sucesso no cadastro (onSaved do modal) recarrega os dados', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListRoster.mockResolvedValue([]);

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estudante' }));
    expect(screen.getByTestId('registration-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Simular cadastro salvo' }));
    await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(2));
  });

  it('erro real de carregamento permanece visível, com "Tentar novamente"', async () => {
    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
    mockListRoster.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

    render(<NotasView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchool('EEM Diva Cabral');

    await waitFor(() => expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();

    mockListRoster.mockResolvedValueOnce([]);
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
    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
    await waitFor(() => expect(screen.getByText(/Estudante Demonstração 01/)).toBeInTheDocument());

    mockListRoster.mockResolvedValue([]);
    mockListGrades.mockResolvedValue([]);
    await loginAs(ADMIN_EMAIL);

    await waitFor(() =>
      expect(screen.queryByText('Modo demonstração — faça login para ver e registrar dados reais')).not.toBeInTheDocument()
    );
    await waitFor(() => expect(mockListRoster).toHaveBeenCalled());
    expect(screen.queryByText(/Estudante Demonstração/)).not.toBeInTheDocument();
  });

  // Revisão do PR #15, item 2: seletor de ano letivo real (não mais um
  // <select disabled> travado em 2026).
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

    it('trocar o ano letivo limpa a turma selecionada, fecha modais abertos e recarrega roster/notas do novo ano', async () => {
      saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, ['EEM Diva Cabral'])]);
      setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
      mockListRoster.mockResolvedValue([rosterEntry()]);
      mockListGrades.mockResolvedValue([]);

      render(<NotasView />);
      await loginAs(SUPER_A_EMAIL);
      await selectSchool('EEM Diva Cabral');
      await waitFor(() => expect(mockListRoster).toHaveBeenCalledTimes(1));
      expect(mockListRoster).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2026);

      fireEvent.click((await screen.findAllByRole('button', { name: 'Ver estudantes' }))[0]);
      await waitFor(() => expect(screen.getByText('Estudante Um')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar estudante' }));
      expect(screen.getByTestId('registration-modal')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Ano letivo'), { target: { value: '2025' } });

      // Modal fechado e turma desmarcada (volta para a tabela de turmas por
      // escola) — nunca sobrevivem à troca de ano letivo.
      expect(screen.queryByTestId('registration-modal')).not.toBeInTheDocument();
      expect(screen.queryByText('Estudante Um')).not.toBeInTheDocument();
      await waitFor(() => expect(mockListRoster).toHaveBeenCalledWith(DIVA_SCHOOL_ID, 2025));
    });
  });
});
