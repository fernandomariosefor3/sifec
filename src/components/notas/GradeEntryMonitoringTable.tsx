// Fase 2C.1 — tabela de acompanhamento de preenchimento de notas, uma linha
// por TURMA (nunca por estudante). Toda turma cadastrada aparece, mesmo sem
// nenhum relatório informado ainda (seção 9 do plano: "nunca mostrar uma
// tabela vazia apenas porque ainda não houve registro de monitoramento") —
// as linhas nascem de `turmas`, o acompanhamento é só um dado opcional
// anexado a cada uma.
import { FilePlus2, FilePenLine } from 'lucide-react';
import {
  classifyTurmaGradeEntryStatus,
  calculateCompletionPercentage,
  classifyCompletionColorBand,
  COMPLETION_COLOR_BAND_INFO,
  type TurmaGradeEntryStatus,
} from '../../lib/gradeEntryMonitoringCalculations';
import type { GradeEntryMonitoring } from '../../types/gradeEntryMonitoring';

export interface GradeEntryMonitoringRow {
  turmaId: string;
  turmaNome: string;
  matriculaAtual: number | null;
  monitoring: GradeEntryMonitoring | null;
}

export type StatusFilter = 'todos' | TurmaGradeEntryStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'completo', label: 'Completo' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'sem_preenchimento', label: 'Sem preenchimento' },
  { value: 'nao_informado', label: 'Sem relatório' },
  { value: 'inconsistente', label: 'Inconsistente' },
];

const STATUS_BADGE: Record<TurmaGradeEntryStatus, { label: string; className: string }> = {
  nao_informado: { label: 'Relatório não informado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  sem_preenchimento: { label: 'Sem preenchimento', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  parcial: { label: 'Preenchimento parcial', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completo: { label: 'Preenchimento completo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inconsistente: { label: 'Inconsistente', className: 'bg-orange-50 text-orange-700 border-orange-300' },
};

const STATUS_LABEL: Record<'rascunho' | 'confirmado', string> = {
  rascunho: 'Rascunho',
  confirmado: 'Confirmado',
};

interface GradeEntryMonitoringTableProps {
  rows: readonly GradeEntryMonitoringRow[];
  loading: boolean;
  canWrite: boolean;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onRegistrar: (row: GradeEntryMonitoringRow) => void;
}

export default function GradeEntryMonitoringTable({
  rows, loading, canWrite, statusFilter, onStatusFilterChange, onRegistrar,
}: GradeEntryMonitoringTableProps) {
  const visibleRows = statusFilter === 'todos'
    ? rows
    : rows.filter(row => classifyTurmaGradeEntryStatus(row.monitoring) === statusFilter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onStatusFilterChange(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition ${
              statusFilter === opt.value
                ? 'bg-brand-turquoise text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Turma</th>
                <th className="py-3.5 px-4 text-right">Matrícula atual</th>
                <th className="py-3.5 px-4 text-right">Completas</th>
                <th className="py-3.5 px-4 text-right">Parciais</th>
                <th className="py-3.5 px-4 text-right">Sem notas</th>
                <th className="py-3.5 px-4 text-right">Esperados</th>
                <th className="py-3.5 px-4 text-right">Realizados</th>
                <th className="py-3.5 px-4 text-right">Preenchimento</th>
                <th className="py-3.5 px-4">Situação</th>
                <th className="py-3.5 px-4">Referência</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">Carregando turmas...</td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    {rows.length === 0
                      ? 'Nenhuma turma cadastrada para esta escola e ano letivo.'
                      : 'Nenhuma turma encontrada com a situação selecionada.'}
                  </td>
                </tr>
              ) : (
                visibleRows.map(row => {
                  const status = classifyTurmaGradeEntryStatus(row.monitoring);
                  const badge = STATUS_BADGE[status];
                  const percentage = row.monitoring ? calculateCompletionPercentage(row.monitoring) : null;
                  const colorBand = COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(percentage)];
                  const m = row.monitoring;
                  return (
                    <tr key={row.turmaId} className="hover:bg-slate-50/30 transition">
                      <td className="py-4 px-4 font-extrabold text-slate-900 text-sm">{row.turmaNome}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-700">{row.matriculaAtual ?? '—'}</td>
                      <td className="py-4 px-4 text-right font-mono text-emerald-700">{m ? m.studentsWithCompleteGrades : '—'}</td>
                      <td className="py-4 px-4 text-right font-mono text-amber-700">{m ? m.studentsWithPartialGrades : '—'}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-500">{m ? m.studentsWithoutGrades : '—'}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-600">{m ? m.expectedGradeEntries : '—'}</td>
                      <td className="py-4 px-4 text-right font-mono text-slate-600">{m ? m.completedGradeEntries : '—'}</td>
                      <td className="py-4 px-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 justify-end font-mono font-bold ${colorBand.textClassName}`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block ${colorBand.dotClassName}`} />
                          {percentage == null ? 'Não informado' : `${percentage.toFixed(0)}%`}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">{m?.referenceDate ?? '—'}</td>
                      <td className="py-4 px-4 text-slate-500 text-[11px]">{m ? STATUS_LABEL[m.status] : '—'}</td>
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          disabled={!canWrite}
                          onClick={() => onRegistrar(row)}
                          title={canWrite ? undefined : 'Sem permissão de escrita para esta escola'}
                          className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm ml-auto whitespace-nowrap"
                        >
                          {m ? <FilePenLine size={13} /> : <FilePlus2 size={13} />}
                          {m ? 'Atualizar acompanhamento' : 'Registrar acompanhamento'}
                        </button>
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
