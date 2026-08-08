import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap,
  TrendingUp,
  Award,
  AlertTriangle,
  Users,
  Presentation,
  FileSpreadsheet,
  Settings,
  LayoutDashboard,
  Wrench,
  ShieldCheck,
  Radar,
  Menu,
  X
} from 'lucide-react';
import { auth, loginWithGoogle, logout, EXPECTED_FIREBASE_PROJECT_ID } from './lib/firebase';
import { mapAuthErrorCodeToMessage, extractAuthErrorCode, buildSafeAuthDiagnostic } from './lib/authErrorMessages';
import { CANONICAL_SIFEC_URL, isGithubPagesHostname } from './lib/canonicalHost';
import ErrorBoundary from './components/ErrorBoundary';
import CanonicalHostNotice from './components/CanonicalHostNotice';
import AuthSessionBlock from './components/AuthSessionBlock';
// Subcomponents
import EscolasView from './components/EscolasView';
import FluxoView from './components/FluxoView';
import NotasView from './components/NotasView';
import CdgView from './components/CdgView';
import SalaDeSituacaoView from './components/SalaDeSituacaoView';
import FarolEstudanteView from './components/FarolEstudanteView';
import RecomposicaoView from './components/RecomposicaoView';
import SuperintendentesView from './components/SuperintendentesView';
import ParecerBimestralView from './components/ParecerBimestralView';
import DevPanel from './components/DevPanel';

import {
  getSuperintendents,
  getActiveSuperintendentId,
  setActiveSuperintendentId,
  syncSuperintendentsFromFirestore,
  ADMIN_EMAIL,
  getWatchedSchoolCount,
  getSchoolsForCurrentScope,
  getSchoolScopeLabel,
  getAdminSchoolScope,
  setAdminSchoolScope,
  isScopedAdmin,
  AdminSchoolScope
} from './lib/superintendentService';
import { SEED_SCHOOLS } from './lib/firebaseService';

// SEED_SCHOOLS mirrors the real `schools` collection's full universe of
// names (it's also what seeds that collection on first run) — used here as
// the "allSchools" reference so admins with escolas: [] (acesso global)
// count against the true total instead of their own empty list.
const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);

type TabType = 'escolas' | 'fluxo' | 'notas' | 'situacao' | 'cdg' | 'farol' | 'recomposicao' | 'parecer' | 'superintendentes';

// Painel técnico (DevPanel) só existe em build de desenvolvimento.
// import.meta.env.DEV é substituído por uma constante em tempo de build pelo
// Vite (false em produção), então o bundler elimina esse código morto — o
// DevPanel não é só escondido, ele não vai para o bundle de produção.
const isDevBuild = import.meta.env.DEV;

// GitHub Pages ainda publica (ver .github/workflows/deploy.yml) mas não deve
// mais rodar o app duplicado — só mostra um aviso apontando para o endereço
// oficial (ver seção 7 do hotfix de estabilização). Lida fora do componente
// porque o hostname não muda durante a sessão.
const shouldShowCanonicalHostNotice = isGithubPagesHostname(window.location.hostname);

