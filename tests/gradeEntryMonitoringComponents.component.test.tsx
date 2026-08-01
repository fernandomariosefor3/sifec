// @vitest-environment jsdom
// Fase 2C.1 — testes de componente da tabela de acompanhamento
// (GradeEntryMonitoringTable) e do formulário de registro
// (GradeEntryMonitoringFormModal) em isolamento. Substitui
// tests/notasModals.component.test.tsx (StudentRegistrationModal/
// StudentBimesterGradeFormModal — protótipo nominal descontinuado, ver
// docs/descontinuacao-prototipo-notas-nominais.md). Só firebase.ts (auth) e
// gradeEntryMonitoringService.ts são mockados — a orquestração de
// NotasView (seleção de escola, filtros) é coberta em
// tests/notasView.component.test.tsx.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GradeEntryMonitoringTable, { type GradeEntryMonitoringRow } from '../src/components/notas/GradeEntryMonitoringTable';
import GradeEntryMonitoringFormModal from '../src/components/notas/GradeEntryMonitoringFormModal';
import type { GradeEntryMonitoring } from '../src/types/gradeEntryMonitoring';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function monitoring(overrides: Partial<GradeEntryMonitoring> = {}): GradeEntryMonitoring {
  return {
    id: 'diva-cabral_2026_b1_turma-3a-diva',
    schoolId: 'diva-cabral', codInep: '23067918', escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva', turmaNome: '3º Ano A - Matutino', anoLetivo: 2026, bimestre: 1,
    totalStudents: 32, studentsWithCompleteGrades: 32, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
    expectedGradeEntries: 128, completedGradeEntries: 128, status: 'confirmado', sourceSystem: 'SIGE Escola',
    referenceDate: '2026-03-10',
    createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: 'super.a@example.com', updatedBy: 'super.a@example.com',
    ...overrides,
  };
}

