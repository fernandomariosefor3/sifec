// @vitest-environment jsdom
// Auditoria da reestruturação SIFEC, seção 10/13 — Parecer Bimestral:
// (1) nome de estudante do Farol do Estudante nunca aparece no bloco
// marcado para impressão/PDF (data-testid="farol-print-summary"), só no
// bloco nominal em tela (data-testid="farol-nominal-list"); (2) a falha de
// UMA fonte (ex.: Farol) nunca apaga as demais 8 — outro card continua
// mostrando dado real normalmente. Mesmo padrão de mocking de
// tests/salaDeSituacaoView.component.test.tsx: superintendentService real
// (via localStorage), só os serviços de dados são mockados.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { act } from 'react';
import ParecerBimestralView from '../src/components/ParecerBimestralView';
import { getSuperintendents, saveSuperintendents, setActiveSuperintendentId } from '../src/lib/superintendentService';
import type { Turma } from '../src/types/classroom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const {
  authStateListeners, mockAuth,
  mockListClassroomsForSchool, mockListBimonthlyEnrollmentsForSchool, mockGetSchoolFlowResult,
  mockListGradeEntryMonitoringForSchool, mockListGradeEntryMonitoringByDisciplineForSchool, mockListFarolEstudanteForSchool,
  mockGetCdgPlan, mockListCdgTasksForSchool, mockListRecomposicaoPlansForSchool,
  mockGetParecerBimestralNote, mockSaveParecerBimestralNote,
  mockFetchTurmasForSchools, mockFetchVisitasForSchools, mockFetchPortfolioSituations,
} = vi.hoisted(() => {
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
    mockListClassroomsForSchool: vi.fn(),
    mockListBimonthlyEnrollmentsForSchool: vi.fn(),
    mockGetSchoolFlowResult: vi.fn(),
    mockListGradeEntryMonitoringForSchool: vi.fn(),
    mockListGradeEntryMonitoringByDisciplineForSchool: vi.fn(),
    mockListFarolEstudanteForSchool: vi.fn(),
    mockGetCdgPlan: vi.fn(),
    mockListCdgTasksForSchool: vi.fn(),
    mockListRecomposicaoPlansForSchool: vi.fn(),
    mockGetParecerBimestralNote: vi.fn(),
    mockSaveParecerBimestralNote: vi.fn(),
    mockFetchTurmasForSchools: vi.fn(),
    mockFetchVisitasForSchools: vi.fn(),
    mockFetchPortfolioSituations: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/classService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/classService')>();
  return { ...actual, listClassroomsForSchool: (...args: unknown[]) => mockListClassroomsForSchool(...args) };
});

vi.mock('../src/lib/bimonthlyEnrollmentService', () => ({
  listBimonthlyEnrollmentsForSchool: (...args: unknown[]) => mockListBimonthlyEnrollmentsForSchool(...args),
}));

vi.mock('../src/lib/schoolFlowService', () => ({
  getSchoolFlowResult: (...args: unknown[]) => mockGetSchoolFlowResult(...args),
}));

vi.mock('../src/lib/gradeEntryMonitoringService', () => ({
  listGradeEntryMonitoringForSchool: (...args: unknown[]) => mockListGradeEntryMonitoringForSchool(...args),
}));

vi.mock('../src/lib/gradeEntryMonitoringDisciplineService', () => ({
  listGradeEntryMonitoringByDisciplineForSchool: (...args: unknown[]) => mockListGradeEntryMonitoringByDisciplineForSchool(...args),
}));

vi.mock('../src/lib/farolEstudanteService', () => ({
  listFarolEstudanteForSchool: (...args: unknown[]) => mockListFarolEstudanteForSchool(...args),
}));

vi.mock('../src/lib/cdgService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/cdgService')>();
  return {
    ...actual,
    getCdgPlan: (...args: unknown[]) => mockGetCdgPlan(...args),
    listCdgTasksForSchool: (...args: unknown[]) => mockListCdgTasksForSchool(...args),
  };
});

vi.mock('../src/lib/recomposicaoPlanService', () => ({
  listRecomposicaoPlansForSchool: (...args: unknown[]) => mockListRecomposicaoPlansForSchool(...args),
}));

vi.mock('../src/lib/parecerBimestralService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/parecerBimestralService')>();
  return {
    ...actual,
    getParecerBimestralNote: (...args: unknown[]) => mockGetParecerBimestralNote(...args),
    saveParecerBimestralNote: (...args: unknown[]) => mockSaveParecerBimestralNote(...args),
  };
});

vi.mock('../src/lib/schoolSituationService', () => ({
  fetchTurmasForSchools: (...args: unknown[]) => mockFetchTurmasForSchools(...args),
  fetchVisitasForSchools: (...args: unknown[]) => mockFetchVisitasForSchools(...args),
  fetchPortfolioSituations: (...args: unknown[]) => mockFetchPortfolioSituations(...args),
}));

