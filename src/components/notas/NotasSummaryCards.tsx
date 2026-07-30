// Fase 2C — indicadores consolidados do painel de Notas Bimestrais
// (seção 12 do plano). Extraído para manter os arquivos de componente sob
// o limite de linhas do projeto. Puramente apresentacional — os totais já
// chegam calculados (ver studentGradeCalculations.ts, consolidateStudentFill).
import { Users, CheckCircle2, Circle, AlertTriangle, TrendingDown, Percent } from 'lucide-react';
import type { ConsolidatedFillStats } from '../../lib/studentGradeCalculations';
import { REFERENCE_AVERAGE } from '../../lib/studentGradeCalculations';

interface NotasSummaryCardsProps {
  stats: ConsolidatedFillStats;
  loading: boolean;
}

export default function NotasSummaryCards({ stats, loading }: NotasSummaryCardsProps) {
  const { estudantesAtivos, completos, parciais, semNotas, abaixoReferencia, percentualPreenchimento } = stats;
  const fmt = (n: number) => (loading ? '—' : String(n));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Estudantes ativos</span>
            <Users size={15} className="text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 font-mono mt-1.5">{fmt(estudantesAtivos)}</div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Preenchimento completo</span>
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 font-mono mt-1.5">{fmt(completos)}</div>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Preenchimento parcial</span>
            <Circle size={15} className="text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-amber-700 font-mono mt-1.5">{fmt(parciais)}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Sem notas</span>
            <AlertTriangle size={15} className="text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-700 font-mono mt-1.5">{fmt(semNotas)}</div>
        </div>

        <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Abaixo da referência</span>
            <TrendingDown size={15} className="text-rose-600" />
          </div>
          <div className="text-xl font-extrabold text-rose-700 font-mono mt-1.5">{fmt(abaixoReferencia)}</div>
        </div>

        <div className="bg-white border border-brand-turquoise/30 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Preenchimento geral</span>
            <Percent size={15} className="text-brand-turquoise" />
          </div>
          <div className="text-xl font-extrabold text-brand-turquoise font-mono mt-1.5">
            {loading ? '—' : `${percentualPreenchimento.toFixed(0)}%`}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 font-mono">
        Média de referência para monitoramento: {REFERENCE_AVERAGE.toFixed(1).replace('.', ',')}
      </p>
    </div>
  );
}
