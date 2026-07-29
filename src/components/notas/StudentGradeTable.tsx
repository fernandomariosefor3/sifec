// Fase 2C — tabela de estudantes do painel de Notas Bimestrais (seção 12
// do plano). Mostra só os estudantes JÁ CARREGADOS da escola selecionada
// (nunca busca dado novo aqui) — "turma" aparece como coluna porque a
// tabela cobre todas as turmas da escola, filtráveis por "Ver estudantes"
// na tabela de turmas. Ações textuais (nunca só ícone); sem botão de
// exclusão comum (seção 13/14 do plano — só Ativar/Inativar e
// Preencher/Corrigir notas).
import { ClipboardEdit, Plus, Power, PowerOff, Search } from 'lucide-react';
import { calculateFillPercentage, calculatePartialAverage, determineFillState, isBelowReferenceAverage } from '../../lib/studentGradeCalculations';
import type { BimesterScores } from '../../types/studentBimesterGrade';

export interface StudentGradeRow {
  studentKey: string;
  studentName: string;
  turmaId: string;
  turmaNome: string;
  active: boolean;
  scores: BimesterScores | null;
}

export type FillFilter = 'todos' | 'sem_notas' | 'parcial' | 'completo' | 'abaixo_referencia';

const FILTER_LABELS: Record<FillFilter, string> = {
  todos: 'Todos',
  sem_notas: 'Sem notas',
  parcial: 'Parcial',
  completo: 'Completo',
  abaixo_referencia: 'Abaixo da referência',
};

const FILL_STATE_LABELS = {
  sem_notas: 'Sem notas',
  parcial: 'Preenchimento parcial',
  completo: 'Preenchimento completo',
};

const FILL_STATE_BADGE_CLASSES = {
  sem_notas: 'bg-slate-100 border-slate-200 text-slate-500',
  parcial: 'bg-amber-50 border-amber-200 text-amber-700',
  completo: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

interface StudentGradeTableProps {
  students: readonly StudentGradeRow[];
  loading: boolean;
  canWrite: boolean;
  filter: FillFilter;
  onFilterChange: (filter: FillFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
  turmaFilterName: string | null;
  onClearTurmaFilter: () => void;
  onPreencherNotas: (row: StudentGradeRow) => void;
  onToggleActive: (row: StudentGradeRow) => void;
  onCadastrarEstudante: () => void;
}

export default function StudentGradeTable({
  students, loading, canWrite, filter, onFilterChange, search, onSearchChange,
  turmaFilterName, onClearTurmaFilter, onPreencherNotas, onToggleActive, onCadastrarEstudante,
}: StudentGradeTableProps) {
  const filtered = students.filter(row => {
    if (!row.studentName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'todos') return true;
    const scores = row.scores;
    if (filter === 'abaixo_referencia') return scores != null && isBelowReferenceAverage(scores);
    const state = determineFillState(scores ?? { linguaPortuguesa: null, matematica: null, cienciasNatureza: null, cienciasHumanas: null });
    return state === filter;
  });

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar estudante pelo nome..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-xl"
          />
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {turmaFilterName && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-turquoise/10 border border-brand-turquoise/20 text-brand-turquoise text-[10px] font-bold rounded-lg">
              Turma: {turmaFilterName}
              <button type="button" onClick={onClearTurmaFilter} className="hover:text-brand-turquoise-dark">×</button>
            </span>
          )}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(Object.keys(FILTER_LABELS) as FillFilter[]).map(key => (
              <button
                key={key}
                onClick={() => onFilterChange(key)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition ${
                  filter === key ? 'bg-white text-brand-turquoise shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {FILTER_LABELS[key]}
              </button>
            ))}
          </div>
          {canWrite && (
            <button
              onClick={onCadastrarEstudante}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap"
            >
              <Plus size={13} />
              Cadastrar estudante
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-6">Estudante</th>
                <th className="py-3.5 px-6">Turma</th>
                <th className="py-3.5 px-6 text-right">Líng. Portuguesa</th>
                <th className="py-3.5 px-6 text-right">Matemática</th>
                <th className="py-3.5 px-6 text-right">Ciências Nat.</th>
                <th className="py-3.5 px-6 text-right">Ciências Hum.</th>
                <th className="py-3.5 px-6 text-right">Média parcial</th>
                <th className="py-3.5 px-6 text-center">Preenchimento</th>
                <th className="py-3.5 px-6 text-center">Sinalização</th>
                <th className="py-3.5 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
              {loading ? (
                <tr><td colSpan={10} className="py-8 text-center text-slate-400">Carregando estudantes...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Nenhum estudante cadastrado para esta escola, turma e ano letivo.
                  </td>
                </tr>
              ) : (
                filtered.map(row => {
                  const scores = row.scores ?? { linguaPortuguesa: null, matematica: null, cienciasNatureza: null, cienciasHumanas: null };
                  const state = determineFillState(scores);
                  const average = calculatePartialAverage(scores);
                  const belowReference = row.scores != null && isBelowReferenceAverage(scores);
                  const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(1));
                  return (
                    <tr key={row.studentKey} className={`hover:bg-slate-50/30 transition ${row.active ? '' : 'opacity-50'}`}>
                      <td className="py-4 px-6 font-extrabold text-slate-900 text-sm">
                        {row.studentName}
                        {!row.active && (
                          <span className="ml-1.5 text-[9px] font-bold text-slate-400 uppercase align-middle">(Inativo)</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-500">{row.turmaNome}</td>
                      <td className="py-4 px-6 text-right font-mono text-slate-700">{fmt(scores.linguaPortuguesa)}</td>
                      <td className="py-4 px-6 text-right font-mono text-slate-700">{fmt(scores.matematica)}</td>
                      <td className="py-4 px-6 text-right font-mono text-slate-700">{fmt(scores.cienciasNatureza)}</td>
                      <td className="py-4 px-6 text-right font-mono text-slate-700">{fmt(scores.cienciasHumanas)}</td>
                      <td className="py-4 px-6 text-right font-mono font-bold text-slate-800">{average == null ? 'Não informado' : average.toFixed(1)}</td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${FILL_STATE_BADGE_CLASSES[state]}`}>
                          {FILL_STATE_LABELS[state]} ({calculateFillPercentage(scores).toFixed(0)}%)
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {belowReference && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-rose-50 border-rose-200 text-rose-700">
                            Abaixo da referência
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {canWrite ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onPreencherNotas(row)}
                              className="px-2.5 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition shadow-sm whitespace-nowrap"
                            >
                              <ClipboardEdit size={12} />
                              Preencher notas
                            </button>
                            <button
                              onClick={() => onToggleActive(row)}
                              title={row.active ? 'Inativar' : 'Ativar'}
                              className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition"
                            >
                              {row.active ? <PowerOff size={13} /> : <Power size={13} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-400">Leitura</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