const SUPER_A_EMAIL = 'super.a@example.com';
const SCHOOL_NOME = 'EEM Diva Cabral';
const SCHOOL_CODINEP = '23067918';

function superComEscolas(email: string, escolas: string[]): ReturnType<typeof getSuperintendents>[number] {
  return {
    id: `super-${email}`,
    nome: 'Superintendente Teste',
    cargo: 'Superintendente Regional',
    email,
    escolas,
    ativo: true,
    role: 'superintendent',
  };
}

function turma(id: string): Turma {
  return {
    id, nome: '3º Ano A - Matutino', escolaId: 'diva-cabral', escolaNome: SCHOOL_NOME, ano: '3º Ano', periodo: 'Matutino',
    schoolId: 'diva-cabral', codInep: SCHOOL_CODINEP, anoLetivo: 2026, ativa: true, matriculaAtual: 30,
  };
}

async function loginAs(email: string) {
  await act(async () => {
    mockAuth.currentUser = { email };
    authStateListeners.forEach(cb => cb({ email }));
  });
}

async function selectSchoolAnoBimestre() {
  fireEvent.change(screen.getByLabelText('Escola'), { target: { value: 'diva-cabral' } });
  fireEvent.change(screen.getByLabelText('Ano letivo'), { target: { value: '2026' } });
  fireEvent.change(screen.getByLabelText('Bimestre'), { target: { value: '1' } });
}

function goToCard(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
}

// Todos os 9 cards ficam no DOM ao mesmo tempo (o inativo só leva a classe
// "hidden", que o jsdom não aplica como display:none de verdade) — consultas
// por texto precisam ficar restritas ao card certo, nunca `screen` global,
// senão "Atualizado em:" bate em vários cards ao mesmo tempo.
function getCardContainer(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: new RegExp(title) });
  return heading.parentElement as HTMLElement;
}

