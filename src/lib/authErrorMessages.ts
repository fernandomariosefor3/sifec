// Hotfix estabilização — o login Google falhava silenciosamente (só
// console.error). Estas funções puras traduzem códigos de erro do Firebase
// Auth em mensagens visíveis ao usuário e montam um diagnóstico seguro para
// log, sem nunca incluir token/credencial/accessToken/refreshToken.

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/unauthorized-domain': 'Este endereço ainda não está autorizado no Firebase.',
  'auth/popup-blocked': 'O navegador bloqueou a janela de login. Permita pop-ups para este site.',
  'auth/popup-closed-by-user': 'A janela de login foi fechada antes da conclusão.',
  'auth/network-request-failed': 'Não foi possível conectar ao serviço de autenticação.',
  'auth/cancelled-popup-request': 'Já existe uma tentativa de login em andamento.',
};

const DEFAULT_AUTH_ERROR_MESSAGE = 'Não foi possível concluir o acesso com Google.';

export function mapAuthErrorCodeToMessage(code: string | undefined | null): string {
  if (!code) return DEFAULT_AUTH_ERROR_MESSAGE;
  return AUTH_ERROR_MESSAGES[code] ?? DEFAULT_AUTH_ERROR_MESSAGE;
}

export function extractAuthErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return undefined;
}

export interface SafeAuthDiagnostic {
  code: string | undefined;
  hostname: string;
  expectedProjectId: string;
  hasAuthenticatedUser: boolean;
}

// Diagnóstico seguro para log: apenas error.code, hostname atual, projectId
// esperado e presença/ausência de usuário autenticado — nunca token,
// credencial, accessToken, refreshToken ou dados pessoais além do e-mail já
// necessário à autorização (que não entra aqui de propósito).
export function buildSafeAuthDiagnostic(params: {
  error: unknown;
  hostname: string;
  expectedProjectId: string;
  hasAuthenticatedUser: boolean;
}): SafeAuthDiagnostic {
  return {
    code: extractAuthErrorCode(params.error),
    hostname: params.hostname,
    expectedProjectId: params.expectedProjectId,
    hasAuthenticatedUser: params.hasAuthenticatedUser,
  };
}