describe('GradeEntryMonitoringTable', () => {
  const noop = () => {};

  it('mostra estado de carregamento', () => {
    render(<GradeEntryMonitoringTable rows={[]} loading canWrite statusFilter="todos" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(screen.getByText('Carregando turmas...')).toBeInTheDocument();
  });

  it('nenhuma turma cadastrada mostra orientação para cadastrar em Gestão de Escolas', () => {
    render(<GradeEntryMonitoringTable rows={[]} loading={false} canWrite statusFilter="todos" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(screen.getByText(/Nenhuma turma cadastrada para esta escola e ano letivo/)).toBeInTheDocument();
  });

  it('turma sem relatório informado mostra "—" nos totais e badge "Relatório não informado"', () => {
    const rows: GradeEntryMonitoringRow[] = [{ turmaId: 't1', turmaNome: 'Turma A', matriculaAtual: 30, monitoring: null }];
    render(<GradeEntryMonitoringTable rows={rows} loading={false} canWrite statusFilter="todos" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(screen.getByText('Relatório não informado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar acompanhamento' })).toBeInTheDocument();
  });

  it('turma com relatório completo mostra os totais e badge "Preenchimento completo"', () => {
    const rows: GradeEntryMonitoringRow[] = [{ turmaId: 't1', turmaNome: 'Turma A', matriculaAtual: 32, monitoring: monitoring() }];
    render(<GradeEntryMonitoringTable rows={rows} loading={false} canWrite statusFilter="todos" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(screen.getByText('Preenchimento completo')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar acompanhamento' })).toBeInTheDocument();
  });

  it('filtro por status restringe as linhas visíveis', () => {
    const rows: GradeEntryMonitoringRow[] = [
      { turmaId: 't1', turmaNome: 'Turma Completa', matriculaAtual: 32, monitoring: monitoring() },
      { turmaId: 't2', turmaNome: 'Turma Sem Relatório', matriculaAtual: 30, monitoring: null },
    ];
    render(<GradeEntryMonitoringTable rows={rows} loading={false} canWrite statusFilter="completo" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(screen.getByText('Turma Completa')).toBeInTheDocument();
    expect(screen.queryByText('Turma Sem Relatório')).not.toBeInTheDocument();
  });

  it('sem permissão de escrita, o botão de registrar fica desabilitado', () => {
    const rows: GradeEntryMonitoringRow[] = [{ turmaId: 't1', turmaNome: 'Turma A', matriculaAtual: 30, monitoring: null }];
    render(<GradeEntryMonitoringTable rows={rows} loading={false} canWrite={false} statusFilter="todos" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(screen.getByRole('button', { name: 'Registrar acompanhamento' })).toBeDisabled();
  });

  it('clicar em "Registrar acompanhamento" chama onRegistrar com a linha correspondente', () => {
    const onRegistrar = vi.fn();
    const row: GradeEntryMonitoringRow = { turmaId: 't1', turmaNome: 'Turma A', matriculaAtual: 30, monitoring: null };
    render(<GradeEntryMonitoringTable rows={[row]} loading={false} canWrite statusFilter="todos" onStatusFilterChange={noop} onRegistrar={onRegistrar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar acompanhamento' }));
    expect(onRegistrar).toHaveBeenCalledWith(row);
  });

  it('nunca exibe nome de estudante ou qualquer dado nominal', () => {
    const rows: GradeEntryMonitoringRow[] = [{ turmaId: 't1', turmaNome: 'Turma A', matriculaAtual: 30, monitoring: monitoring() }];
    render(<GradeEntryMonitoringTable rows={rows} loading={false} canWrite statusFilter="todos" onStatusFilterChange={noop} onRegistrar={noop} />);
    expect(document.body.textContent).not.toMatch(/Estudante/);
  });
});

const { mockAuth, mockSave } = vi.hoisted(() => ({
  mockAuth: { currentUser: { email: 'super.a@example.com' } as { email: string } | null },
  mockSave: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/gradeEntryMonitoringService', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/gradeEntryMonitoringService')>();
  return { ...actual, saveGradeEntryMonitoring: (...args: unknown[]) => mockSave(...args) };
});

const SCHOOL = { id: 'diva-cabral', codInep: '23067918', nome: 'EEM Diva Cabral' };

describe('GradeEntryMonitoringFormModal', () => {
  beforeEach(() => {
    mockAuth.currentUser = { email: 'super.a@example.com' };
    mockSave.mockReset();
  });

  function renderForm(overrides: Partial<Parameters<typeof GradeEntryMonitoringFormModal>[0]> = {}) {
    return render(
      <GradeEntryMonitoringFormModal
        school={SCHOOL}
        turmaId="turma-3a-diva"
        turmaNome="3º Ano A - Matutino"
        anoLetivo={2026}
        bimestre={1}
        existing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        {...overrides}
      />
    );
  }

  function fillAllTotals(values: Record<string, string>) {
    for (const [label, value] of Object.entries(values)) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
  }

  const VALID_TOTALS = {
    'Total de estudantes': '32',
    'Estudantes com notas completas': '32',
    'Estudantes com preenchimento parcial': '0',
    'Estudantes sem notas': '0',
    'Total de lançamentos esperados': '128',
    'Total de lançamentos realizados': '128',
  };

  it('não mostra nenhum botão de exclusão comum', () => {
    renderForm();
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  it('envio sem preencher todos os totais é bloqueado, com mensagem clara', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-03-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(screen.getByText('Preencha todos os totais — nenhum campo pode ficar em branco.')).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('envio sem data de referência é bloqueado', async () => {
    renderForm();
    fillAllTotals(VALID_TOTALS);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(screen.getByText('Informe a data de referência do relatório.')).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('soma de estudantes divergente do total mostra aviso, mesmo antes do envio', async () => {
    renderForm();
    fillAllTotals({ ...VALID_TOTALS, 'Estudantes com notas completas': '10', 'Estudantes com preenchimento parcial': '10', 'Estudantes sem notas': '5' });
    await waitFor(() =>
      expect(screen.getByText('A soma de completas, parciais e sem notas precisa ser igual ao total de estudantes.')).toBeInTheDocument()
    );
  });

  it('envio válido chama saveGradeEntryMonitoring com os totais convertidos para número', async () => {
    mockSave.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderForm({ onSaved, onClose });

    fillAllTotals(VALID_TOTALS);
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-03-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({
      schoolId: 'diva-cabral',
      turmaId: 'turma-3a-diva',
      anoLetivo: 2026,
      bimestre: 1,
      totalStudents: 32,
      completedGradeEntries: 128,
      referenceDate: '2026-03-10',
      actingUserEmail: 'super.a@example.com',
    });
    expect(typeof mockSave.mock.calls[0][0].totalStudents).toBe('number');
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('erro de validação do serviço fica visível e onSaved NÃO é chamado', async () => {
    const { GradeEntryMonitoringValidationError } = await import('../src/lib/gradeEntryMonitoringService');
    mockSave.mockRejectedValueOnce(new GradeEntryMonitoringValidationError('Lançamentos realizados não podem ser maiores que os lançamentos esperados.'));
    const onSaved = vi.fn();
    renderForm({ onSaved });

    fillAllTotals(VALID_TOTALS);
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-03-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() =>
      expect(screen.getByText('Lançamentos realizados não podem ser maiores que os lançamentos esperados.')).toBeInTheDocument()
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('apagar a observação existente envia null (nunca undefined) para garantir que o campo é removido, não preservado', async () => {
    mockSave.mockResolvedValue(undefined);
    renderForm({ existing: monitoring({ observation: 'Observação a ser apagada' }) });

    fireEvent.change(screen.getByLabelText('Observação (opcional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0].observation).toBeNull();
  });

  it('pré-carrega os totais existentes ao corrigir um relatório já registrado', () => {
    renderForm({ existing: monitoring({ totalStudents: 32, completedGradeEntries: 128 }) });
    expect((screen.getByLabelText('Total de estudantes') as HTMLInputElement).value).toBe('32');
    expect((screen.getByLabelText('Total de lançamentos realizados') as HTMLInputElement).value).toBe('128');
    expect((screen.getByLabelText('Data de referência') as HTMLInputElement).value).toBe('2026-03-10');
  });

  it('botão Cancelar fecha sem salvar', () => {
    const onClose = vi.fn();
    renderForm({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('sem usuário autenticado, o envio é bloqueado com mensagem clara', async () => {
    mockAuth.currentUser = null;
    renderForm();
    fillAllTotals(VALID_TOTALS);
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-03-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar acompanhamento' }));

    await waitFor(() => expect(screen.getByText('É preciso estar autenticado para registrar o acompanhamento.')).toBeInTheDocument());
    expect(mockSave).not.toHaveBeenCalled();
  });
});