export default function App() {
  const [activeTab, setActiveTab] = React.useState<TabType>('escolas');
  const [isDevOpen, setIsDevOpen] = useState(false);
  // Sidebar responsiva: off-canvas em telas < lg, sempre visível em desktop.
  // Quando aberta no mobile, o scroll do body é bloqueado para evitar que o
  // conteúdo role por trás do overlay.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  React.useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isSidebarOpen]);

  const [activeSuperId, setActiveSuperId] = useState('all');
  const [superintendents, setSuperintendents] = useState<any[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [adminScope, setAdminScopeState] = useState<AdminSchoolScope>(getAdminSchoolScope());

  // Estados explícitos de autenticação (hotfix estabilização, seção 3) — o
  // login Google falhava/ficava inconsistente e os erros só apareciam no
  // console. authLoading cobre o popup do Google; authSyncing cobre a
  // sincronização do cadastro do superintendente logo depois; authReady só
  // fica true depois que essa sincronização termina (sucesso ou falha) —
  // nunca antes, para não mostrar "não cadastrado" cedo demais para um
  // usuário legítimo cujo registro ainda não chegou do Firestore.
  const [authLoading, setAuthLoading] = useState(false);
  const [authSyncing, setAuthSyncing] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<{ type: 'login' | 'sync'; code?: string; message: string } | null>(null);

  const handleLogin = React.useCallback(async () => {
    // Seção 4: nunca abrir uma segunda janela enquanto a primeira tentativa
    // ainda está em andamento.
    if (authLoading) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      // onAuthStateChanged (abaixo) cuida da sincronização a partir daqui.
    } catch (err) {
      const code = extractAuthErrorCode(err);
      console.error(
        'Falha no login com Google',
        buildSafeAuthDiagnostic({
          error: err,
          hostname: window.location.hostname,
          expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
          hasAuthenticatedUser: !!auth.currentUser,
        })
      );
      setAuthError({ type: 'login', code, message: mapAuthErrorCodeToMessage(code) });
    } finally {
      setAuthLoading(false);
    }
  }, [authLoading]);

  // Sincronização do cadastro do superintendente logado — extraída para ser
  // reutilizável tanto pelo listener de login (abaixo) quanto pelo retry de
  // "Tentar novamente" quando o erro é de sincronização, não de login
  // (hotfix estabilização, seção 2). Usa um ref (não estado) para o guard de
  // "já em andamento" para que a função tenha identidade estável — colocá-la
  // nas deps do useEffect de auth.onAuthStateChanged sem isso ressubscreveria
  // o listener a cada mudança de authSyncing.
  const authSyncInFlightRef = React.useRef(false);
  const runSync = React.useCallback(async () => {
    if (authSyncInFlightRef.current) return;
    authSyncInFlightRef.current = true;
    setAuthSyncing(true);
    setAuthReady(false);
    try {
      await syncSuperintendentsFromFirestore();
      setSuperintendents(getSuperintendents());
      setActiveSuperId(getActiveSuperintendentId());
      setAuthError(null);
    } catch (err) {
      console.error(
        'Falha ao sincronizar cadastro do superintendente',
        buildSafeAuthDiagnostic({
          error: err,
          hostname: window.location.hostname,
          expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
          hasAuthenticatedUser: true,
        })
      );
      setAuthError({
        type: 'sync',
        code: extractAuthErrorCode(err),
        message: 'Não foi possível concluir a sincronização do seu acesso. Tente novamente.',
      });
    } finally {
      setAuthSyncing(false);
      setAuthReady(true);
      authSyncInFlightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      setAuthError(null);
      if (!user) {
        setAuthSyncing(false);
        setAuthReady(true);
        return;
      }
      await runSync();
    });
    return () => unsubAuth();
  }, [runSync]);

  React.useEffect(() => {
    // Initial load
    setSuperintendents(getSuperintendents());
    setActiveSuperId(getActiveSuperintendentId());
    setAdminScopeState(getAdminSchoolScope());

    const handleSuperChange = () => {
      setSuperintendents(getSuperintendents());
      setActiveSuperId(getActiveSuperintendentId());
    };
    const handleScopeChange = () => {
      setAdminScopeState(getAdminSchoolScope());
    };

    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    window.addEventListener('sefor3_superintendents_change', handleSuperChange);
    window.addEventListener('sefor3_admin_scope_change', handleScopeChange);

    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
      window.removeEventListener('sefor3_superintendents_change', handleSuperChange);
      window.removeEventListener('sefor3_admin_scope_change', handleScopeChange);
    };
  }, []);

  // Find logged-in superintendent matching Gmail email
  const loggedInSuper = currentUser?.email
    ? superintendents.find(s => s.email?.toLowerCase() === currentUser.email?.toLowerCase())
    : null;

  const isUserAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Set active superintendent to logged in user if match exists
  React.useEffect(() => {
    if (loggedInSuper && activeSuperId !== loggedInSuper.id) {
      setActiveSuperintendentId(loggedInSuper.id);
    }
  }, [loggedInSuper, activeSuperId]);

  // Selected superintendent's active workspace filter
  const activeIdToUse = activeSuperId;

  // Compute dynamic stats based on schools filtered by active superintendent
  // AND, for an authenticated admin, by their portfolio/global scope toggle
  // (hotfix: admin-portfolio-default-view). isAuthenticated gates the admin
  // global-access shortcut so the pre-login demo record (also role: 'admin')
  // keeps its own seeded list — see superintendentRules.ts.
  const activeSuperByFind = superintendents.find(s => s.id === activeIdToUse);
  const activeSuper = activeSuperByFind || (superintendents.length > 0 ? superintendents[0] : null);
  const schoolsToCompute = getSchoolsForCurrentScope({
    superintendent: activeSuper,
    allSchools: SEED_SCHOOLS,
    isAuthenticated: !!currentUser,
    adminScope,
  });

  const countSchools = schoolsToCompute.length;
  const countMatriculas = schoolsToCompute.reduce((sum, s) => sum + s.matriculas, 0);

  // Nova identidade visual — resumo compacto de uma linha só (nunca mais 4
  // cartões gigantes com gradiente): "não ocupar altura excessiva" (seção
  // 2.A) e "não exagerar em gradientes" (seção 1). avgIdeb foi removido do
  // cabeçalho por não fazer parte do contexto pedido ali (SEFOR 3/ano
  // letivo/usuário) — continua disponível em Gestão de Escolas.
  const headerFacts = [
    { icon: <GraduationCap size={13} />, label: `${countSchools} escola(s) monitorada(s)` },
    { icon: <Users size={13} />, label: `${countMatriculas.toLocaleString()} estudante(s)` },
  ];

  // Nova identidade visual — um único acento (turquoise) para o estado
  // ativo em TODA a sidebar (seção 2.B: "evitar uma cor diferente para cada
  // item"), em vez da cor própria por aba que o design anterior usava.
  function navItemClass(tab: TabType): string {
    return `w-full text-left px-3 py-2.5 rounded-lg text-[13px] font-semibold transition flex items-center gap-2.5 ${
      activeTab === tab
        ? 'bg-brand-turquoise text-white shadow-md border-l-[3px] border-brand-turquoise-dark pl-[9px] font-extrabold'
        : 'text-slate-600 border-l-[3px] border-transparent pl-[9px] hover:bg-brand-green-light hover:text-brand-green-dark'
    }`;
  }

  function handleNavigate(tab: TabType): void {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  }

  // Seção 7 do hotfix de estabilização: GitHub Pages continua publicado,
  // mas não roda mais o app — só aponta para o endereço oficial. Depois de
  // todos os hooks (regra dos hooks), antes do JSX principal.
  if (shouldShowCanonicalHostNotice) {
    return <CanonicalHostNotice />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-brand-turquoise selection:text-white flex flex-col justify-between">
      {/* 1. Header — compacto, sem altura excessiva (nova identidade visual, seção 2.A) */}
      <div>
        <div className="h-1 w-full flex">
          <div className="bg-brand-green flex-[2] h-full" />
          <div className="bg-brand-turquoise flex-[3] h-full" />
          <div className="bg-brand-orange flex-[1] h-full" />
          <div className="bg-brand-coral flex-[1] h-full" />
        </div>
        <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-4 sm:px-6 py-3">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Abrir menu de navegação"
                className="lg:hidden shrink-0 p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Menu size={18} />
              </button>
              <div className="w-10 h-10 bg-brand-turquoise text-white rounded-lg flex items-center justify-center font-black text-base shrink-0">
                S
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-extrabold tracking-tight text-slate-900 leading-none">SIFEC</h1>
                <p className="text-[11px] text-slate-500 leading-tight truncate mt-0.5">
                  Sistema Integrado de Fluxo e Estratégia de Acompanhamento Escolar
                </p>
              </div>
              <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-brand-green bg-status-ok-bg px-2 py-1 rounded-md border border-status-ok-border shrink-0">
                SEFOR 3
              </span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500 font-semibold border-r border-slate-200 pr-3 mr-1">
                {headerFacts.map(fact => (
                  <span key={fact.label} className="flex items-center gap-1.5">
                    <span className="text-brand-turquoise-dark">{fact.icon}</span>
                    {fact.label}
                  </span>
                ))}
              </div>
              <AuthSessionBlock
                currentUser={currentUser}
                authLoading={authLoading}
                authSyncing={authSyncing}
                authError={authError}
                onLogin={handleLogin}
                onRetrySync={runSync}
                onLogout={async () => {
                  try {
                    await logout();
                  } catch (err) {
                    console.error("Logout error", err);
                  }
                }}
              />
            </div>
          </div>
        </header>

        {/* 2. Corpo principal — navegação + conteúdo da aba ativa */}
        <section className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Backdrop do menu responsivo (só em telas < lg, só quando aberto) */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Sidebar — fixa em desktop (col-span-3), menu off-canvas em mobile.
              No mobile o drawer abre com backdrop e trava scroll do body.
              Largura máxima 260px no mobile para não cobrir toda a tela. */}
          <nav
            aria-label="Navegação principal"
            className={`fixed inset-y-0 left-0 z-50 w-[min(260px,85vw)] overflow-y-auto bg-gradient-to-b from-brand-green-light/80 via-white to-white border-r border-brand-green/20 p-3 flex flex-col gap-1
              transform transition-transform duration-200 shadow-xl lg:shadow-none
              lg:static lg:z-auto lg:col-span-3 lg:w-auto lg:translate-x-0 lg:border lg:rounded-2xl lg:self-start lg:max-h-[calc(100vh-6rem)]
              ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="flex items-center justify-between lg:hidden mb-1 px-1">
              <span className="text-label uppercase text-slate-400">Menu</span>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Fechar menu de navegação"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Espaço de Trabalho */}
            <div className="px-3 py-2.5 bg-brand-green-light/80 border border-brand-green/20 rounded-xl mb-2 text-xs">
              <label className="text-label uppercase text-slate-500 block mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green inline-block"></span>
                Espaço de Trabalho
              </label>

              {isUserAdmin ? (
                <select
                  value={activeSuperId}
                  onChange={(e) => setActiveSuperintendentId(e.target.value)}
                  className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-green focus:bg-white rounded-lg font-bold text-slate-800 text-[11px] cursor-pointer transition-colors"
                >
                  {superintendents.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nome.split(' - ')[0]} ({getSchoolScopeLabel({ superintendent: s, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: !!currentUser, adminScope })})
                    </option>
                  ))}
                </select>
              ) : loggedInSuper && loggedInSuper.ativo === true ? (
                <div className="w-full py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800 text-[11px]">
                  {loggedInSuper.nome.split(' - ')[0]} ({getSchoolScopeLabel({ superintendent: loggedInSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: !!currentUser, adminScope })})
                </div>
              ) : currentUser && authError?.type === 'sync' ? (
                // Seção 1/2 do hotfix de estabilização: uma falha técnica de
                // sincronização (permission-denied, unavailable, rede) nunca
                // pode virar "conta não cadastrada"/"conta inativa" — o erro
                // real já está visível no AuthSessionBlock, com o botão
                // "Tentar novamente" que repete só a sincronização.
                <div className="w-full py-1.5 px-2 text-[11px] text-amber-600 font-bold">
                  Não foi possível validar seu acesso — veja o erro acima.
                </div>
              ) : currentUser && authReady ? (
                // Seção 5/8.C: distingue "não cadastrado" de "cadastrado mas
                // inativo" só depois que a sincronização termina — nunca
                // antes, para não acusar um usuário legítimo cujo registro
                // ainda está a caminho do Firestore.
                <div className="w-full py-1.5 px-2 text-[11px] text-rose-500 font-bold">
                  {loggedInSuper
                    ? 'Sua conta está inativa no SIFEC — contate o administrador.'
                    : 'Sua conta não está cadastrada no SIFEC — contate o administrador.'}
                </div>
              ) : currentUser ? (
                <div className="w-full py-1.5 px-2 text-[11px] text-slate-400">
                  Validando seu acesso...
                </div>
              ) : (
                <div className="w-full py-1.5 px-2 text-[11px] text-slate-400">
                  Faça login para continuar
                </div>
              )}

              {/* Hotfix (admin-portfolio-default-view): explicit portfolio/global
                  toggle for an authenticated admin viewing their own workspace —
                  only appears when the active selection IS the admin, never for
                  a plain superintendent (who has no global option). Default is
                  always 'portfolio' (see getAdminSchoolScope), so login never
                  auto-opens on the full 56-school universe. */}
              {isUserAdmin && currentUser && activeSuper && isScopedAdmin(activeSuper, true) && (
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAdminSchoolScope('portfolio')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold border transition text-center ${
                      adminScope === 'portfolio'
                        ? 'bg-brand-green text-white border-brand-green-dark'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Minhas escolas — {getWatchedSchoolCount({ superintendent: activeSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: true })} acompanhadas
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminSchoolScope('global')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold border transition text-center ${
                      adminScope === 'global'
                        ? 'bg-brand-turquoise text-white border-brand-turquoise-dark'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    Acesso global — {ALL_SCHOOL_NAMES.length} escolas
                  </button>
                </div>
              )}

              {loggedInSuper && loggedInSuper.ativo === true && (
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 py-1 px-2 bg-brand-green/10 border border-brand-green/20 rounded-lg">
                    <ShieldCheck size={12} className="text-brand-green shrink-0 text-emerald-600" />
                    <span className="font-extrabold text-[#006034] text-[9px] leading-tight truncate" title={loggedInSuper.nome}>
                      {isScopedAdmin(loggedInSuper, !!currentUser) && adminScope === 'portfolio' ? 'Carteira de acompanhamento' : 'Gerência'}: {loggedInSuper.nome.split(' - ')[0]} ({getSchoolScopeLabel({ superintendent: loggedInSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: !!currentUser, adminScope })})
                    </span>
                  </div>
                  {/* Fase 1G: "acompanhadas" (carteira, escolas[]) é sempre
                      exibido em separado de "Acesso global" (role) — nunca
                      um no lugar do outro, mesmo para o admin raiz. */}
                  <div className="flex items-center gap-1.5 py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-bold text-slate-500 text-[9px] leading-tight">
                      {getWatchedSchoolCount({ superintendent: loggedInSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: !!currentUser })} escola(s) acompanhada(s)
                    </span>
                  </div>
                </div>
              )}
            </div>

            <span className="text-label uppercase text-slate-500 px-3 py-2 mb-0.5 flex items-center gap-1.5 bg-brand-turquoise-light rounded-lg font-extrabold text-brand-turquoise-dark">
              <span className="w-2 h-2 rounded-full bg-brand-turquoise inline-block"></span>
              Indicadores e Escola
            </span>

            <button onClick={() => handleNavigate('escolas')} className={navItemClass('escolas')}>
              <GraduationCap size={16} className="shrink-0" /> Gestão de Escolas
            </button>

            <button onClick={() => handleNavigate('fluxo')} className={navItemClass('fluxo')}>
              <TrendingUp size={16} className="shrink-0" /> Fluxo Escolar
            </button>

            <button onClick={() => handleNavigate('notas')} className={navItemClass('notas')}>
              <FileSpreadsheet size={16} className="shrink-0" /> Acompanhamento de Notas
            </button>

            <button onClick={() => handleNavigate('situacao')} className={navItemClass('situacao')}>
              <Radar size={16} className="shrink-0" /> Sala de Situação
            </button>

            <span className="text-label uppercase text-slate-500 px-3 py-2 mt-3 mb-0.5 flex items-center gap-1.5 bg-brand-green-light rounded-lg font-extrabold text-brand-green-dark">
              <span className="w-2 h-2 rounded-full bg-brand-green inline-block"></span>
              Gestão e Acompanhamento
            </span>

            <button onClick={() => handleNavigate('cdg')} className={navItemClass('cdg')}>
              <LayoutDashboard size={16} className="shrink-0" /> Ciclo de Gestão
            </button>

            <button onClick={() => handleNavigate('farol')} className={navItemClass('farol')}>
              <AlertTriangle size={16} className="shrink-0" />
              <span className="leading-tight">
                Alunos com Baixo Desempenho
                <span className="block text-[10px] font-medium opacity-70">Farol do Estudante</span>
              </span>
            </button>

            <button onClick={() => handleNavigate('recomposicao')} className={navItemClass('recomposicao')}>
              <Award size={16} className="shrink-0" /> Recomposição
            </button>

            <button onClick={() => handleNavigate('superintendentes')} className={navItemClass('superintendentes')}>
              <Users size={16} className="shrink-0" /> Superintendentes
            </button>

            <span className="text-label uppercase text-slate-500 px-3 py-2 mt-3 mb-0.5 flex items-center gap-1.5 bg-brand-coral-light rounded-lg font-extrabold text-brand-coral-dark">
              <span className="w-2 h-2 rounded-full bg-brand-coral inline-block"></span>
              Relatório
            </span>

            <button onClick={() => handleNavigate('parecer')} className={navItemClass('parecer')}>
              <Presentation size={16} className="shrink-0" /> Parecer Bimestral
            </button>
          </nav>

          {/* Área de conteúdo — topo com as 4 cores da marca, corpo neutro */}
          <div className="lg:col-span-9 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="h-[3px] w-full flex shrink-0">
              <div className="bg-brand-green flex-[2] h-full" />
              <div className="bg-brand-turquoise flex-[3] h-full" />
              <div className="bg-brand-orange flex-[1] h-full" />
              <div className="bg-brand-coral flex-[1] h-full" />
            </div>
            <div className="p-5 sm:p-6 min-h-[450px]">
            {activeTab === 'escolas' && <ErrorBoundary><EscolasView /></ErrorBoundary>}
            {activeTab === 'fluxo' && <ErrorBoundary><FluxoView /></ErrorBoundary>}
            {activeTab === 'notas' && <ErrorBoundary><NotasView /></ErrorBoundary>}
            {activeTab === 'situacao' && <ErrorBoundary><SalaDeSituacaoView /></ErrorBoundary>}
            {activeTab === 'cdg' && <ErrorBoundary><CdgView /></ErrorBoundary>}
            {activeTab === 'farol' && <ErrorBoundary><FarolEstudanteView /></ErrorBoundary>}
            {activeTab === 'recomposicao' && <ErrorBoundary><RecomposicaoView /></ErrorBoundary>}
            {activeTab === 'superintendentes' && <ErrorBoundary><SuperintendentesView /></ErrorBoundary>}
            {activeTab === 'parecer' && <ErrorBoundary><ParecerBimestralView /></ErrorBoundary>}
            </div>
          </div>
        </section>
      </div>

      {/* 4. Rodapé com barra colorida da marca */}
      <footer className="mt-12 max-w-[1400px] w-full mx-auto px-4 sm:px-6 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="w-full">
          <div className="h-[3px] w-full flex rounded-full mb-4">
            <div className="bg-brand-green flex-[2] h-full rounded-l-full" />
            <div className="bg-brand-turquoise flex-[3] h-full" />
            <div className="bg-brand-orange flex-[1] h-full" />
            <div className="bg-brand-coral flex-[1] h-full rounded-r-full" />
          </div>
          <div>
            <div className="text-xs font-black text-slate-800">Coordenadoria Regional SEFOR 3</div>
            <p className="text-[11px] text-slate-500 mt-1 leading-normal">
              Controle Gerencial da Seduc Ceará para Pactuação Contínua de Metas.
            </p>
          </div>
        </div>

        {/* Floating hidden technical button: dev-only, not shipped in production build */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {isDevBuild && (
            <button
              onClick={() => setIsDevOpen(true)}
              className="px-4 py-2 bg-slate-100 border border-slate-200 hover:border-slate-300 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <Settings size={13} /> Painel Técnico de Infraestrutura
            </button>
          )}
          <span className="text-[10px] text-slate-400 font-mono font-bold tracking-wider">SUPPORT CADASTRE: crede-03</span>
        </div>
      </footer>

      {/* Simulated DevPanel Modal Workspace — dev-only, not shipped in production build */}
      <AnimatePresence>
        {isDevBuild && isDevOpen && (
          <div className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex justify-end">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-5xl h-full bg-slate-900 border-l border-slate-850 flex flex-col shadow-2xl relative"
            >
              {/* Dev panel custom header */}
              <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex justify-between items-center shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Infraestrutura Corporativa</span>
                  </div>
                  <h2 className="text-sm font-black text-white uppercase tracking-tight mt-0.5">Console de Engenharia Sefor 3 (PC / GitHub / Firebase)</h2>
                </div>
                <button
                  onClick={() => setIsDevOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-800 text-slate-200 hover:bg-rose-950 hover:text-rose-200 rounded-xl text-xs font-mono font-bold border border-slate-750 transition"
                >
                  FECHAR PANEL [ESC]
                </button>
              </div>

              {/* Dev panel workspace component wrapper */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-900 text-slate-300">
                <div className="mb-6 p-4 bg-slate-950 border border-blue-900/40 rounded-2xl flex items-start gap-4">
                  <div className="p-2.5 bg-blue-950/40 rounded-xl text-blue-400 shrink-0 border border-blue-800/30">
                    <Wrench size={20} />
                  </div>
                  <div className="text-xs leading-relaxed max-w-3xl">
                    <span className="font-extrabold text-blue-100 block mb-1">Sandbox Técnico de Escalabilidade</span>
                    Este console gerencia as regras estruturais e o pipeline integrando o workspace do seu Computador (PC), o Repositório de Branches do GitHub, e as regras do console oficial do Firebase (<code className="text-emerald-450 bg-emerald-999/40 px-1 py-0.5 rounded border border-emerald-900/60 font-mono font-semibold">crede</code>). Ele contém cálculos exatos e o simulador do arquivo rules para audições preventivas de faturamento.
                  </div>
                </div>

                <DevPanel isOpen={isDevOpen} onClose={() => setIsDevOpen(false)} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
