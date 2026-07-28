// @vitest-environment jsdom
// Hotfix — fluxo completo do primeiro registro mensal de uma turma (o
// cenário que estava quebrado em produção: "Erro ao salvar registro mensal:
// Missing or insufficient permissions."). saveEnrollmentSnapshot/
// getEnrollmentSnapshot são mockados aqui (o comportamento real deles já é
// coberto por tests/enrollmentSnapshotServiceFirestore.test.ts e pelas
// regras em tests/schoolYearRules.test.ts) — este arquivo testa só o fluxo
// do usuário através do painel: preencher o formulário, salvar, ver a
// mensagem de sucesso e o registro aparecer no histórico após recarregar.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import SchoolEnrollmentPanel from '../src/components/SchoolEnrollmentPanel';
import type { Turma } from '../src/types/classroom';
import type { EnrollmentSnapshot } from '../src/types/enrollment';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { mockAuth, mockHasSchoolWriteAccess, mockIsCurrentUserAuthorized, mockGetSchoolYear, mockListSnapshots, mockSaveSnapshot } = vi.hoisted(() => ({
  mockAuth: { currentUser: { email: 'fernandomariodasmartins@gmail.com' } as { email: string } | null },
  mockHasSchoolWriteAccess: vi.fn(),
  mockIsCurrentUserAuthorized: vi.fn(),
  mockGetSchoolYear: vi.fn(),
  mockListSnapshots: vi.fn(),
  mockSaveSnapshot: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
}));

vi.mock('../src/lib/superintendentService', () => ({
  hasSchoolWriteAccess: () => mockHasSchoolWriteAccess(),
  isCurrentUserAuthorized: () => mockIsCurrentUserAuthorized(),
}));

vi.mock('../src/lib/schoolYearService', () => ({
  getSchoolYear: (...args: unknown[]) => mockGetSchoolYear(...args),
  saveSchoolYear: vi.fn(),
  SchoolYearValidationError: class extends Error {},
}));

vi.mock('../src/lib/enrollmentSnapshotService', () => ({
  listEnrollmentSnapshotsForSchool: (...args: unknown[]) => mockListSnapshots(...args),
  saveEnrollmentSnapshot: (...args: unknown[]) => mockSaveSnapshot(...args),
  EnrollmentSnapshotValidationError: class extends Error {},
}));

vi.mock('../src/lib/classService', () => ({
  getActiveClassroomCount: (turmas: Turma[]) => turmas.length,
  getClassroomsForSchool: (turmas: Turma[]) => turmas,
  saveClassYearFields: vi.fn(),
  createClassroom: vi.fn(),
  ClassroomValidationError: class extends Error {},
}));

