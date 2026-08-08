// @vitest-environment jsdom
// Correção de usabilidade — a ação de preenchimento de dados estava
// escondida atrás de um ícone sem texto na coluna Ações (ver
// src/components/SchoolsTable.tsx). isCurrentUserAdmin é mockado para
// controlar os cenários admin/superintendente sem tocar localStorage ou
// Firebase de verdade.
//
// Reestruturação SIFEC: a tabela deixou de mostrar os KPIs derivados do
// registro mensal (matrícula atual/variação/cobertura/média/entradas e
// saídas acumuladas/última atualização) — agora recebe só
// `turmasAtivasPorEscola`, e a ação principal abre "Matrícula por bimestre"
// (não mais "Preencher dados 2026").
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SchoolsTable from '../src/components/SchoolsTable';

// Este projeto não usa `globals: true` no Vitest — sem afterEach(cleanup)
// explícito, o DOM de um teste vaza para o próximo.
afterEach(cleanup);

const mockIsCurrentUserAdmin = vi.fn();
vi.mock('../src/lib/superintendentService', () => ({
  isCurrentUserAdmin: () => mockIsCurrentUserAdmin(),
}));

const SCHOOL = {
  id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918', cidade: 'Fortaleza',
  regiao: '4ª' as const, matriculas: 800, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo' as const,
};

function renderTable() {
  const onEdit = vi.fn();
  const onOpenEnrollmentPanel = vi.fn();
  render(
    <SchoolsTable
      schools={[SCHOOL]}
      turmasAtivasPorEscola={{ [SCHOOL.id]: 3 }}
      onEdit={onEdit}
      onOpenEnrollmentPanel={onOpenEnrollmentPanel}
    />
  );
  return { onEdit, onOpenEnrollmentPanel };
}

describe('SchoolsTable — ação de matrícula por bimestre', () => {
  beforeEach(() => {
    mockIsCurrentUserAdmin.mockReset();
  });

  it('botão "Matrícula por bimestre" aparece com texto visível (não só ícone)', () => {
    mockIsCurrentUserAdmin.mockReturnValue(false);
    renderTable();
    expect(screen.getByText('Matrícula por bimestre')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Matrícula por bimestre da escola EEM Diva Cabral' })
    ).toBeInTheDocument();
  });

  it('clique no botão abre o painel da escola correta', () => {
    mockIsCurrentUserAdmin.mockReturnValue(false);
    const { onOpenEnrollmentPanel } = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Matrícula por bimestre da escola EEM Diva Cabral' }));
    expect(onOpenEnrollmentPanel).toHaveBeenCalledTimes(1);
    expect(onOpenEnrollmentPanel).toHaveBeenCalledWith(SCHOOL);
  });

  it('superintendente comum (não-admin) vê a ação de preenchimento', () => {
    mockIsCurrentUserAdmin.mockReturnValue(false);
    renderTable();
    expect(
      screen.getByRole('button', { name: 'Matrícula por bimestre da escola EEM Diva Cabral' })
    ).toBeVisible();
  });

  it('edição do cadastro mestre continua exclusiva para administrador', () => {
    mockIsCurrentUserAdmin.mockReturnValue(false);
    renderTable();
    expect(screen.queryByRole('button', { name: /editar cadastro mestre/i })).not.toBeInTheDocument();
    expect(screen.getByText('Restrito')).toBeInTheDocument();
  });

  it('administrador vê e consegue usar o botão de editar cadastro mestre', () => {
    mockIsCurrentUserAdmin.mockReturnValue(true);
    const { onEdit } = renderTable();
    const editButton = screen.getByRole('button', { name: 'Editar cadastro mestre da escola EEM Diva Cabral' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith(SCHOOL);
  });

  it('administrador também vê a ação de preenchimento (ação principal, não some para ninguém)', () => {
    mockIsCurrentUserAdmin.mockReturnValue(true);
    renderTable();
    expect(
      screen.getByRole('button', { name: 'Matrícula por bimestre da escola EEM Diva Cabral' })
    ).toBeInTheDocument();
  });

  it('exibe a região da escola, ou "Não informado" quando ausente', () => {
    mockIsCurrentUserAdmin.mockReturnValue(false);
    renderTable();
    expect(screen.getByText('4ª')).toBeInTheDocument();
  });

  it('turmas ativas vêm de turmasAtivasPorEscola, nunca de um KPI de registro mensal', () => {
    mockIsCurrentUserAdmin.mockReturnValue(false);
    renderTable();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
