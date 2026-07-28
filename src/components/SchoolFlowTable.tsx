// Fase 2B — seção C do painel de Fluxo Escolar: tabela por escola. Extraído
// de FluxoView.tsx para manter os arquivos de componente sob o limite de
// linhas do projeto. Ação PRINCIPAL com texto visível (nunca só ícone —
// mesmo cuidado de "Preencher dados 2026" em SchoolsTable.tsx).
import { ClipboardList } from 'lucide-react';
import { calculateTotalResultados, calculateSchoolFlowPercentuais } from '../lib/schoolFlowCalculations';
import type { SchoolFlowResult } from '../types/schoolFlow';

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface SchoolFlowTableProps {
  schools: readonly SchoolLike[];
  results: Record<string, SchoolFlowResult>;
  loading: boolean;
  onPreencherFluxo: (school: SchoolLike) => void;
}

type FlowStatusDisplay = 'nao_informado' | 'rascunho' | 'confirmado';

const STATUS_LABELS: Record<FlowStatusDisplay, string> = {
  nao_informado: 'Não informado',
  rascunho: 'Rascunho',
  confirmado: 'Confirmado',
};

const STATUS_BADGE_CLASSES: Record<FlowStatusDisplay, string> = {
  nao_informado: 'bg-slate-100 border-slate-200 text-slate-500',
  rascunho: 'bg-amber-50 border-amber-200 text-amber-700',
  confirmado: 'bg-emerald-50 border-emerald-200 text-emerald-700',
};

export default function SchoolFlowTable({ schools, results, loading, onPreencherFluxo }: SchoolFlowTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3.5 px-6">Escola</th>
              <th className="py-3.5 px-6">INEP</th>
              <th className="py-3.5 px-6 text-right">Aprovados</th>
              <th className="py-3.5 px-6 text-right">Reprovados</th>
              <th className="py-3.5 px-6 text-right">Abandono</th>
              <th className="py-3.5 px-6 text-right">Total</th>
              <th className="py-3.5 px-6 text-right">Aprovação</th>
              <th className="py-3.5 px-6 text-right">Reprovação</th>
              <th className="py-3.5 px-6 text-right">Abandono (%)</th>
              <th className="py-3.5 px-6 text-center">Status</th>
              <th className="py-3.5 px-6 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
            {schools.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-400">
                  Nenhuma escola corresponde aos critérios de pesquisa informados.
                </td>
              </tr>
            ) : (
              schools.map(school => {
                const result = results[school.id];
                const status: FlowStatusDisplay = result ? result.status : 'nao_informado';
                const total = result ? calculateTotalResultados(result) : 0;
                const pct = result
                  ? calculateSchoolFlowPercentuais(result)
                  : { percentualAprovacao: 0, percentualReprovacao: 0, percentualAbandono: 0 };

                return (
                  <tr key={school.id} className="hover:bg-slate-50/30 transition">
                    <td className="py-4 px-6 font-extrabold text-slate-900 text-sm">{school.nome}</td>
                    <td className="py-4 px-6 font-mono text-slate-500 text-[11px]">{school.codInep}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{result ? result.aprovados : '—'}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{result ? result.reprovados : '—'}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{result ? result.abandono : '—'}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{result ? total : '—'}</td>
                    <td className="py-4 px-6 text-right font-mono text-emerald-700">
                      {result ? `${pct.percentualAprovacao.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-rose-700">
                      {result ? `${pct.percentualReprovacao.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-amber-700">
                      {result ? `${pct.percentualAbandono.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-4 px-6 text-center">
                      {!loading && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${STATUS_BADGE_CLASSES[status]}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => onPreencherFluxo(school)}
                        className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm ml-auto whitespace-nowrap"
                      >
                        <ClipboardList size={13} />
                        Preencher fluxo
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
  );
}
