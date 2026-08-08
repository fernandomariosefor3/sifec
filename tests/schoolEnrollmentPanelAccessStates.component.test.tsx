// @vitest-environment jsdom
// Hotfix estabilização — o painel de matrículas precisa distinguir três
// estados: (A) escola autorizada, carregamento normal (deve mostrar a
// matrícula por bimestre), (B) falha real de permissão/carregamento (deve
// mostrar erro + "Tentar novamente", nunca formulário) e (C) usuário não
// cadastrado/inativo (deve explicar isso, nunca mostrar formulário).
//
// Reestruturação SIFEC: reescrito para o painel simplificado
// (bimonthlyEnrollmentService no lugar de schoolYearService/
// enrollmentSnapshotService — configuração do ano letivo e registro mensal
// foram removidos da UI).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SchoolEnrollmentPanel from '../src/components/SchoolEnrollmentPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { mockAuth, mockHasSchoolWriteAccess, mockIsCurrentUserAuthorized, mockListBimonthly } = vi.hoisted(() => ({
  mockAuth: { currentUser: { email: 'super.a@example.com' } as { email: string } | null },
  mockHasSchoolWriteAccess: vi.fn(),
  mockIsCurrentUserAuthorized: vi.fn(),
  mockListBimonthly: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
}));

vi.mock('../src/lib/superintendentService', () => ({
  hasSchoolWriteAccess: () => mockHasSchoolWriteAccess(),
  isCurrentUserAuthorized: () => mockIsCurrentUserAuthorized(),
}));

vi.mock('../src/lib/bimonthlyEnrollmentService', () => ({
  listBimonthlyEnrollmentsForSchool: (...args: unknown[]) => mockListBimonthly(...args),
  saveBimonthlyEnrollment: vi.fn(),
  BimonthlyEnrollmentValidationError: class extends Error {},
}));

vi.mock('../src/lib/classService', () => ({
  getActiveClassroomCount: () => 0,
  getClassroomsForSchool: () => [],
  saveClassYearFields: vi.fn(),
  createClassroom: vi.fn(),
  ClassroomValidationError: class extends Error {},
}));

const SCHOOL = { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' };

function renderPanel() {
  return render(
    <SchoolEnrollmentPanel
      school={SCHOOL}
      turmas={[]}
      isFirebaseMode={true}
      onClose={vi.fn()}
    />
  );
}

describe('SchoolEnrollmentPanel — estados de acesso (A/B/C)', () => {
  beforeEach(() => {
    mockHasSchoolWriteAccess.mockReturnValue(true);
    mockIsCurrentUserAuthorized.mockReturnValue(true);
    mockAuth.currentUser = { email: 'super.a@example.com' };
  });

  it('A. escola autorizada: mostra a matrícula por bimestre e a seção de turmas, sem erro', async () => {
    mockListBimonthly.mockResolvedValue([]);
    renderPanel();

    await waitFor(() => expect(screen.getByText('Matrícula por bimestre')).toBeInTheDocument());
    expect(screen.queryByText('Não foi possível carregar os dados desta escola.')).not.toBeInTheDocument();
    expect(screen.queryByText(/não está cadastrada ou está inativa/i)).not.toBeInTheDocument();
    expect(screen.getByText('Turmas')).toBeInTheDocument();
  });

  it('B. falha real de carregamento: mostra erro e botão "Tentar novamente", sem formulário', async () => {
    mockListBimonthly.mockRejectedValue(new Error('Missing or insufficient permissions.'));
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar os dados desta escola.')).toBeInTheDocument()
    );
    expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument();
    expect(screen.queryByText('Turmas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('B. botão "Tentar novamente" refaz o carregamento', async () => {
    mockListBimonthly.mockRejectedValueOnce(new Error('Erro de rede'));
    renderPanel();

    await waitFor(() => expect(screen.getByText('Erro de rede')).toBeInTheDocument());

    mockListBimonthly.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByText('Matrícula por bimestre')).toBeInTheDocument());
    expect(mockListBimonthly).toHaveBeenCalledTimes(2);
  });

  it('C. usuário não cadastrado/inativo: explica a situação e nunca mostra formulário', async () => {
    mockIsCurrentUserAuthorized.mockReturnValue(false);
    mockHasSchoolWriteAccess.mockReturnValue(false);
    mockListBimonthly.mockResolvedValue([]);
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Sua conta não está cadastrada ou está inativa no SIFEC.')).toBeInTheDocument()
    );
    expect(screen.queryByText('Turmas')).not.toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar os dados desta escola.')).not.toBeInTheDocument();
  });

  it('C. não se aplica no modo demonstração (sem Firebase), mesmo sem usuário', async () => {
    mockAuth.currentUser = null;
    render(
      <SchoolEnrollmentPanel
        school={SCHOOL}
        turmas={[]}
        isFirebaseMode={false}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.queryByText(/Carregando dados da escola/)).not.toBeInTheDocument());
    expect(screen.queryByText(/não está cadastrada ou está inativa/i)).not.toBeInTheDocument();
  });
});
