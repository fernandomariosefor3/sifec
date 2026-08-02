// @vitest-environment jsdom
// Correção funcional pós-PR #17 — testes de componente do fluxo "Registrar
// relatório do SIGE" (SigeReportModal + SigeReportRowEditor). saveSigeReport
// é mockado (seu próprio comportamento contra o Firestore já é coberto por
// tests/sigeReportService.test.ts) — aqui o alvo é a orquestração da UI:
// navegação entre etapas, correspondência de turma em tempo real,
// confirmação humana explícita, e que nada é salvo antes de "Confirmar
// registro". Mesmo padrão de mock de auth de
// tests/gradeEntryMonitoringComponents.component.test.tsx.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SigeReportModal from '../src/components/notas/SigeReportModal';
import type { Turma } from '../src/types/classroom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { mockAuth, mockSaveSigeReport } = vi.hoisted(() => ({
  mockAuth: { currentUser: { email: 'super.a@example.com' } as { email: string } | null },
  mockSaveSigeReport: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/sigeReportService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/sigeReportService')>();
  return { ...actual, saveSigeReport: (...args: unknown[]) => mockSaveSigeReport(...args) };
});

const SCHOOL = { id: 'diva-cabral', codInep: '23067918', nome: 'EEM Diva Cabral' };

function turma(overrides: Partial<Turma> = {}): Turma {
  return {
    id: 't1', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral',
    nome: '3º Ano A', ano: '3º Ano', periodo: 'Matutino', schoolId: 'diva-cabral',
    ...overrides,
  };
}

function renderModal(overrides: Partial<Parameters<typeof SigeReportModal>[0]> = {}) {
  return render(
    <SigeReportModal
      school={SCHOOL}
      anoLetivo={2026}
      bimestre={1}
      existingTurmas={[]}
      existingMonitoringByTurmaId={new Map()}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />
  );
}

function goToStep2WithDate(date = '2026-03-10') {
  fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: date } });
  fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
}

function fillNumericFields(values: {
  totalStudents: string; studentsWithCompleteGrades: string; studentsWithPartialGrades: string;
  studentsWithoutGrades: string; expectedGradeEntries: string; completedGradeEntries: string;
}) {
  fireEvent.change(screen.getByLabelText('Total de estudantes'), { target: { value: values.totalStudents } });
  fireEvent.change(screen.getByLabelText('Notas completas'), { target: { value: values.studentsWithCompleteGrades } });
  fireEvent.change(screen.getByLabelText('Preenchimento parcial'), { target: { value: values.studentsWithPartialGrades } });
  fireEvent.change(screen.getByLabelText('Sem notas'), { target: { value: values.studentsWithoutGrades } });
  fireEvent.change(screen.getByLabelText('Lançamentos esperados'), { target: { value: values.expectedGradeEntries } });
  fireEvent.change(screen.getByLabelText('Lançamentos realizados'), { target: { value: values.completedGradeEntries } });
}

const VALID_TOTALS = {
  totalStudents: '30', studentsWithCompleteGrades: '30', studentsWithPartialGrades: '0',
  studentsWithoutGrades: '0', expectedGradeEntries: '120', completedGradeEntries: '120',
};

