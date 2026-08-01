// Fase 2D — Sala de Situação: barra de filtros (carteira/global, escola,
// ano letivo, bimestre, qualidade dos dados, tipo de pendência). Puramente
// apresentacional — todo o estado vive em SalaDeSituacaoView.tsx.
import type { Bimestre } from '../../types/studentBimesterGrade';
import type { DataQualityState, PendingItemType, SchoolScopeMode } from '../../types/schoolSituation';

export interface SituationFilterSchool {
  id: string;
  nome: string;
}

export const DATA_QUALITY_LABELS: Record<DataQualityState, string> = {
  sem_dados: 'Sem dados',
  incompleto: 'Incompleto',
  atualizado: 'Atualizado',
  inconsistente: 'Inconsistente',
  indisponivel: 'Dados indisponíveis',
};

export const PENDING_ITEM_TYPE_LABELS: Record<PendingItemType, string> = {
  ano_letivo_nao_configurado: 'Ano letivo não configurado',
  nenhuma_turma_cadastrada: 'Nenhuma turma cadastrada',
  turma_sem_ano_letivo: 'Turma sem ano letivo',
  matricula_inicial_nao_informada: 'Matrícula inicial não informada',
  registro_mensal_pendente: 'Registro mensal pendente',
  fluxo_nao_informado: 'Fluxo não informado',
  fluxo_rascunho: 'Fluxo em rascunho',
  estudantes_sem_notas: 'Estudantes sem notas',
  notas_parcialmente_preenchidas: 'Notas parcialmente preenchidas',
  escola_sem_visita: 'Escola sem visita',
};

interface SituationFiltersProps {
  showScopeToggle: boolean;
  scopeMode: SchoolScopeMode;
  onScopeModeChange: (mode: SchoolScopeMode) => void;
  schools: readonly SituationFilterSchool[];
  selectedSchoolId: string | null;
  onSelectedSchoolIdChange: (schoolId: string | null) => void;
  anoLetivo: number;
  onAnoLetivoChange: (ano: number) => void;
  anosDisponiveis: readonly number[];
  bimestre: Bimestre;
  onBimestreChange: (bimestre: Bimestre) => void;
  qualityFilter: DataQualityState | 'todas';
  onQualityFilterChange: (value: DataQualityState | 'todas') => void;
  pendingTypeFilter: PendingItemType | 'todas';
  onPendingTypeFilterChange: (value: PendingItemType | 'todas') => void;
}

const SELECT_CLASS = 'py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl';

export default function SituationFilters({
  showScopeToggle,
  scopeMode,
  onScopeModeChange,
  schools,
  selectedSchoolId,
  onSelectedSchoolIdChange,
  anoLetivo,
  onAnoLetivoChange,
  anosDisponiveis,
  bimestre,
  onBimestreChange,
  qualityFilter,
  onQualityFilterChange,
  pendingTypeFilter,
  onPendingTypeFilterChange,
}: SituationFiltersProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-3">
      {showScopeToggle && (
        <div className="flex gap-1.5" role="group" aria-label="Carteira ou visão global">
          <button
            type="button"
            onClick={() => onScopeModeChange('carteira')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
              scopeMode === 'carteira'
                ? 'bg-brand-green text-white border-brand-green-dark'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            Carteira
          </button>
          <button
            type="button"
            onClick={() => onScopeModeChange('global')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
              scopeMode === 'global'
                ? 'bg-brand-turquoise text-white border-brand-turquoise-dark'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            Visão global
          </button>
        </div>
      )}

      <select
        value={selectedSchoolId ?? ''}
        onChange={e => onSelectedSchoolIdChange(e.target.value || null)}
        aria-label="Escola"
        className={SELECT_CLASS}
      >
        <option value="">Todas as escolas</option>
        {schools.map(s => (
          <option key={s.id} value={s.id}>{s.nome}</option>
        ))}
      </select>

      <select
        value={anoLetivo}
        onChange={e => onAnoLetivoChange(Number(e.target.value))}
        aria-label="Ano letivo"
        className={SELECT_CLASS}
      >
        {anosDisponiveis.map(ano => (
          <option key={ano} value={ano}>{ano}</option>
        ))}
      </select>

      <select
        value={bimestre}
        onChange={e => onBimestreChange(Number(e.target.value) as Bimestre)}
        aria-label="Bimestre"
        className={SELECT_CLASS}
      >
        {[1, 2, 3, 4].map(b => (
          <option key={b} value={b}>{b}º Bimestre</option>
        ))}
      </select>

      <select
        value={qualityFilter}
        onChange={e => onQualityFilterChange(e.target.value as DataQualityState | 'todas')}
        aria-label="Situação dos dados"
        className={SELECT_CLASS}
      >
        <option value="todas">Qualquer qualidade de dados</option>
        {(Object.keys(DATA_QUALITY_LABELS) as DataQualityState[]).map(state => (
          <option key={state} value={state}>{DATA_QUALITY_LABELS[state]}</option>
        ))}
      </select>

      <select
        value={pendingTypeFilter}
        onChange={e => onPendingTypeFilterChange(e.target.value as PendingItemType | 'todas')}
        aria-label="Tipo de pendência"
        className={SELECT_CLASS}
      >
        <option value="todas">Qualquer pendência</option>
        {(Object.keys(PENDING_ITEM_TYPE_LABELS) as PendingItemType[]).map(type => (
          <option key={type} value={type}>{PENDING_ITEM_TYPE_LABELS[type]}</option>
        ))}
      </select>
    </div>
  );
}
