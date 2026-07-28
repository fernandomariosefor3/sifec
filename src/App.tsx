import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap,
  TrendingUp,
  Award,
  Calendar,
  AlertTriangle,
  Users,
  Presentation,
  FileDown,
  FileSpreadsheet,
  Settings,
  MapPin,
  CheckCircle,
  HelpCircle,
  LayoutDashboard,
  Sparkles,
  BookOpen,
  Wrench,
  ChevronRight,
  ShieldCheck
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
import { BuscaAtivaView, PpdtView, RecomposicaoView } from './components/ExtraViews';
import SuperintendentesView from './components/SuperintendentesView';
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

type TabType = 'escolas' | 'fluxo' | 'notas' | 'cdg' | 'busca' | 'recomposicao' | 'ppdt' | 'superintendentes';

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
  const [authError, setAuthError] = useState<{ code?: string; message: string } | null>(null);

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
      setAuthError({ code, message: mapAuthErrorCodeToMessage(code) });
    } finally {
      setAuthLoading(false);
    }
  }, [authLoading]);

  React.useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      setAuthError(null);
      if (!user) {
        setAuthSyncing(false);
        setAuthReady(true);
        return;
      }
      setAuthSyncing(true);
      setAuthReady(false);
      try {
        await syncSuperintendentsFromFirestore();
      } catch (err) {
        console.error(
          'Falha ao sincronizar cadastro do superintendente após login',
          buildSafeAuthDiagnostic({
            error: err,
            hostname: window.location.hostname,
            expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
            hasAuthenticatedUser: true,
          })
        );
        setAuthError({
          code: extractAuthErrorCode(err),
          message: 'Não foi possível concluir a sincronização do seu acesso. Tente novamente.',
        });
      } finally {
        setAuthSyncing(false);
        setAuthReady(true);
      }
    });
    return () => unsubAuth();
  }, []);

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
  const avgIdeb = countSchools > 0 
    ? (schoolsToCompute.reduce((sum, s) => sum + s.idebMedio, 0) / countSchools).toFixed(1)
    : "0.0";
  const avgMeta = countSchools > 0
    ? (schoolsToCompute.reduce((sum, s) => sum + s.metaIdeb, 0) / countSchools).toFixed(1)
    : "0.0";

  // Stats summaries (vibrant, deeply colored top panels)
  const statsOverview = [
    { 
      label: "Regional de Regulação", 
      value: "SEFOR 3 (Fortaleza)", 
      detail: activeSuper ? `${activeSuper.nome.split(' - ')[0]} Ativo` : "Superintendente Ativo", 
      icon: <MapPin size={20} />, 
      bgClass: "bg-gradient-to-br from-[#1ea2a7] to-[#127d81] text-white border-[#127d81]/40 shadow-sm shadow-[#1ea2a7]/10",
      iconContainerClass: "bg-white/20 text-white border border-white/20",
      labelClass: "text-white/80 font-black",
      valueClass: "text-white font-extrabold",
      detailClass: "text-white/90 font-medium"
    },
    { 
      label: "Escolas Monitoradas", 
      value: `${countSchools} Unidades`, 
      detail: "Ensino Médio e EEMTIs", 
      icon: <GraduationCap size={20} />, 
      bgClass: "bg-gradient-to-br from-[#008249] to-[#006034] text-white border-[#006034]/40 shadow-sm shadow-[#008249]/10",
      iconContainerClass: "bg-white/20 text-white border border-white/20",
      labelClass: "text-white/80 font-black",
      valueClass: "text-white font-extrabold",
      detailClass: "text-white/90 font-medium"
    },
    { 
      label: "Estudantes Ativos", 
      value: `${countMatriculas.toLocaleString()} Alunos`, 
      detail: "Censo Frequência Geral", 
      icon: <Users size={20} />, 
      bgClass: "bg-gradient-to-br from-[#ff9111] to-[#d47405] text-white border-[#d47405]/40 shadow-sm shadow-[#ff9111]/10",
      iconContainerClass: "bg-white/20 text-white border border-white/20",
      labelClass: "text-white/80 font-black",
      valueClass: "text-white font-extrabold",
      detailClass: "text-white/95 font-medium"
    },
    { 
      label: "Meta SPAECE 2026",
      value: avgIdeb, 
      detail: `Meta Pactuada: ${avgMeta}`, 
      icon: <Award size={20} />, 
      bgClass: "bg-gradient-to-br from-[#e04022] to-[#b82e14] text-white border-[#b82e14]/40 shadow-sm shadow-[#e04022]/10",
      iconContainerClass: "bg-white/20 text-white border border-white/20",
      labelClass: "text-white/80 font-black",
      valueClass: "text-white font-extrabold",
      detailClass: "text-white/90 font-medium"
    }
  ];

  // Helper for content-panel top tab color dynamic styling
  const getTabAccentClass = (tab: string) => {
    switch (tab) {
      case 'escolas': return 'border-t-brand-turquoise';
      case 'fluxo': return 'border-t-brand-coral';
      case 'notas': return 'border-t-brand-green';
      case 'cdg': return 'border-[#26b2b7]';
      case 'busca': return 'border-t-brand-orange';
      case 'recomposicao': return 'border-t-brand-coral';
      case 'ppdt': return 'border-t-brand-green';
      case 'superintendentes': return 'border-t-brand-turquoise';
      default: return 'border-t-brand-turquoise';
    }
  };

  // Seção 7 do hotfix de estabilização: GitHub Pages continua publicado,
  // mas não roda mais o app — só aponta para o endereço oficial. Depois de
  // todos os hooks (regra dos hooks), antes do JSX principal.
  if (shouldShowCanonicalHostNotice) {
    return <CanonicalHostNotice />;
  }

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans selection:bg-brand-turquoise selection:text-white flex flex-col justify-between">
      {/* 1. Header Area with Portal Brand & Layout styling */}
      <div>
        {/* Colorful governmental top stripe of Ceará */}
        <div className="h-2 w-full flex">
          <div className="bg-brand-turquoise flex-1 h-full" />
          <div className="bg-brand-orange flex-1 h-full" />
          <div className="bg-brand-coral flex-1 h-full" />
        </div>
        <header className="border-b border-slate-150 bg-white sticky top-0 z-50 px-6 py-4">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-brand-turquoise text-white rounded-xl flex items-center justify-center font-black text-xl shadow-md border-b-4 border-brand-turquoise-dark tracking-tight font-sans antialiased">
                3
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] tracking-widest font-black uppercase text-brand-green bg-emerald-50 px-2 py-0.5 rounded border border-brand-green/20">SEFOR 3</span>
                  <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">Governo do Ceará</span>
                </div>
                <h1 className="text-lg font-black tracking-tight text-slate-900 mt-0.5">Sifec (Sistema de Frequência e Indicadores Escolares do Ceará) - Regional SEFOR 3</h1>
              </div>
            </div>
             {/* Quick school status indicators & User Profile section */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 bg-brand-green/5 border border-brand-green/20 px-4 py-2 rounded-xl">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-green inline-block animate-pulse" />
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">Banco de Dados Sincronizado</span>
                  <span className="text-[10px] text-brand-green font-mono font-medium">Firebase ID: crede (online)</span>
                </div>
              </div>

              {/* Real Google Auth / Session Info Block */}
              <AuthSessionBlock
                currentUser={currentUser}
                authLoading={authLoading}
                authSyncing={authSyncing}
                authError={authError}
                onLogin={handleLogin}
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

        {/* 2. Top regional markers summarizing active school database */}
        <section className="bg-slate-50/70 border-b border-slate-205 py-6 px-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statsOverview.map((item, idx) => (
              <div key={idx} className={`border p-5 rounded-2xl flex items-center gap-4 shadow-sm transition-all hover:translate-y-[-2px] hover:shadow-md ${item.bgClass}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.iconContainerClass}`}>
                  {item.icon}
                </div>
                <div>
                  <span className={`text-[9px] uppercase tracking-widest font-black block ${item.labelClass}`}>{item.label}</span>
                  <div className={`text-lg font-black leading-tight mt-0.5 ${item.valueClass}`}>{item.value}</div>
                  <span className={`text-[10px] block font-mono font-medium opacity-90 mt-0.5 ${item.detailClass}`}>{item.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

         {/* 3. Main Dashboard Body (Portal Tabs and Render Views) */}
        <section className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Dashboard Left Sidebar Tabs navigation */}
          <nav className="lg:col-span-3 flex flex-col gap-1.5 self-start bg-gradient-to-b from-slate-50 to-brand-turquoise/[0.04] p-3 rounded-2xl border-l-[5px] border-l-brand-turquoise border-y border-r border-slate-200 shadow-sm shadow-brand-turquoise/5">
            {/* Active Superintendent Dropdown Workspace Selector */}
            <div className="px-3 py-2.5 bg-gradient-to-br from-white to-brand-green/[0.02] border border-brand-green/20 rounded-xl mb-3 text-xs shadow-sm focus-within:border-brand-green transition-all">
              <label className="text-[10px] font-black uppercase text-brand-green tracking-widest block mb-1 font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green inline-block animate-pulse"></span>
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

            <span className="text-[10px] font-black uppercase text-brand-turquoise-dark tracking-widest px-3 py-1 block mb-1">Indicadores e Escola</span>
            
            <button
              onClick={() => setActiveTab('escolas')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'escolas' 
                  ? 'bg-brand-turquoise text-white shadow-sm border border-brand-turquoise-dark/20' 
                  : 'text-slate-650 hover:bg-brand-turquoise/10 hover:text-brand-turquoise-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <GraduationCap size={15} /> Gestão de Escolas
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('fluxo')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'fluxo' 
                  ? 'bg-brand-coral text-white shadow-md border border-brand-coral-dark/20' 
                  : 'text-slate-650 hover:bg-brand-coral/10 hover:text-brand-coral-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <TrendingUp size={15} /> Fluxo Escolar
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('notas')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'notas' 
                  ? 'bg-brand-green text-white shadow-md border border-brand-green-dark/25' 
                  : 'text-slate-650 hover:bg-brand-green/10 hover:text-brand-green-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet size={15} /> Lançamento de Notas
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <span className="text-[10px] font-black uppercase text-brand-orange-dark tracking-widest px-3 py-1 block mt-3 mb-1">Gestão de Equipes Seduc</span>

            <button
              onClick={() => setActiveTab('cdg')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'cdg' 
                  ? 'bg-brand-turquoise text-white shadow-md border border-brand-turquoise-dark/20' 
                  : 'text-slate-650 hover:bg-brand-turquoise/10 hover:text-brand-turquoise-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <LayoutDashboard size={15} /> Ciclo de Gestão (CdG)
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('busca')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'busca' 
                  ? 'bg-brand-orange text-white shadow-md border border-brand-orange-dark/20' 
                  : 'text-slate-650 hover:bg-brand-orange/10 hover:text-brand-orange-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} /> Busca Ativa
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('recomposicao')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'recomposicao' 
                  ? 'bg-brand-coral text-white shadow-md border border-brand-coral-dark/20' 
                  : 'text-slate-650 hover:bg-brand-coral/10 hover:text-brand-coral-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <Award size={15} /> Recomposição
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('ppdt')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'ppdt' 
                  ? 'bg-brand-green text-white shadow-md border border-brand-green-dark/25' 
                  : 'text-slate-650 hover:bg-brand-green/10 hover:text-brand-green-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <Users size={15} /> Equipe PPDT
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>

            <button
              onClick={() => setActiveTab('superintendentes')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                activeTab === 'superintendentes' 
                  ? 'bg-brand-turquoise text-white shadow-md border border-brand-turquoise-dark/20' 
                  : 'text-slate-650 hover:bg-brand-turquoise/10 hover:text-brand-turquoise-dark'
              }`}
            >
              <span className="flex items-center gap-2">
                <Users size={15} /> Superintendentes
              </span>
              <ChevronRight size={12} className="opacity-60" />
            </button>
          </nav>

          {/* Right Area: Display Tab Contents with smooth state changes */}
          <div className={`lg:col-span-9 bg-white border border-slate-205 border-t-[6px] ${getTabAccentClass(activeTab)} rounded-3xl p-6 min-h-[450px] shadow-sm transition-all duration-300`}>
            {activeTab === 'escolas' && <ErrorBoundary><EscolasView /></ErrorBoundary>}
            {activeTab === 'fluxo' && <ErrorBoundary><FluxoView /></ErrorBoundary>}
            {activeTab === 'notas' && <ErrorBoundary><NotasView /></ErrorBoundary>}
            {activeTab === 'cdg' && <ErrorBoundary><CdgView /></ErrorBoundary>}
            {activeTab === 'busca' && <ErrorBoundary><BuscaAtivaView /></ErrorBoundary>}
            {activeTab === 'recomposicao' && <ErrorBoundary><RecomposicaoView /></ErrorBoundary>}
            {activeTab === 'ppdt' && <ErrorBoundary><PpdtView /></ErrorBoundary>}
            {activeTab === 'superintendentes' && <ErrorBoundary><SuperintendentesView /></ErrorBoundary>}
          </div>
        </section>
      </div>

      {/* 4. Elegant and discrete Footer holding the hidden Developer Panel Toggle */}
      <footer className="mt-20 border-t border-slate-200 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="text-xs font-black text-slate-800">Coordenadoria Regional SEFOR 3</div>
          <p className="text-[11px] text-slate-500 mt-1 leading-normal">
            Controle Gerencial da Seduc Ceará para Pactuação Contínua de Metas.
          </p>
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
