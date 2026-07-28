// Hotfix estabilização — extraído de App.tsx para ficar testável isolado
// (sem montar o app inteiro) e para manter App.tsx sob o limite de linhas do
// projeto. Puramente apresentacional: toda a lógica de login/erro/sync
// continua em App.tsx, aqui só chegam props já prontas.
interface AuthUser {
  photoURL?: string | null;
  displayName?: string | null;
  email?: string | null;
}

// type distingue a origem do erro (hotfix de estabilização, seção 2): 'login'
// veio do popup do Google (loginWithGoogle), 'sync' veio da sincronização do
// cadastro do superintendente já logado (syncSuperintendentsFromFirestore).
// "Tentar novamente" precisa repetir só a etapa que falhou.
interface AuthErrorInfo {
  type: 'login' | 'sync';
  code?: string;
  message: string;
}

interface AuthSessionBlockProps {
  currentUser: AuthUser | null;
  authLoading: boolean;
  authSyncing: boolean;
  authError: AuthErrorInfo | null;
  onLogin: () => void;
  onLogout: () => void;
  onRetrySync: () => void;
}

export default function AuthSessionBlock({
  currentUser, authLoading, authSyncing, authError, onLogin, onLogout, onRetrySync,
}: AuthSessionBlockProps) {
  const isSyncError = authError?.type === 'sync';
  const handleRetry = isSyncError ? onRetrySync : onLogin;
  const retryDisabled = isSyncError ? authSyncing : authLoading;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl flex items-center min-h-[48px]">
        {authLoading ? (
          <span className="flex items-center gap-2 px-3 py-1 text-xs font-bold text-slate-500">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Entrando com Google...
          </span>
        ) : currentUser && authSyncing ? (
          <span className="flex items-center gap-2 px-3 py-1 text-xs font-bold text-slate-500">
            <span className="w-2 h-2 rounded-full bg-brand-turquoise animate-pulse" />
            Validando seu acesso ao SIFEC...
          </span>
        ) : !currentUser ? (
          <button
            onClick={onLogin}
            disabled={authLoading}
            aria-label="Entrar com Google"
            className="flex items-center gap-2 px-3 py-1 bg-white border border-slate-250 hover:border-brand-turquoise hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            Entrar com Google
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-7 h-7 rounded-full border border-brand-green/30"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-green/10 text-brand-green font-bold text-xs flex items-center justify-center border border-brand-green/20">
                {currentUser.displayName ? currentUser.displayName.charAt(0) : 'U'}
              </div>
            )}
            <div className="text-left">
              <span className="font-extrabold text-[11px] text-slate-900 block truncate max-w-[130px]" title={currentUser.displayName ?? undefined}>
                {currentUser.displayName || 'Superintendente'}
              </span>
              <span className="text-[9px] text-slate-500 font-mono block truncate max-w-[130px]" title={currentUser.email ?? undefined}>
                {currentUser.email}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="text-[10px] text-rose-500 hover:text-rose-700 font-bold ml-1.5 underline transition-colors"
            >
              Sair
            </button>
          </div>
        )}
      </div>

      {/* Erro de autenticação visível (seção 3 do hotfix de estabilização) —
          nunca só console.error. Código técnico em texto secundário para
          diagnóstico, sem token/credencial. */}
      {authError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-[11px] text-rose-700 max-w-xs flex flex-col gap-1 items-start">
          <span className="font-bold">{authError.message}</span>
          {authError.code && (
            <span className="text-[9px] text-rose-400 font-mono">{authError.code}</span>
          )}
          <button
            type="button"
            onClick={handleRetry}
            disabled={retryDisabled}
            className="mt-0.5 px-2 py-1 bg-rose-100 hover:bg-rose-200 rounded-lg text-[10px] font-bold text-rose-700 transition disabled:opacity-50"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
