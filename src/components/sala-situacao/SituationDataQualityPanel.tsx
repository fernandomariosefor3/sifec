// Fase 2D — Sala de Situação: legenda dos estados de qualidade dos dados
// (seção 10 do plano). Puramente explicativo — os estados nunca são
// persistidos, sempre recalculados (ver combineDataQualityStates).
import type { ReactNode } from 'react';
import { CircleDashed, CircleDot, CircleCheck, CircleAlert } from 'lucide-react';
import type { DataQualityState } from '../../types/schoolSituation';

const QUALITY_INFO: Record<DataQualityState, { label: string; description: string; icon: ReactNode; className: string }> = {
  sem_dados: {
    label: 'Sem dados',
    description: 'Nenhum registro encontrado para este indicador.',
    icon: <CircleDashed size={14} />,
    className: 'text-slate-500 bg-slate-100 border-slate-200',
  },
  incompleto: {
    label: 'Incompleto',
    description: 'Existem registros, mas faltam partes esperadas.',
    icon: <CircleDot size={14} />,
    className: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  atualizado: {
    label: 'Atualizado',
    description: 'O conjunto esperado de registros está preenchido.',
    icon: <CircleCheck size={14} />,
    className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  inconsistente: {
    label: 'Inconsistente',
    description: 'Os valores existentes não fecham matematicamente ou possuem vínculos divergentes.',
    icon: <CircleAlert size={14} />,
    className: 'text-rose-700 bg-rose-50 border-rose-200',
  },
};

export function DataQualityBadge({ state }: { state: DataQualityState }) {
  const info = QUALITY_INFO[state];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${info.className}`}>
      {info.icon} {info.label}
    </span>
  );
}

export default function SituationDataQualityPanel() {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <h3 className="text-xs font-bold text-slate-800 mb-2">Estados de qualidade dos dados</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(QUALITY_INFO) as DataQualityState[]).map(state => (
          <div key={state} className="flex flex-col gap-1">
            <DataQualityBadge state={state} />
            <p className="text-[11px] text-slate-500 leading-snug">{QUALITY_INFO[state].description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