const SCHOOL = { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' };

const TURMA_2A: Turma = {
  id: 'turma-2a',
  escolaId: SCHOOL.id,
  escolaNome: SCHOOL.nome,
  nome: '2ª A',
  ano: '2º Ano',
  periodo: 'Manhã',
};

function renderPanel() {
  return render(
    <SchoolEnrollmentPanel
      school={SCHOOL}
      turmas={[TURMA_2A]}
      isFirebaseMode={true}
      onClose={vi.fn()}
    />
  );
}

describe('Fluxo completo — primeiro registro mensal (mocks, sem produção)', () => {
  beforeEach(() => {
    // 1-3: administrador autenticado, escola autorizada, turma existente.
    mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
    mockHasSchoolWriteAccess.mockReturnValue(true);
    mockIsCurrentUserAuthorized.mockReturnValue(true);
    mockGetSchoolYear.mockResolvedValue(null);
    // 4: nenhum snapshot de julho de 2026 ainda.
    mockListSnapshots.mockResolvedValue([]);
  });

  it('1-10: preenche o primeiro registro de julho/2026, salva, vê a confirmação e o registro no histórico', async () => {
    const savedSnapshot: EnrollmentSnapshot = {
      id: `${SCHOOL.id}_${TURMA_2A.id}_2026-07`,
      schoolId: SCHOOL.id,
      codInep: SCHOOL.codInep,
      escolaNome: SCHOOL.nome,
      turmaId: TURMA_2A.id,
      turmaNome: TURMA_2A.nome,
      anoLetivo: 2026,
      mesReferencia: '2026-07',
      matriculaInicioMes: 41,
      novasMatriculas: 0,
      transferenciasEntrada: 0,
      transferenciasSaida: 0,
      abandono: 0,
      outrasSaidas: 0,
      matriculaFimMes: 41,
      reviewStatus: 'manual',
      createdAt: '2026-07-31T12:00:00.000Z',
      updatedAt: '2026-07-31T12:00:00.000Z',
      createdBy: 'fernandomariodasmartins@gmail.com',
      updatedBy: 'fernandomariodasmartins@gmail.com',
    };
    mockSaveSnapshot.mockResolvedValue(savedSnapshot);

    renderPanel();

    // Painel carregado (school_year null é normal — não bloqueia o registro mensal).
    await waitFor(() => expect(screen.getByText('Salvar registro mensal')).toBeInTheDocument());
    expect(screen.getByText('Nenhum registro mensal ainda — Não informado.')).toBeInTheDocument();

    // O painel também renderiza SchoolYearConfigForm (seu próprio <select>
    // de status e input numérico de matrícula inicial) na mesma tela — as
    // queries abaixo são escopadas à seção "Registro mensal" para não
    // colidir com os campos daquele outro formulário.
    const monthlySection = document.getElementById('monthly-enrollment') as HTMLElement;
    const monthly = within(monthlySection);

    const turmaSelect = monthly.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(turmaSelect, { target: { value: TURMA_2A.id } });

    const mesInput = monthlySection.querySelector('input[type="month"]') as HTMLInputElement;
    fireEvent.change(mesInput, { target: { value: '2026-07' } });

    // 5-7: matrícula inicial 41, movimentos zerados (valor default do
    // formulário), matrícula final 41 — ordem dos spinbuttons definida em
    // SchoolEnrollmentPanel.tsx: início, novas, transf. entrada, transf.
    // saída, abandono, outras saídas, [matrícula final].
    const numberInputs = monthly.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(numberInputs).toHaveLength(7);
    fireEvent.change(numberInputs[0], { target: { value: '41' } }); // Matr. início do mês
    fireEvent.change(numberInputs[6], { target: { value: '41' } }); // Matrícula final

    // Depois de salvar, a próxima chamada a listEnrollmentSnapshotsForSchool
    // (reloadSchoolData) já reflete o novo registro.
    mockListSnapshots.mockResolvedValueOnce([savedSnapshot]);

    // 8: clicar em Salvar registro mensal.
    fireEvent.click(monthly.getByRole('button', { name: 'Salvar registro mensal' }));

    // 9: mensagem de sucesso — nunca mais "Missing or insufficient permissions.".
    await waitFor(() =>
      expect(screen.getByText('Registro mensal salvo com sucesso.')).toBeInTheDocument()
    );
    expect(screen.queryByText(/Missing or insufficient permissions/)).not.toBeInTheDocument();

    expect(mockSaveSnapshot).toHaveBeenCalledTimes(1);
    expect(mockSaveSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL.id,
        turmaId: TURMA_2A.id,
        mesReferencia: '2026-07',
        matriculaInicioMes: 41,
        matriculaFimMes: 41,
      })
    );

    // 10: recarregar o painel (reloadSchoolData) e confirmar o registro no histórico.
    await waitFor(() => expect(screen.getByText('2026-07')).toBeInTheDocument());
    const historyRow = screen.getByText('2026-07').closest('tr');
    expect(historyRow).not.toBeNull();
    expect(historyRow!.textContent).toContain('2ª A');
    expect(historyRow!.textContent).toContain('41');
    expect(screen.queryByText('Nenhum registro mensal ainda — Não informado.')).not.toBeInTheDocument();
  });
});
