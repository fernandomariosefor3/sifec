// Fase 2B — Fluxo Escolar: módulo real, multiusuário e vinculado ao
// Firebase (aprovados/reprovados/abandono agregados por escola+ano
// letivo). Substitui a versão anterior, que era só demonstração: os
// percentuais bimestrais eram gerados por fórmulas fixas em
// DEFAULT_FLUXO_VALUES/getInitialFluxoLocal e, mesmo com Firebase
// conectado, caíam de volta nesses valores fictícios sempre que o
// documento de `schools` não tinha os campos aprovacao/evasao/frequencia —
// ou seja, dado demonstrativo podia aparecer como se fosse real depois do
// login. Aqui o modo demonstração (sem usuário autenticado) usa só
// DEMO_SCHOOL_FLOW_RESULTS, claramente identificado no cabeçalho, e nunca é
// misturado com dado real do Firestore.
import React, { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import {
  getSuperintendents,
  getActiveSuperintendentId,
  getAdminSchoolScope,
  getSchoolsForCurrentScope,
  getSchoolScopeLabel,
  hasSchoolWriteAccess,
} from '../lib/superintendentService';
import { useSchoolFlowResults } from '../hooks/useSchoolFlowResults';
import { consolidateSchoolFlowResults } from '../lib/schoolFlowCalculations';
import SchoolFlowSummaryCards from './SchoolFlowSummaryCards';
import SchoolFlowTable from './SchoolFlowTable';
import SchoolFlowResultModal from './SchoolFlowResultModal';

// O ano letivo em andamento é 2026 em todo o resto do app (ver
// SchoolEnrollmentPanel.tsx) — fluxo (aprovação/reprovação/abandono) só
// existe para um ano já CONCLUÍDO, então o padrão aqui é o ano anterior.
const ANO_LETIVO_ATUAL = 2026;
const ULTIMO_ANO_CONCLUIDO = ANO_LETIVO_ATUAL - 1;
const ANOS_DISPONIVEIS = [ULTIMO_ANO_CONCLUIDO, ANO_LETIVO_ATUAL];

const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

export default function FluxoView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  const [anoLetivo, setAnoLetivo] = useState(ULTIMO_ANO_CONCLUIDO);
  const [search, setSearch] = useState('');
  const [modalSchool, setModalSchool] = useState<SchoolLike | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => setIsFirebaseMode(!!user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
      setAdminScope(getAdminSchoolScope());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleChange);
    window.addEventListener('sefor3_admin_scope_change', handleChange);
    handleChange();
    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handleChange);
      window.removeEventListener('sefor3_admin_scope_change', handleChange);
    };
  }, []);

  const superintendents = getSuperintendents();
  const activeSuper = superintendents.find(s => s.id === activeSuperId) || (superintendents.length > 0 ? superintendents[0] : null);

  // Seção 8 do plano: administrador raiz/cadastrado vê a carteira das sete
  // escolas por padrão (ou visão global, se alternado no seletor do menu),
  // superintendente comum vê e registra só suas próprias escolas — mesmo
  // filtro central usado por EscolasView/App.tsx, nunca uma lista própria
  // recalculada aqui.
  const visibleSchools = useMemo(
    () => getSchoolsForCurrentScope({
      superintendent: activeSuper,
      allSchools: SEED_SCHOOLS,
      isAuthenticated: isFirebaseMode,
      adminScope,
    }),
    [activeSuper, isFirebaseMode, adminScope]
  );
  const filteredSchools = visibleSchools.filter(s => s.nome.toLowerCase().includes(search.toLowerCase()));

  const { results, loading, loadError, refresh } = useSchoolFlowResults(filteredSchools, anoLetivo, isFirebaseMode);

  const consolidated = consolidateSchoolFlowResults(Object.values(results));

  const scopeLabel = getSchoolScopeLabel({
    superintendent: activeSuper,
    allSchoolNames: ALL_SCHOOL_NAMES,
    isAuthenticated: isFirebaseMode,
    adminScope,
  });

  return (
    <div className="space-y-6">
      {/* A. Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - GESTÃO ESCOLAR</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Fluxo Escolar</h2>
          <p className="text-xs text-slate-500 font-normal">
            Aprovação, reprovação e abandono por escola e ano letivo — dados agregados, sem identificação de estudantes.
          </p>
          {!isFirebaseMode && (
            <span className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-md uppercase tracking-wide">
              Modo demonstração — faça login para ver e registrar dados reais
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
            {scopeLabel}
          </span>
          <select
            value={anoLetivo}
            onChange={e => setAnoLetivo(Number(e.target.value))}
            aria-label="Ano letivo"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl"
          >
            {ANOS_DISPONIVEIS.map(ano => (
              <option key={ano} value={ano}>{ano}</option>
            ))}
          </select>
        </div>
      </div>

      {/* B. Indicadores consolidados */}
      <SchoolFlowSummaryCards consolidated={consolidated} loading={loading} />

      {/* Busca */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar unidade escolar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-xl"
          />
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        </div>
        <div className="text-xs text-slate-400 font-mono font-bold uppercase tracking-wider">
          {filteredSchools.length} Escolas
        </div>
      </div>

      {loadError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertTriangle size={14} /> {loadError}</span>
          <button
            type="button"
            onClick={refresh}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* C/D. Tabela por escola + ação "Preencher fluxo" */}
      <SchoolFlowTable
        schools={filteredSchools}
        results={results}
        loading={loading}
        onPreencherFluxo={setModalSchool}
      />

      {modalSchool && (
        <SchoolFlowResultModal
          school={modalSchool}
          anoLetivo={anoLetivo}
          existing={results[modalSchool.id] ?? null}
          canWrite={hasSchoolWriteAccess(modalSchool.nome)}
          isFirebaseMode={isFirebaseMode}
          onClose={() => setModalSchool(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
