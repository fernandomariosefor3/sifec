// @vitest-environment jsdom
// Correção de usabilidade — atalhos "Preencha nesta ordem" do painel de
// matrículas (ver src/components/PanelFillGuidance.tsx). Componente
// puramente apresentacional, sem dependência do Firebase — testável sem
// nenhum mock de serviço.
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PanelFillGuidance from '../src/components/PanelFillGuidance';

// Este projeto não usa `globals: true` no Vitest, então a limpeza automática
// do @testing-library/react (que depende de um `afterEach` global) não
// dispara sozinha — sem isto, o DOM de um teste vaza para o próximo.
afterEach(cleanup);

function renderGuidance(overrides: Partial<ComponentProps<typeof PanelFillGuidance>> = {}) {
  const onScrollToSchoolYearConfig = vi.fn();
  const onScrollToClassrooms = vi.fn();
  const onScrollToMonthlyEnrollment = vi.fn();
  render(
    <PanelFillGuidance
      onScrollToSchoolYearConfig={onScrollToSchoolYearConfig}
      onScrollToClassrooms={onScrollToClassrooms}
      onScrollToMonthlyEnrollment={onScrollToMonthlyEnrollment}
      schoolYearGuidance={null}
      classroomsGuidance={null}
      monthlyEnrollmentGuidance={null}
      {...overrides}
    />
  );
  return { onScrollToSchoolYearConfig, onScrollToClassrooms, onScrollToMonthlyEnrollment };
}

describe('PanelFillGuidance', () => {
  it('mostra os três atalhos numerados', () => {
    renderGuidance();
    expect(screen.getByRole('button', { name: '1. Configurar ano letivo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. Cadastrar turmas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3. Registrar mês' })).toBeInTheDocument();
  });

  it('atalho 1 aponta para a seção de configuração do ano letivo', () => {
    const { onScrollToSchoolYearConfig, onScrollToClassrooms, onScrollToMonthlyEnrollment } = renderGuidance();
    fireEvent.click(screen.getByRole('button', { name: '1. Configurar ano letivo' }));
    expect(onScrollToSchoolYearConfig).toHaveBeenCalledTimes(1);
    expect(onScrollToClassrooms).not.toHaveBeenCalled();
    expect(onScrollToMonthlyEnrollment).not.toHaveBeenCalled();
  });

  it('atalho 2 aponta para a seção de turmas', () => {
    const { onScrollToClassrooms } = renderGuidance();
    fireEvent.click(screen.getByRole('button', { name: '2. Cadastrar turmas' }));
    expect(onScrollToClassrooms).toHaveBeenCalledTimes(1);
  });

  it('atalho 3 aponta para a seção de registro mensal', () => {
    const { onScrollToMonthlyEnrollment } = renderGuidance();
    fireEvent.click(screen.getByRole('button', { name: '3. Registrar mês' }));
    expect(onScrollToMonthlyEnrollment).toHaveBeenCalledTimes(1);
  });

  it('não mostra a lista de orientações quando tudo já está configurado', () => {
    renderGuidance();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('mostra as mensagens de estado inicial aplicáveis', () => {
    renderGuidance({
      schoolYearGuidance: 'Esta escola ainda não possui configuração para 2026. Comece informando a matrícula inicial.',
      classroomsGuidance: 'Cadastre pelo menos uma turma para liberar o registro mensal.',
      monthlyEnrollmentGuidance: null,
    });
    expect(screen.getByText(/ainda não possui configuração para 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Cadastre pelo menos uma turma/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum mês foi registrado/)).not.toBeInTheDocument();
  });
});
