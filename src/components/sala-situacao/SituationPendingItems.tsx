// Fase 2D — Sala de Situação: lista de pendências operacionais (seção 9 do
// plano). Cada item já chega pronto de buildPendingItems — este componente
// só exibe o que falta, de qual período, de qual coleção, e qual ação
// resolve (nunca um rótulo genérico de julgamento).
import { AlertCircle } from 'lucide-react';
import type { SchoolSituationPendingItem } from '../../types/schoolSituation';
import { PENDING_ITEM_TYPE_LABELS } from './SituationFilters';

export interface PendingItemWithSchool extends SchoolSituationPendingItem {
  escolaNome: string;
}

interface SituationPendingItemsProps {
  items: readonly PendingItemWithSchool[];
}

export default function SituationPendingItems({ items }: SituationPendingItemsProps) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400 font-bold">
        Nenhuma pendência encontrada para o filtro atual.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
      {items.map((item, idx) => (
        <div key={`${item.schoolId}-${item.type}-${idx}`} className="p-4 flex items-start gap-3">
          <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
            <AlertCircle size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-800">{item.escolaNome}</span>
              <span className="text-[10px] uppercase tracking-wide font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                {PENDING_ITEM_TYPE_LABELS[item.type]}
              </span>
              {item.period && (
                <span className="text-[10px] text-slate-400 font-mono">{item.period}</span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">{item.message}</p>
            <p className="text-[10px] text-slate-400 mt-1">
              Fonte: <span className="font-mono">{item.sourceCollection}</span> — {item.resolutionAction}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
