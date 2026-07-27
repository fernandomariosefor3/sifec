// @vitest-environment jsdom
// Correção de usabilidade — registro mensal orientado quando não há turma
// (ver src/components/MonthlyEnrollmentForm.tsx). Componente puramente
// apresentacional, sem dependência do Firebase.
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MonthlyEnrollmentForm from '../src/components/MonthlyEnrollmentForm';
import type { Turma } from '../src/types/classroom';

// Este projeto não usa `globals: true` no Vitest — sem afterEach(cleanup)
// explícito, o DOM de um teste vaza para o próximo.
afterEach(cleanup);

const TURMA_A: Turma = {
  id: 't1', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral',
  nome: '3º Ano A', ano: '3º Ano', periodo: 'Matutino',
};

function baseProps(overrides: Partial<ComponentProps<typeof MonthlyEnrollmentForm>> = {}): ComponentProps<typeof MonthlyEnrollmentForm> {
  return {
    sectionId: 'monthly-enrollment',
    canWrite: true,
    isFirebaseMode: true,
    turmasDaEscola: [],
    anoLetivo: 2026,
    formError: '',
    formSuccess: '',
    turmaId: '',
    onTurmaIdChange: vi.fn(),
    mesReferencia: '',
    onMesReferenciaChange: vi.fn(),
    movementFields: [
      { label: 'Matr. início do mês', value: '0', onChange: vi.fn() },
      { label: 'Novas matrículas', value: '0', onChange: vi.fn() },
    ],
    matriculaFimMes: '0',
    onMatriculaFimMesChange: vi.fn(),
    observacao: '',
    onObservacaoChange: vi.fn(),
    calculoPreview: 0,
    divergente: false,
    onSubmit: vi.fn(e => e.preventDefault()),
    onCreateFirstClassroom: vi.fn(),
    ...overrides,
  };
}

describe('MonthlyEnrollmentForm', () => {
  it('sem turma: mostra orientação e botão "Cadastrar primeira turma", campos desabilitados', () => {
    render(<MonthlyEnrollmentForm {...baseProps({ turmasDaEscola: [] })} />);

    expect(screen.getByText('Cadastre pelo menos uma turma para liberar o registro mensal.')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /cadastrar primeira turma/i });
    expect(cta).toBeInTheDocument();

    // Não é só um seletor vazio sem explicação — mostra texto explícito.
    expect(screen.getByText('Nenhuma turma cadastrada')).toBeInTheDocument();

    const turmaSelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(turmaSelect).toBeDisabled();
    const submitButton = screen.getByRole('button', { name: 'Salvar registro mensal' });
    expect(submitButton).toBeDisabled();
  });

  it('botão "Cadastrar primeira turma" chama onCreateFirstClassroom', () => {
    const onCreateFirstClassroom = vi.fn();
    render(<MonthlyEnrollmentForm {...baseProps({ turmasDaEscola: [], onCreateFirstClassroom })} />);

    fireEvent.click(screen.getByRole('button', { name: /cadastrar primeira turma/i }));
    expect(onCreateFirstClassroom).toHaveBeenCalledTimes(1);
  });

  it('com turma cadastrada: campos ficam habilitados e a turma aparece nas opções', () => {
    render(<MonthlyEnrollmentForm {...baseProps({ turmasDaEscola: [TURMA_A] })} />);

    expect(screen.queryByText('Cadastre pelo menos uma turma para liberar o registro mensal.')).not.toBeInTheDocument();
    const turmaSelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(turmaSelect).not.toBeDisabled();
    expect(screen.getByRole('option', { name: '3º Ano A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar registro mensal' })).not.toBeDisabled();
  });

  it('sem permissão: mostra mensagem de acesso restrito, sem formulário', () => {
    render(<MonthlyEnrollmentForm {...baseProps({ canWrite: false })} />);
    expect(screen.getByText(/sem permissão para registrar matrícula mensal/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar registro mensal' })).not.toBeInTheDocument();
  });
});