describe('SigeReportModal', () => {
  beforeEach(() => {
    mockAuth.currentUser = { email: 'super.a@example.com' };
    mockSaveSigeReport.mockReset();
  });

  it('não avança para a etapa de turmas sem informar a data de referência', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByText('Informe a data de referência do relatório.')).toBeInTheDocument();
    expect(screen.getByText(/Etapa 1 de 3/)).toBeInTheDocument();
  });

  it('turma existente é associada automaticamente ao digitar o nome — "Turma encontrada"', () => {
    renderModal({ existingTurmas: [turma({ id: 't1', nome: '3º Ano A' })] });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano A' } });
    expect(screen.getByText(/Turma encontrada/)).toBeInTheDocument();
  });

  it('turma não cadastrada mostra aviso de criação e fica pendente até a confirmação humana explícita', () => {
    renderModal({ existingTurmas: [] });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano Nova' } });
    expect(screen.getByText(/Turma não cadastrada — será criada/)).toBeInTheDocument();
    fillNumericFields(VALID_TOTALS);

    // Sem marcar o checkbox de confirmação, avançar para a revisão é bloqueado.
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByText(/Resolva a correspondência/)).toBeInTheDocument();
    expect(screen.getByText(/Etapa 2 de 3/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Confirmo a criação desta turma/));
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByText(/Etapa 3 de 3/)).toBeInTheDocument();
  });

  it('correspondência ambígua nunca é resolvida automaticamente — exige escolha manual entre os candidatos', () => {
    const existentes = [
      turma({ id: 't1', nome: '3º Ano A', turno: 'Matutino' }),
      turma({ id: 't2', nome: '3º Ano A', turno: 'Vespertino' }),
    ];
    renderModal({ existingTurmas: existentes });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano A' } });

    expect(screen.getByText(/Possível correspondência — revisar/)).toBeInTheDocument();
    fillNumericFields(VALID_TOTALS);

    // Sem escolher entre os candidatos, avançar continua bloqueado.
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByText(/Resolva a correspondência/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Escolha a turma correta/), { target: { value: 't2' } });
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByText(/Etapa 3 de 3/)).toBeInTheDocument();
  });

  it('fluxo aceita várias turmas — "Adicionar turma" cria uma nova linha independente', () => {
    renderModal();
    goToStep2WithDate();
    expect(screen.getAllByLabelText('Nome da turma')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar turma' }));
    expect(screen.getAllByLabelText('Nome da turma')).toHaveLength(2);
  });

  it('linha matematicamente inconsistente nunca pode ser confirmada — bloqueada antes da revisão', () => {
    renderModal({ existingTurmas: [turma({ id: 't1', nome: '3º Ano A' })] });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano A' } });
    fillNumericFields({ ...VALID_TOTALS, completedGradeEntries: '999', expectedGradeEntries: '100' });

    expect(screen.getByText(/Lançamentos realizados não podem ser maiores que os esperados/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));
    expect(screen.getByText(/Resolva a correspondência e corrija os totais/)).toBeInTheDocument();
    expect(screen.getByText(/Etapa 2 de 3/)).toBeInTheDocument();
  });

  it('nenhuma turma é criada antes da confirmação final — saveSigeReport só é chamado ao clicar em "Confirmar registro"', () => {
    renderModal({ existingTurmas: [] });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano Nova' } });
    fillNumericFields(VALID_TOTALS);
    fireEvent.click(screen.getByLabelText(/Confirmo a criação desta turma/));
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));

    expect(screen.getByText(/Etapa 3 de 3/)).toBeInTheDocument();
    expect(mockSaveSigeReport).not.toHaveBeenCalled();
  });

  it('confirmar registro chama saveSigeReport com o shape esperado e fecha o modal ao concluir', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    mockSaveSigeReport.mockResolvedValue({ rows: [], turmasCreated: 1 });
    renderModal({ existingTurmas: [], onSaved, onClose });

    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano Nova' } });
    fireEvent.change(screen.getByLabelText('Turno (quando disponível)'), { target: { value: 'Matutino' } });
    fillNumericFields(VALID_TOTALS);
    fireEvent.click(screen.getByLabelText(/Confirmo a criação desta turma/));
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));

    await waitFor(() => expect(mockSaveSigeReport).toHaveBeenCalledTimes(1));
    const [input] = mockSaveSigeReport.mock.calls[0];
    expect(input.schoolId).toBe('diva-cabral');
    expect(input.anoLetivo).toBe(2026);
    expect(input.bimestre).toBe(1);
    expect(input.rows).toHaveLength(1);
    expect(input.rows[0]).toMatchObject({
      turmaNome: '3º Ano Nova', turno: 'Matutino', isNovaTurmaConfirmada: true, totalStudents: 30,
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sem usuário autenticado, confirmar nunca chama saveSigeReport (modo demonstração não escreve dados)', async () => {
    mockAuth.currentUser = null;
    renderModal({ existingTurmas: [turma({ id: 't1', nome: '3º Ano A' })] });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano A' } });
    fillNumericFields(VALID_TOTALS);
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));

    expect(screen.getByText('É preciso estar autenticado para registrar o relatório.')).toBeInTheDocument();
    expect(mockSaveSigeReport).not.toHaveBeenCalled();
  });

  it('falha ao salvar mostra a mensagem de erro e mantém o modal aberto (nunca fecha silenciosamente)', async () => {
    const onClose = vi.fn();
    mockSaveSigeReport.mockRejectedValue(new Error('permission-denied'));
    renderModal({ existingTurmas: [turma({ id: 't1', nome: '3º Ano A' })], onClose });
    goToStep2WithDate();
    fireEvent.change(screen.getByLabelText('Nome da turma'), { target: { value: '3º Ano A' } });
    fillNumericFields(VALID_TOTALS);
    fireEvent.click(screen.getByRole('button', { name: /Avançar/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));

    await waitFor(() => expect(screen.getByText(/permission-denied/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('nenhum campo nominal existe no formulário — nunca pede nome de estudante, CPF ou matrícula individual', () => {
    renderModal();
    goToStep2WithDate();
    expect(document.body.textContent).not.toMatch(/Nome do estudante|CPF|Matrícula individual/);
  });

  it('"Voltar e corrigir" retorna à etapa anterior sem perder os dados já preenchidos', () => {
    renderModal({ existingTurmas: [turma({ id: 't1', nome: '3º Ano A' })] });
    goToStep2WithDate();
    fireEvent.click(screen.getByRole('button', { name: /Voltar e corrigir/ }));
    expect(screen.getByText(/Etapa 1 de 3/)).toBeInTheDocument();
    expect((screen.getByLabelText('Data de referência') as HTMLInputElement).value).toBe('2026-03-10');
  });
});
