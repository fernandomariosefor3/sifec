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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-label uppercase text-slate-400">Escolas com resultado</span>
          <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
            <GraduationCap size={16} />
          </span>
        </div>
        <div className="text-xl font-extrabold text-slate-900 mt-2">
          {loading ? '—' : escolasComResultado}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-label uppercase text-slate-400">Aprovados</span>
          <span className="w-7 h-7 rounded-lg bg-status-ok-bg text-status-ok flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} />
          </span>
        </div>
        <div className="text-xl font-extrabold text-slate-900 mt-2">
          {loading ? '—' : aprovados.toLocaleString('pt-BR')}
        </div>
        <p className="text-caption text-status-ok font-semibold mt-1">
          {loading ? '' : `${percentualAprovacao.toFixed(1)}% de aprovação geral`}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-label uppercase text-slate-400">Reprovados</span>
          <span className="w-7 h-7 rounded-lg bg-status-critical-bg text-status-critical flex items-center justify-center shrink-0">
            <XCircle size={16} />
          </span>
        </div>
        <div className="text-xl font-extrabold text-slate-900 mt-2">
          {loading ? '—' : reprovados.toLocaleString('pt-BR')}
        </div>
        <p className="text-caption text-status-critical font-semibold mt-1">
          {loading ? '' : `${percentualReprovacao.toFixed(1)}% de reprovação geral`}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-label uppercase text-slate-400">Abandono</span>
          <span className="w-7 h-7 rounded-lg bg-status-attention-bg text-status-attention flex items-center justify-center shrink-0">
            <UserX size={16} />
          </span>
        </div>
        <div className="text-xl font-extrabold text-slate-900 mt-2">
          {loading ? '—' : abandono.toLocaleString('pt-BR')}
        </div>
        <p className="text-caption text-status-attention font-semibold mt-1">
          {loading ? '' : `${percentualAbandono.toFixed(1)}% de abandono geral`}
        </p>
      </div>
    </div>
  );
}
