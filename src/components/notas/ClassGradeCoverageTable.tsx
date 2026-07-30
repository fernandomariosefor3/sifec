// Fase 2C — tabela por turma do painel de Notas Bimestrais (seção 12 do
// plano). Ação PRINCIPAL com texto visível (nunca só ícone — mesmo cuidado
// de "Preencher dados 2026"/"Preencher fluxo").
import { Eye } from 'lucide-react';
import type { ConsolidatedFillStats } from '../../lib/studentGradeCalculations';

export interface ClassCoverageRow {
  turmaId: string;
  turmaNome: string;
  stats: ConsolidatedFillStats;
}

interface ClassGradeCoverageTableProps {
  rows: readonly ClassCoverageRow[];
  loading: boolean;
  onVerEstudantes: (turmaId: string) => void;
}

export default function ClassGradeCoverageTable({ rows, loading, onVerEstudantes }: ClassGradeCoverageTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3.5 px-6">Turma</th>
              <th className="py-3.5 px-6 text-right">Ativos</th>
              <th className="py-3.5 px-6 text-right">Completos</th>
              <th className="py-3.5 px-6 text-right">Parciais</th>
              <th className="py-3.5 px-6 text-right">Sem notas</th>
              <th className="py-3.5 px-6 text-right">Abaixo da referência</th>
              <th className="py-3.5 px-6 text-right">Preenchimento</th>
              <th className="py-3.5 px-6 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">Carregando turmas...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  Nenhuma turma cadastrada para esta escola e ano letivo — cadastre a turma em Gestão de Escolas.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.turmaId} className="hover:bg-slate-50/30 transition">
                  <td className="py-4 px-6 font-extrabold text-slate-900 text-sm">{row.turmaNome}</td>
                  <td className="py-4 px-6 text-right font-bold text-slate-800">{row.stats.estudantesAtivos}</td>
                  <td className="py-4 px-6 text-right font-mono text-emerald-700">{row.stats.completos}</td>
                  <td className="py-4 px-6 text-right font-mono text-amber-700">{row.stats.parciais}</td>
                  <td className="py-4 px-6 text-right font-mono text-slate-500">{row.stats.semNotas}</td>
                  <td className="py-4 px-6 text-right font-mono text-rose-700">{row.stats.abaixoReferencia}</td>
                  <td className="py-4 px-6 text-right font-mono text-brand-turquoise">
                    {row.stats.percentualPreenchimento.toFixed(0)}%
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => onVerEstudantes(row.turmaId)}
                      className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm ml-auto whitespace-nowrap"
                    >
                      <Eye size={13} />
                      Ver estudantes
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
