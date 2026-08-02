// Fase 2C.1 — indicadores consolidados do painel de Notas Bimestrais, agora
// agregados POR TURMA (nunca por estudante — ver
// docs/descontinuacao-prototipo-notas-nominais.md). Puramente
// apresentacional — os totais já chegam calculados por
// consolidateGradeEntryMonitoring.
import { Layers, FileCheck2, CheckCircle2, Circle, AlertTriangle, FileX2, Percent, ShieldAlert } from 'lucide-react';
import type { GradeEntryMonitoringConsolidated } from '../../lib/gradeEntryMonitoringCalculations';

interface NotasSummaryCardsProps {
  stats: GradeEntryMonitoringConsolidated;
  loading: boolean;
}

export default function NotasSummaryCards({ stats, loading }: NotasSummaryCardsProps) {
  const {
    turmasCadastradas, turmasComRelatorio, turmasCompletas, turmasParciais,
    turmasSemPreenchimento, turmasSemRelatorio, turmasInconsistentes, percentualPreenchimentoGeral,
  } = stats;
  const fmt = (n: number) => (loading ? '—' : String(n));
  // Ajuste cirúrgico pós-PR #17: existe relatório (não é "sem informação"),
  // mas ele é matematicamente inconsistente — nunca usar o texto
  // "Não informado" aqui, que sugeriria ausência de dado em vez de um dado
  // presente porém inválido.
  const hasInconsistencies = !loading && turmasInconsistentes > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Turmas cadastradas</span>
            <Layers size={15} className="text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 font-mono mt-1.5">{fmt(turmasCadastradas)}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Com relatório informado</span>
            <FileCheck2 size={15} className="text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-800 font-mono mt-1.5">{fmt(turmasComRelatorio)}</div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Preenchimento completo</span>
            <CheckCircle2 size={15} className="text-emerald-600" />
          </div>
          <div className="text-xl font-extrabold text-emerald-700 font-mono mt-1.5">{fmt(turmasCompletas)}</div>
        </div>

        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Preenchimento parcial</span>
            <Circle size={15} className="text-amber-600" />
          </div>
          <div className="text-xl font-extrabold text-amber-700 font-mono mt-1.5">{fmt(turmasParciais)}</div>
        </div>

        <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Sem preenchimento</span>
            <AlertTriangle size={15} className="text-rose-600" />
          </div>
          <div className="text-xl font-extrabold text-rose-700 font-mono mt-1.5">{fmt(turmasSemPreenchimento)}</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Sem relatório</span>
            <FileX2 size={15} className="text-slate-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-500 font-mono mt-1.5">{fmt(turmasSemRelatorio)}</div>
        </div>

        <div className={`bg-white rounded-2xl p-4 shadow-sm border ${hasInconsistencies ? 'border-orange-300' : 'border-brand-turquoise/30'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Preenchimento geral</span>
            {hasInconsistencies
              ? <ShieldAlert size={15} className="text-orange-600" />
              : <Percent size={15} className="text-brand-turquoise" />}
          </div>
          <div className={`text-xl font-extrabold font-mono mt-1.5 ${hasInconsistencies ? 'text-orange-700' : 'text-brand-turquoise'}`}>
            {loading
              ? '—'
              : hasInconsistencies
                ? 'Revisar inconsistências'
                : percentualPreenchimentoGeral == null ? 'Não informado' : `${percentualPreenchimentoGeral.toFixed(0)}%`}
          </div>
        </div>
      </div>

      {hasInconsistencies && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl px-4 py-2.5 text-[11px] text-orange-700 font-bold flex items-center gap-2">
          <ShieldAlert size={15} className="text-orange-600 shrink-0" />
          <span>
            {turmasInconsistentes === 1
              ? '1 turma com relatório inconsistente — revise os totais informados antes de confiar no percentual geral.'
              : `${turmasInconsistentes} turmas com relatório inconsistente — revise os totais informados antes de confiar no percentual geral.`}
          </span>
        </div>
      )}
    </div>
  );
}
