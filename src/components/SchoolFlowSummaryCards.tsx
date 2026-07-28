// Fase 2B — seção B do painel de Fluxo Escolar: indicadores consolidados.
// Extraído de FluxoView.tsx para manter os arquivos de componente sob o
// limite de linhas do projeto. Puramente apresentacional — os totais e
// percentuais já chegam calculados (ver schoolFlowCalculations.ts,
// consolidateSchoolFlowResults: percentuais gerais pelos totais
// consolidados, nunca pela média simples dos percentuais por escola).
import { GraduationCap, CheckCircle2, XCircle, UserX } from 'lucide-react';
import type { SchoolFlowConsolidated } from '../lib/schoolFlowCalculations';

interface SchoolFlowSummaryCardsProps {
  consolidated: SchoolFlowConsolidated;
  loading: boolean;
}

export default function SchoolFlowSummaryCards({ consolidated, loading }: SchoolFlowSummaryCardsProps) {
  const { escolasComResultado, aprovados, reprovados, abandono, percentualAprovacao, percentualReprovacao, percentualAbandono } = consolidated;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-brand-turquoise/20 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Escolas com resultado</span>
          <span className="w-8 h-8 rounded-lg bg-brand-turquoise/10 text-brand-turquoise flex items-center justify-center shrink-0">
            <GraduationCap size={16} />
          </span>
        </div>
        <div className="text-2xl font-extrabold text-slate-900 font-mono mt-2">
          {loading ? '—' : escolasComResultado}
        </div>
      </div>

      <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Aprovados</span>
          <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} />
          </span>
        </div>
        <div className="text-2xl font-extrabold text-slate-900 font-mono mt-2">
          {loading ? '—' : aprovados.toLocaleString('pt-BR')}
        </div>
        <p className="text-[11px] text-emerald-700 font-bold mt-1">
          {loading ? '' : `${percentualAprovacao.toFixed(1)}% de aprovação geral`}
        </p>
      </div>

      <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Reprovados</span>
          <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
            <XCircle size={16} />
          </span>
        </div>
        <div className="text-2xl font-extrabold text-slate-900 font-mono mt-2">
          {loading ? '—' : reprovados.toLocaleString('pt-BR')}
        </div>
        <p className="text-[11px] text-rose-700 font-bold mt-1">
          {loading ? '' : `${percentualReprovacao.toFixed(1)}% de reprovação geral`}
        </p>
      </div>

      <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Abandono</span>
          <span className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <UserX size={16} />
          </span>
        </div>
        <div className="text-2xl font-extrabold text-slate-900 font-mono mt-2">
          {loading ? '—' : abandono.toLocaleString('pt-BR')}
        </div>
        <p className="text-[11px] text-amber-700 font-bold mt-1">
          {loading ? '' : `${percentualAbandono.toFixed(1)}% de abandono geral`}
        </p>
      </div>
    </div>
  );
}
