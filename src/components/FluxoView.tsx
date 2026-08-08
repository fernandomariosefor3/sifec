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
import { Search } from 'lucide-react';
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
import PageHeader from './ui/PageHeader';
import ContextBar from './ui/ContextBar';
import Badge from './ui/Badge';
import StateMessage from './ui/StateMessage';
import SurfaceCard from './ui/SurfaceCard';

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
    <div className="space-y-5">
      <PageHeader
        eyebrow="SEFOR 3 — Gestão escolar"
        title="Fluxo Escolar"
        description="Aprovação, reprovação e abandono por escola e ano letivo — dados agregados, sem identificação de estudantes."
        context={
          <ContextBar>
            <span className="text-caption text-slate-500 font-bold uppercase">{scopeLabel}</span>
            <label className="flex items-center gap-1.5 text-caption font-semibold text-slate-500">
              Ano letivo
              <select
                value={anoLetivo}
                onChange={e => setAnoLetivo(Number(e.target.value))}
                aria-label="Ano letivo"
                className="py-1 px-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-lg"
              >
                {ANOS_DISPONIVEIS.map(ano => (
                  <option key={ano} value={ano}>{ano}</option>
                ))}
              </select>
            </label>
            {!isFirebaseMode && (
              <Badge tone="attention">Modo demonstração — faça login para ver e registrar dados reais</Badge>
            )}
          </ContextBar>
        }
      />

      {/* B. Indicadores consolidados */}
      <SchoolFlowSummaryCards consolidated={consolidated} loading={loading} />

      {/* Busca */}
      <SurfaceCard className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar unidade escolar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-lg"
          />
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        </div>
        <div className="text-xs text-slate-500 font-bold">
          {filteredSchools.length} Escolas
        </div>
      </SurfaceCard>

      {loadError && (
        <StateMessage
          kind="error"
          title={loadError}
          compact
          action={
            <button
              type="button"
              onClick={refresh}
              className="px-3 py-1.5 bg-white border border-status-critical-border hover:bg-status-critical-bg rounded-lg text-[11px] font-bold text-status-critical transition"
            >
              Tentar novamente
            </button>
          }
        />
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