describe('ParecerBimestralView', () => {
  beforeEach(() => {
    localStorage.clear();
    authStateListeners.length = 0;
    mockAuth.currentUser = null;

    mockListClassroomsForSchool.mockReset().mockResolvedValue([turma('turma-3a-diva')]);
    mockListBimonthlyEnrollmentsForSchool.mockReset().mockResolvedValue([]);
    mockGetSchoolFlowResult.mockReset().mockResolvedValue(null);
    mockListGradeEntryMonitoringForSchool.mockReset().mockResolvedValue([]);
    mockListGradeEntryMonitoringByDisciplineForSchool.mockReset().mockResolvedValue([]);
    mockListFarolEstudanteForSchool.mockReset().mockResolvedValue([
      { id: 'farol-1', schoolId: 'diva-cabral', codInep: SCHOOL_CODINEP, escolaNome: SCHOOL_NOME, turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', disciplina: 'Matemática', anoLetivo: 2026, bimestre: 1, estudanteNome: 'Aluno Confidencial Teste', percentualAcerto: 18, sourceSystem: 'SISEDU Analytics', referenceDate: '2026-03-01', status: 'Identificado', createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z', createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL },
    ]);
    mockGetCdgPlan.mockReset().mockResolvedValue(null);
    mockListCdgTasksForSchool.mockReset().mockResolvedValue([]);
    mockListRecomposicaoPlansForSchool.mockReset().mockResolvedValue([]);
    mockGetParecerBimestralNote.mockReset().mockResolvedValue(null);
    mockSaveParecerBimestralNote.mockReset().mockResolvedValue(undefined);

    mockFetchTurmasForSchools.mockReset().mockResolvedValue({ status: 'success', data: [] });
    mockFetchVisitasForSchools.mockReset().mockResolvedValue({});
    mockFetchPortfolioSituations.mockReset().mockResolvedValue({});

    saveSuperintendents([...getSuperintendents(), superComEscolas(SUPER_A_EMAIL, [SCHOOL_NOME])]);
    setActiveSuperintendentId(`super-${SUPER_A_EMAIL}`);
  });

  it('nome de estudante do Farol nunca aparece no bloco de impressão — só no bloco nominal em tela', async () => {
    render(<ParecerBimestralView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchoolAnoBimestre();

    await waitFor(() => expect(screen.getByRole('button', { name: /Anterior/ })).toBeInTheDocument());
    goToCard('Farol do Estudante');

    const nominalList = await screen.findByTestId('farol-nominal-list');
    expect(within(nominalList).getByText(/Aluno Confidencial Teste/)).toBeInTheDocument();

    const printSummary = screen.getByTestId('farol-print-summary');
    expect(within(printSummary).queryByText(/Aluno Confidencial Teste/)).not.toBeInTheDocument();
    // O resumo agregado ainda informa turma/disciplina/quantidade — nunca nomes.
    expect(within(printSummary).getByText(/3º Ano A - Matutino/)).toBeInTheDocument();
    expect(within(printSummary).getByText(/1 estudante/)).toBeInTheDocument();
  });

  it('falha ao carregar Farol nunca apaga os demais cards — Matrícula continua mostrando dado real', async () => {
    mockListFarolEstudanteForSchool.mockRejectedValueOnce(new Error('Falha simulada no Farol.'));

    render(<ParecerBimestralView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchoolAnoBimestre();

    await waitFor(() => expect(screen.getByRole('button', { name: /Anterior/ })).toBeInTheDocument());

    goToCard('Matrícula');
    await waitFor(() => expect(screen.getByText('3º Ano A - Matutino')).toBeInTheDocument());
    // O texto é composto por múltiplos elementos (<strong>1</strong> turma(s)
    // ativa(s) de <strong>1</strong> cadastrada(s).) — comparar o textContent
    // inteiro do container em vez de um regex de texto único.
    expect(screen.getByText((_, node) => node?.textContent === '1 turma(s) ativa(s) de 1 cadastrada(s).')).toBeInTheDocument();

    goToCard('Farol do Estudante');
    await waitFor(() => expect(screen.getByText(/Não foi possível carregar esta fonte agora/)).toBeInTheDocument());
  });

  // Correção final da auditoria, seção 7: o card de Notas precisa usar
  // disciplina real (grade_entry_monitoring_disciplina), nunca só o total
  // por turma de grade_entry_monitoring.
  it('card de Notas mostra consolidação por área a partir de disciplinas reais', async () => {
    mockListGradeEntryMonitoringByDisciplineForSchool.mockResolvedValue([
      {
        id: 'x1', schoolId: 'diva-cabral', codInep: SCHOOL_CODINEP, escolaNome: SCHOOL_NOME,
        turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', anoLetivo: 2026, bimestre: 1,
        disciplinaId: 'historia', disciplinaNome: 'História', areaConhecimento: 'Ciências Humanas',
        expectedGradeEntries: 32, completedGradeEntries: 32, status: 'confirmado', referenceDate: '2026-03-10',
        createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z', createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL,
      },
      {
        id: 'x2', schoolId: 'diva-cabral', codInep: SCHOOL_CODINEP, escolaNome: SCHOOL_NOME,
        turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', anoLetivo: 2026, bimestre: 1,
        disciplinaId: 'geografia', disciplinaNome: 'Geografia', areaConhecimento: 'Ciências Humanas',
        expectedGradeEntries: 32, completedGradeEntries: 0, status: 'confirmado', referenceDate: '2026-03-10',
        createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z', createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL,
      },
    ]);

    render(<ParecerBimestralView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchoolAnoBimestre();
    await waitFor(() => expect(screen.getByRole('button', { name: /Anterior/ })).toBeInTheDocument());

    goToCard('Notas Informadas');
    await waitFor(() => expect(within(getCardContainer('Notas Informadas')).getByText(/Ciências Humanas \(2 disciplina\(s\)\)/)).toBeInTheDocument());
    // soma(realizados)/soma(esperados) = 32/64 = 50% — nunca a média simples
    // dos percentuais de cada disciplina.
    expect(within(getCardContainer('Notas Informadas')).getByText('50%')).toBeInTheDocument();
  });

  it('data de atualização aparece em cada card com fonte carregada', async () => {
    mockListBimonthlyEnrollmentsForSchool.mockResolvedValue([
      { id: 'b1', schoolId: 'diva-cabral', codInep: SCHOOL_CODINEP, escolaNome: SCHOOL_NOME, anoLetivo: 2026, bimestre: 1, matricula: 100, createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-15T12:00:00.000Z', createdBy: SUPER_A_EMAIL, updatedBy: SUPER_A_EMAIL },
    ]);

    render(<ParecerBimestralView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchoolAnoBimestre();
    await waitFor(() => expect(screen.getByRole('button', { name: /Anterior/ })).toBeInTheDocument());

    goToCard('Matrícula');
    await waitFor(() => expect(within(getCardContainer('Matrícula')).getByText(/Atualizado em:/)).toBeInTheDocument());
    expect(within(getCardContainer('Matrícula')).queryByText(/Atualizado em: Não informado/)).not.toBeInTheDocument();
  });

  it('fonte sem nenhum registro mostra "Atualizado em: Não informado" — nunca uma data inventada', async () => {
    render(<ParecerBimestralView />);
    await loginAs(SUPER_A_EMAIL);
    await selectSchoolAnoBimestre();
    await waitFor(() => expect(screen.getByRole('button', { name: /Anterior/ })).toBeInTheDocument());

    goToCard('Recomposição');
    await waitFor(() => expect(within(getCardContainer('Recomposição')).getByText(/Atualizado em: Não informado/)).toBeInTheDocument());
  });
});
