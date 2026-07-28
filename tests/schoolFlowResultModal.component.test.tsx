// @vitest-environment jsdom
// Fase 2B — formulário de fluxo escolar (SchoolFlowResultModal). Cobre:
// percentuais em tempo real, salvar rascunho, confirmar resultado válido,
// confirmar total zero bloqueado (erro real do service, nunca escondido),
// e divergência contra a matrícula de referência exigindo observação antes
// de confirmar (nunca bloqueia rascunho, nunca bloqueia sozinha).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SchoolFlowResultModal from '../src/components/SchoolFlowResultModal';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { mockAuth, mockSave, mockGetSchoolYear } = vi.hoisted(() => ({
  mockAuth: { currentUser: { email: 'super.a@example.com' } as { email: string } | null },
  mockSave: vi.fn(),
  mockGetSchoolYear: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({ auth: mockAuth }));

vi.mock('../src/lib/schoolFlowService', () => ({
  saveSchoolFlowResult: (...args: unknown[]) => mockSave(...args),
  SchoolFlowResultValidationError: class extends Error {},
}));

vi.mock('../src/lib/schoolYearService', () => ({
  getSchoolYear: (...args: unknown[]) => mockGetSchoolYear(...args),
}));

const SCHOOL = { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' };

function renderModal(overrides: Partial<Parameters<typeof SchoolFlowResultModal>[0]> = {}) {
  return render(
    <SchoolFlowResultModal
      school={SCHOOL}
      anoLetivo={2025}
      existing={null}
      canWrite={true}
      isFirebaseMode={true}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      {...overrides}
    />
  );
}

function numberInputs() {
  return screen.getAllByRole('spinbutton') as HTMLInputElement[];
}

describe('SchoolFlowResultModal', () => {
  beforeEach(() => {
    mockAuth.currentUser = { email: 'super.a@example.com' };
    mockGetSchoolYear.mockResolvedValue(null);
  });

  it('percentuais mudam conforme os campos são preenchidos', async () => {
    renderModal();
    const [aprovados, reprovados, abandono] = numberInputs();

    fireEvent.change(aprovados, { target: { value: '80' } });
    fireEvent.change(reprovados, { target: { value: '15' } });
    fireEvent.change(abandono, { target: { value: '5' } });

    await waitFor(() => expect(screen.getByText('80.0%')).toBeInTheDocument());
    expect(screen.getByText('15.0%')).toBeInTheDocument();
    expect(screen.getByText('5.0%')).toBeInTheDocument();
    expect(screen.getByText(/Total de resultados:/)).toBeInTheDocument();
    expect(screen.getAllByText('100').length).toBeGreaterThan(0);
  });

  it('salva rascunho com total zero sem bloqueio', async () => {
    mockSave.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSaved, onClose });

    // status já nasce 'rascunho' por padrão — só confirma o envio.
    fireEvent.click(screen.getByRole('button', { name: 'Salvar resultado' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({ status: 'rascunho', aprovados: 0, reprovados: 0, abandono: 0 });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirma um resultado válido (total > 0)', async () => {
    mockSave.mockResolvedValue(undefined);
    renderModal();
    const [aprovados] = numberInputs();
    fireEvent.change(aprovados, { target: { value: '700' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'confirmado' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar resultado' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({ status: 'confirmado', aprovados: 700 });
  });

  it('confirmar total zero é bloqueado — erro real do service permanece visível', async () => {
    const { SchoolFlowResultValidationError } = await import('../src/lib/schoolFlowService');
    mockSave.mockRejectedValue(
      new SchoolFlowResultValidationError(
        'Um resultado confirmado precisa ter total de resultados (aprovados + reprovados + abandono) maior que zero.'
      )
    );
    renderModal();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'confirmado' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar resultado' }));

    await waitFor(() =>
      expect(
        screen.getByText('Um resultado confirmado precisa ter total de resultados (aprovados + reprovados + abandono) maior que zero.')
      ).toBeInTheDocument()
    );
  });

  it('divergência contra a matrícula de referência exige observação antes de confirmar', async () => {
    mockGetSchoolYear.mockResolvedValue({ matriculaAtual: 100, matriculaInicial: 95 });
    mockSave.mockResolvedValue(undefined);
    renderModal();

    await waitFor(() => expect(mockGetSchoolYear).toHaveBeenCalledWith('diva-cabral', 2025));

    const [aprovados] = numberInputs();
    fireEvent.change(aprovados, { target: { value: '60' } }); // total 60 != matrícula 100
    await waitFor(() =>
      expect(screen.getByText('O total de resultados difere da matrícula de referência (100).')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'confirmado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar resultado' }));

    await waitFor(() =>
      expect(
        screen.getByText('O total de resultados difere da matrícula de referência — informe uma observação antes de confirmar.')
      ).toBeInTheDocument()
    );
    expect(mockSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Divergência por transferência tardia.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar resultado' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  });

  it('divergência não bloqueia rascunho, mesmo sem observação', async () => {
    mockGetSchoolYear.mockResolvedValue({ matriculaAtual: 100, matriculaInicial: 95 });
    mockSave.mockResolvedValue(undefined);
    renderModal();

    await waitFor(() => expect(mockGetSchoolYear).toHaveBeenCalled());
    const [aprovados] = numberInputs();
    fireEvent.change(aprovados, { target: { value: '60' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar resultado' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toMatchObject({ status: 'rascunho' });
  });

  it('sem permissão: não mostra o formulário', () => {
    renderModal({ canWrite: false });
    expect(screen.getByText(/Sem permissão para registrar o fluxo escolar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar resultado' })).not.toBeInTheDocument();
  });

  it('modo demonstração: não mostra o formulário real', () => {
    renderModal({ isFirebaseMode: false });
    expect(screen.getByText(/Modo demonstração/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar resultado' })).not.toBeInTheDocument();
  });
});
