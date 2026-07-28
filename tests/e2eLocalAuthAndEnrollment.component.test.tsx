// @vitest-environment jsdom
// Hotfix estabilização — seção 11: teste end-to-end LOCAL (com mocks, sem
// Firebase real e sem produção) cobrindo o fluxo completo relatado como
// quebrado: login → sincronização → Gestão de Escolas → abrir uma escola →
// ausência de school_year (deve mostrar formulário, não erro) → falha real
// de permissão (deve mostrar erro + "Tentar novamente"). Combina
// AuthSessionBlock, SchoolsTable e SchoolEnrollmentPanel — os mesmos
// componentes que o usuário realmente usa, encadeados na mesma ordem.
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

const { mockAuth, mockGetSchoolYear, mockListSnapshots } = vi.hoisted(() => ({
  mockAuth: { currentUser: null as { email: string } | null },
  mockGetSchoolYear: vi.fn(),
  mockListSnapshots: vi.fn(),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mockAuth,
}));

vi.mock('../src/lib/superintendentService', () => ({
  isCurrentUserAdmin: () => true,
  hasSchoolWriteAccess: () => true,
  isCurrentUserAuthorized: () => true,
}));

vi.mock('../src/lib/schoolYearService', () => ({
  getSchoolYear: (...args: unknown[]) => mockGetSchoolYear(...args),
  saveSchoolYear: vi.fn(),
  SchoolYearValidationError: class extends Error {},
}));

vi.mock('../src/lib/enrollmentSnapshotService', () => ({
  listEnrollmentSnapshotsForSchool: (...args: unknown[]) => mockListSnapshots(...args),
  saveEnrollmentSnapshot: vi.fn(),
  EnrollmentSnapshotValidationError: class extends Error {},
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
  matriculas: 800, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo' as const,
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

    // 2. clicar uma vez em "Entrar com Google"
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(onLogin).toHaveBeenCalledTimes(1);

    // 3. simular autenticação aprovada + 4. sincronizar administrador —
    // authSyncing fica true enquanto App.tsx chama
    // syncSuperintendentsFromFirestore(), depois volta a false.
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

  it('5-8: abre Gestão de Escolas, clica em EEM Diva Cabral e vê o formulário quando não há school_year nem snapshots', async () => {
    mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
    mockGetSchoolYear.mockResolvedValue(null);
    mockListSnapshots.mockResolvedValue([]);

    // 5. Gestão de Escolas — a mesma tabela usada em produção.
    const onOpenEnrollmentPanel = vi.fn();
    render(
      <SchoolsTable
        schools={[SCHOOL]}
        summaries={{}}
        summariesLoading={false}
        summaryErrors={{}}
        onEdit={vi.fn()}
        onOpenEnrollmentPanel={onOpenEnrollmentPanel}
      />
    );

    // 6. abrir EEM Diva Cabral.
    fireEvent.click(screen.getByRole('button', { name: 'Preencher dados 2026 da escola EEM Diva Cabral' }));
    expect(onOpenEnrollmentPanel).toHaveBeenCalledWith(SCHOOL);
    cleanup();

    // 7-8. sem school_year/snapshots: formulário aparece, orientação de
    // estado inicial aparece, nenhum erro de permissão.
    render(
      <SchoolEnrollmentPanel school={SCHOOL} turmas={[]} isFirebaseMode={true} onClose={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText(/Configuração do Ano Letivo/)).toBeInTheDocument());
    expect(screen.getByText(/Esta escola ainda não possui configuração para 2026/)).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar os dados desta escola.')).not.toBeInTheDocument();
  });

  it('9-10: uma falha real de permissão mostra o erro e o botão "Tentar novamente", nunca o formulário', async () => {
    mockAuth.currentUser = { email: 'fernandomariodasmartins@gmail.com' };
    mockGetSchoolYear.mockRejectedValue(new Error('Missing or insufficient permissions.'));
    mockListSnapshots.mockResolvedValue([]);

    render(
      <SchoolEnrollmentPanel school={SCHOOL} turmas={[]} isFirebaseMode={true} onClose={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar os dados desta escola.')).toBeInTheDocument()
    );
    expect(screen.getByText('Missing or insufficient permissions.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText(/Configuração do Ano Letivo/)).not.toBeInTheDocument();
  });
});
