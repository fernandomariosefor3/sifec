// @vitest-environment jsdom
// Hotfix estabilização — seção 11: teste end-to-end LOCAL (com mocks, sem
// Firebase real e sem produção) cobrindo o fluxo completo: login →
// sincronização → Gestão de Escolas → abrir uma escola → matrícula por
// bimestre carrega normalmente → falha real de permissão (deve mostrar erro
// + "Tentar novamente"). Combina AuthSessionBlock, SchoolsTable e
// SchoolEnrollmentPanel — os mesmos componentes que o usuário realmente usa,
// encadeados na mesma ordem.
//
// Reestruturação SIFEC: o painel deixou de depender de schoolYearService/
// enrollmentSnapshotService (configuração do ano letivo + registro mensal
// removidos da UI) — agora usa bimonthlyEnrollmentService (matrícula por
// bimestre).
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import AuthSessionBlock from '../src/components/AuthSessionBlock';
import SchoolsTable from '../src/components/SchoolsTable';
import SchoolEnrollmentPanel from '../src/components/SchoolEnrollmentPanel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { mockAuth, mockListBimonthly } = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { email: string } | null },
  mockListBimonthly: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
}));

vi.mock('../src/lib/superintendentService', () => ({
  isCurrentUserAdmin: () => true,
  hasSchoolWriteAccess: () => true,
  isCurrentUserAuthorized: () => true,
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

const SCHOOL = {
  id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918', cidade: 'Fortaleza',
  regiao: '4ª' as const, matriculas: 800, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo' as const,
};

describe('Fluxo local completo (E2E com mocks) — login, Gestão de Escolas, painel', () => {
  beforeEach(() => {
    mockAuth.currentUser = null;
  });

  it('1-4: um clique em "Entrar com Google" aciona o login; estado de sincronização aparece e depois some', () => {
    const onLogin = vi.fn(() => {
      mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
    });

    const { rerender } = render(
      <AuthSessionBlock
        currentUser={null}
        authLoading={false}
        authSyncing={false}
        authError={null}
        onLogin={onLogin}
        onLogout={vi.fn()}
        onRetrySync={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(onLogin).toHaveBeenCalledTimes(1);

    rerender(
      <AuthSessionBlock
        currentUser={{ email: 'fernandomariodasmartins@gmail.com', displayName: 'Admin Raiz' }}
        authLoading={false}
        authSyncing={true}
        authError={null}
        onLogin={onLogin}
        onLogout={vi.fn()}
        onRetrySync={vi.fn()}
      />
    );
    expect(screen.getByText('Validando seu acesso ao SIFEC...')).toBeInTheDocument();

    rerender(
      <AuthSessionBlock
        currentUser={{ email: 'fernandomariodasmartins@gmail.com', displayName: 'Admin Raiz' }}
        authLoading={false}
        authSyncing={false}
        authError={null}
        onLogin={onLogin}
        onLogout={vi.fn()}
        onRetrySync={vi.fn()}
      />
    );
    expect(screen.queryByText('Validando seu acesso ao SIFEC...')).not.toBeInTheDocument();
    expect(screen.getByText('Admin Raiz')).toBeInTheDocument();
  });

  it('5-8: abre Gestão de Escolas, clica em EEM Diva Cabral e vê a matrícula por bimestre sem erro', async () => {
    mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
    mockListBimonthly.mockResolvedValue([]);

    const onOpenEnrollmentPanel = vi.fn();
    render(
      <SchoolsTable
        schools={[SCHOOL]}
        turmasAtivasPorEscola={{ [SCHOOL.id]: 0 }}
        onEdit={vi.fn()}
        onOpenEnrollmentPanel={onOpenEnrollmentPanel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Matrícula por bimestre da escola EEM Diva Cabral' }));
    expect(onOpenEnrollmentPanel).toHaveBeenCalledWith(SCHOOL);
    cleanup();

    render(
      <SchoolEnrollmentPanel school={SCHOOL} turmas={[]} isFirebaseMode={true} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Matrícula por bimestre')).toBeInTheDocument());
    expect(screen.queryByText('Não foi possível carregar os dados desta escola.')).not.toBeInTheDocument();
  });

  it('9-10: uma falha real de permissão mostra o erro e o botão "Tentar novamente", nunca o formulário', async () => {
    mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
    mockListBimonthly.mockRejectedValue(new Error('Missing or insufficient permissions.'));

    render(
      <SchoolEnrollmentPanel school={SCHOOL} turmas={[]} isFirebaseMode={true} onClose={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar os dados desta escola.')).toBeInTheDocument()
    );
    expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
