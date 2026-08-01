// Fase 2D — Sala de Situação: painel analítico consolidado de
// acompanhamento escolar, calculado a partir das coleções já existentes
// (nunca persiste indicador algum — ver schoolSituationService.ts). Módulo
// de leitura: nenhuma ação de escrita, atualização via botão "Atualizar".
// Respeita a mesma carteira de 7 escolas / visão global de 56 escolas já
// usada por FluxoView.tsx/EscolasView.tsx, via getSchoolsForCurrentScope.
import { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import {
  getSuperintendents,
  getActiveSuperintendentId,
  getAdminSchoolScope,
  setAdminSchoolScope,
  getSchoolsForCurrentScope,
  isScopedAdmin,
} from '../lib/superintendentService';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import type { DataQualityState, PendingItemType, SchoolScopeMode } from '../types/schoolSituation';
import { useSchoolSituation } from '../hooks/useSchoolSituation';
import { calculatePortfolioSituationSummary } from '../lib/schoolSituationCalculations';
import { buildAnoLetivoOptions } from '../lib/anoLetivoOptions';
import SituationFilters from './sala-situacao/SituationFilters';
import SituationSummaryCards from './sala-situacao/SituationSummaryCards';
import SituationDataQualityPanel from './sala-situacao/SituationDataQualityPanel';
import SituationSchoolTable from './sala-situacao/SituationSchoolTable';
import SituationSchoolDetail from './sala-situacao/SituationSchoolDetail';
import SituationPendingItems, { type PendingItemWithSchool } from './sala-situacao/SituationPendingItems';

export default function SalaDeSituacaoView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  // Ano corrente de verdade (revisão do code review do PR #16, seção 1) —
  // nunca mais um valor fixo no código-fonte. Reaproveita a mesma função
  // pura testável já usada por NotasView (buildAnoLetivoOptions) em vez de
  // duplicar a lista de anos disponíveis.
  const [anoLetivo, setAnoLetivo] = useState(() => new Date().getFullYear());
  // Âncora sempre no ano corrente REAL (nunca no ano atualmente
  // selecionado) — o conjunto de opções não "desliza" conforme o usuário
  // navega entre anos, sempre os mesmos três: anterior/corrente/seguinte.
  const anosDisponiveis = buildAnoLetivoOptions();
  const [bimestre, setBimestre] = useState<Bimestre>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [qualityFilter, setQualityFilter] = useState<DataQualityState | 'todas'>('todas');
  const [pendingTypeFilter, setPendingTypeFilter] = useState<PendingItemType | 'todas'>('todas');

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

  // Mesmo filtro central usado por FluxoView/EscolasView — nunca uma lista
  // própria recalculada aqui (seção 6/13 do plano).
  const visibleSchools = useMemo(
    () => getSchoolsForCurrentScope({
      superintendent: activeSuper,
      allSchools: SEED_SCHOOLS,
      isAuthenticated: isFirebaseMode,
      adminScope,
    }),
    [activeSuper, isFirebaseMode, adminScope]
  );

  const showScopeToggle = isScopedAdmin(activeSuper, isFirebaseMode);
  const scopeMode: SchoolScopeMode = showScopeToggle && adminScope === 'global' ? 'global' : 'carteira';

  // Revisão do code review do PR #16, seção 8: quando a escola selecionada
  // deixa de estar no escopo visível (troca de superintendente, troca de
  // carteira/global, ou qualquer mudança que reduza visibleSchools), o
  // detalhe fecha sozinho — nunca continua mostrando o detalhe de uma
  // escola fora do escopo atual.
  useEffect(() => {
    if (selectedSchoolId && !visibleSchools.some(s => s.id === selectedSchoolId)) {
      setSelectedSchoolId(null);
    }
  }, [visibleSchools, selectedSchoolId]);

  const { situations, loading, loadError, refresh } = useSchoolSituation({
    schools: visibleSchools,
    anoLetivo,
    bimestre,
    scopeMode,
    selectedSchoolId,
    isFirebaseMode,
  });

  const searchedSchools = visibleSchools.filter(s => s.nome.toLowerCase().includes(search.toLowerCase()));
  const filteredSchools = searchedSchools.filter(s => {
    const situation = situations[s.id];
    if (!situation) return false;
    if (qualityFilter !== 'todas' && situation.qualidadeGeral !== qualityFilter) return false;
    if (pendingTypeFilter !== 'todas' && !situation.pendencias.some(p => p.type === pendingTypeFilter)) return false;
    return true;
  });

  const summary = calculatePortfolioSituationSummary(
    filteredSchools
      .map(s => situations[s.id])
      .filter((s): s is NonNullable<typeof s> => s != null)
  );

  const pendingItems: PendingItemWithSchool[] = filteredSchools.flatMap(s => {
    const situation = situations[s.id];
    if (!situation) return [];
    return situation.pendencias
      .filter(p => pendingTypeFilter === 'todas' || p.type === pendingTypeFilter)
      .map(p => ({ ...p, escolaNome: s.nome }));
  });

  const selectedSituation = selectedSchoolId ? situations[selectedSchoolId] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - ACOMPANHAMENTO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Sala de Situação</h2>
          <p className="text-xs text-slate-500 font-normal">
            Visão consolidada do acompanhamento escolar e da qualidade dos dados.
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Esta visão apresenta somente dados agregados. Informações nominais permanecem restritas aos módulos autorizados.
          </p>
          {!isFirebaseMode && (
            <span className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-md uppercase tracking-wide">
              Modo demonstração — faça login para ver dados reais
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold rounded-lg transition shrink-0 self-start"
        >
          Atualizar
        </button>
      </div>

      <SituationFilters
        showScopeToggle={showScopeToggle}
        scopeMode={scopeMode}
        onScopeModeChange={mode => setAdminSchoolScope(mode === 'global' ? 'global' : 'portfolio')}
        schools={visibleSchools}
        selectedSchoolId={selectedSchoolId}
        onSelectedSchoolIdChange={setSelectedSchoolId}
        anoLetivo={anoLetivo}
        onAnoLetivoChange={setAnoLetivo}
        anosDisponiveis={anosDisponiveis}
        bimestre={bimestre}
        onBimestreChange={setBimestre}
        qualityFilter={qualityFilter}
        onQualityFilterChange={setQualityFilter}
        pendingTypeFilter={pendingTypeFilter}
        onPendingTypeFilterChange={setPendingTypeFilter}
      />

      <SituationSummaryCards summary={summary} loading={loading} />

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

      {/* Revisão do code review do PR #16, seção 8: enquanto um novo
          carregamento está em andamento (troca de ano/bimestre/carteira/
          superintendente), o detalhe nunca continua mostrando o resultado
          do contexto ANTERIOR — mostra um estado de carregamento próprio em
          vez disso, até `situations` refletir o novo contexto. */}
      {selectedSchoolId && loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400 font-bold">
          Carregando detalhe da escola...
        </div>
      ) : selectedSituation ? (
        <SituationSchoolDetail situation={selectedSituation} onClose={() => setSelectedSchoolId(null)} />
      ) : (
        <>
          <SituationSchoolTable
            schools={filteredSchools}
            situations={situations}
            loading={loading}
            onSelectSchool={setSelectedSchoolId}
          />
          <SituationDataQualityPanel />
          <div>
            <h3 className="text-xs font-bold text-slate-800 mb-2">Pendências operacionais</h3>
            <SituationPendingItems items={pendingItems} />
          </div>
        </>
      )}
    </div>
  );
}
