// @vitest-environment jsdom
// Hotfix estabilização — login Google visível (ver src/components/
// AuthSessionBlock.tsx e a lógica de estados em App.tsx). Componente
// puramente apresentacional, sem Firebase — testável sem nenhum mock de
// serviço.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AuthSessionBlock from '../src/components/AuthSessionBlock';

afterEach(() => cleanup());

function baseProps(overrides: Partial<Parameters<typeof AuthSessionBlock>[0]> = {}) {
  return {
    currentUser: null,
    authLoading: false,
    authSyncing: false,
    authError: null,
    onLogin: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
}

describe('AuthSessionBlock', () => {
  it('mostra o botão "Entrar com Google" quando deslogado', () => {
    render(<AuthSessionBlock {...baseProps()} />);
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });

  it('clique no botão de login chama onLogin', () => {
    const onLogin = vi.fn();
    render(<AuthSessionBlock {...baseProps({ onLogin })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });

  it('durante authLoading, mostra "Entrando com Google..." e não há botão clicável de login (impede segunda tentativa)', () => {
    render(<AuthSessionBlock {...baseProps({ authLoading: true })} />);
    expect(screen.getByText('Entrando com Google...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).not.toBeInTheDocument();
  });

  it('durante authSyncing (usuário já logado, sincronizando), mostra "Validando seu acesso ao SIFEC..."', () => {
    render(
      <AuthSessionBlock
        {...baseProps({
          currentUser: { email: 'super.a@example.com', displayName: 'Super A' },
          authSyncing: true,
        })}
      />
    );
    expect(screen.getByText('Validando seu acesso ao SIFEC...')).toBeInTheDocument();
  });

  it('usuário logado e sincronizado: mostra nome/e-mail e botão Sair', () => {
    const onLogout = vi.fn();
    render(
      <AuthSessionBlock
        {...baseProps({
          currentUser: { email: 'super.a@example.com', displayName: 'Super A' },
          onLogout,
        })}
      />
    );
    expect(screen.getByText('Super A')).toBeInTheDocument();
    expect(screen.getByText('super.a@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sair'));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('erro auth/unauthorized-domain aparece visível com o código técnico e botão "Tentar novamente"', () => {
    render(
      <AuthSessionBlock
        {...baseProps({
          authError: { code: 'auth/unauthorized-domain', message: 'Este endereço ainda não está autorizado no Firebase.' },
        })}
      />
    );
    expect(screen.getByText('Este endereço ainda não está autorizado no Firebase.')).toBeInTheDocument();
    expect(screen.getByText('auth/unauthorized-domain')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('erro auth/popup-blocked aparece visível', () => {
    render(
      <AuthSessionBlock
        {...baseProps({
          authError: { code: 'auth/popup-blocked', message: 'O navegador bloqueou a janela de login. Permita pop-ups para este site.' },
        })}
      />
    );
    expect(screen.getByText('O navegador bloqueou a janela de login. Permita pop-ups para este site.')).toBeInTheDocument();
  });

  it('erro auth/popup-closed-by-user aparece visível', () => {
    render(
      <AuthSessionBlock
        {...baseProps({
          authError: { code: 'auth/popup-closed-by-user', message: 'A janela de login foi fechada antes da conclusão.' },
        })}
      />
    );
    expect(screen.getByText('A janela de login foi fechada antes da conclusão.')).toBeInTheDocument();
  });

  it('erro auth/network-request-failed aparece visível', () => {
    render(
      <AuthSessionBlock
        {...baseProps({
          authError: { code: 'auth/network-request-failed', message: 'Não foi possível conectar ao serviço de autenticação.' },
        })}
      />
    );
    expect(screen.getByText('Não foi possível conectar ao serviço de autenticação.')).toBeInTheDocument();
  });

  it('erro desconhecido cai na mensagem genérica e ainda mostra "Tentar novamente"', () => {
    render(
      <AuthSessionBlock
        {...baseProps({
          authError: { code: 'auth/algo-nunca-visto', message: 'Não foi possível concluir o acesso com Google.' },
        })}
      />
    );
    expect(screen.getByText('Não foi possível concluir o acesso com Google.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('clique em "Tentar novamente" chama onLogin de novo', () => {
    const onLogin = vi.fn();
    render(
      <AuthSessionBlock
        {...baseProps({
          onLogin,
          authError: { code: 'auth/network-request-failed', message: 'Não foi possível conectar ao serviço de autenticação.' },
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onLogin).toHaveBeenCalledTimes(1);
  });
});
