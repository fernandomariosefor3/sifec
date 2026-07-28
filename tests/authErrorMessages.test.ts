// Hotfix estabilização — mensagens visíveis para erros do login Google (ver
// src/lib/authErrorMessages.ts). Puramente lógico, sem Firebase/DOM.
import { describe, expect, it } from 'vitest';
import {
  buildSafeAuthDiagnostic,
  extractAuthErrorCode,
  mapAuthErrorCodeToMessage,
} from '../src/lib/authErrorMessages';

describe('mapAuthErrorCodeToMessage', () => {
  it('auth/unauthorized-domain', () => {
    expect(mapAuthErrorCodeToMessage('auth/unauthorized-domain')).toBe(
      'Este endereço ainda não está autorizado no Firebase.'
    );
  });

  it('auth/popup-blocked', () => {
    expect(mapAuthErrorCodeToMessage('auth/popup-blocked')).toBe(
      'O navegador bloqueou a janela de login. Permita pop-ups para este site.'
    );
  });

  it('auth/popup-closed-by-user', () => {
    expect(mapAuthErrorCodeToMessage('auth/popup-closed-by-user')).toBe(
      'A janela de login foi fechada antes da conclusão.'
    );
  });

  it('auth/network-request-failed', () => {
    expect(mapAuthErrorCodeToMessage('auth/network-request-failed')).toBe(
      'Não foi possível conectar ao serviço de autenticação.'
    );
  });

  it('auth/cancelled-popup-request', () => {
    expect(mapAuthErrorCodeToMessage('auth/cancelled-popup-request')).toBe(
      'Já existe uma tentativa de login em andamento.'
    );
  });

  it('código desconhecido cai na mensagem genérica', () => {
    expect(mapAuthErrorCodeToMessage('auth/algo-nunca-visto')).toBe(
      'Não foi possível concluir o acesso com Google.'
    );
  });

  it('código ausente cai na mensagem genérica', () => {
    expect(mapAuthErrorCodeToMessage(undefined)).toBe('Não foi possível concluir o acesso com Google.');
  });
});

describe('extractAuthErrorCode', () => {
  it('extrai o code de um erro Firebase-like', () => {
    expect(extractAuthErrorCode({ code: 'auth/popup-blocked' })).toBe('auth/popup-blocked');
  });

  it('retorna undefined para erro sem code', () => {
    expect(extractAuthErrorCode(new Error('erro genérico'))).toBeUndefined();
  });

  it('retorna undefined para valores não-objeto', () => {
    expect(extractAuthErrorCode('string qualquer')).toBeUndefined();
    expect(extractAuthErrorCode(null)).toBeUndefined();
  });
});

describe('buildSafeAuthDiagnostic', () => {
  it('inclui apenas code/hostname/expectedProjectId/hasAuthenticatedUser', () => {
    const diagnostic = buildSafeAuthDiagnostic({
      error: { code: 'auth/network-request-failed' },
      hostname: 'sifec-sand.vercel.app',
      expectedProjectId: 'sifec-sefor3',
      hasAuthenticatedUser: false,
    });
    expect(diagnostic).toEqual({
      code: 'auth/network-request-failed',
      hostname: 'sifec-sand.vercel.app',
      expectedProjectId: 'sifec-sefor3',
      hasAuthenticatedUser: false,
    });
  });

  it('nunca inclui token/credencial mesmo se presentes no erro original', () => {
    const dangerousError = {
      code: 'auth/network-request-failed',
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
      credential: { idToken: 'secret-id-token' },
    };
    const diagnostic = buildSafeAuthDiagnostic({
      error: dangerousError,
      hostname: 'localhost',
      expectedProjectId: 'sifec-sefor3',
      hasAuthenticatedUser: true,
    });
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain('secret-access-token');
    expect(serialized).not.toContain('secret-refresh-token');
    expect(serialized).not.toContain('secret-id-token');
    expect(Object.keys(diagnostic).sort()).toEqual(
      ['code', 'expectedProjectId', 'hasAuthenticatedUser', 'hostname'].sort()
    );
  });
});
