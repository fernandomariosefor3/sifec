// Nova identidade visual do SIFEC — estados padronizados de interface
// (seção 14): Loading, Empty, Error, NoData, Success. Nunca um texto solto:
// sempre o mesmo componente, para que ausência de dado nunca se confunda
// com erro nem seja tratada como "0".
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';

export type StateKind = 'loading' | 'empty' | 'error' | 'nodata' | 'success';

const KIND_STYLE: Record<StateKind, { icon: ReactNode; className: string }> = {
  loading: { icon: <Loader2 size={18} className="animate-spin" aria-hidden="true" />, className: 'text-slate-400 bg-slate-50 border-slate-200' },
  empty: { icon: <Inbox size={18} aria-hidden="true" />, className: 'text-slate-400 bg-slate-50 border-slate-200' },
  nodata: { icon: <Inbox size={18} aria-hidden="true" />, className: 'text-slate-400 bg-slate-50 border-slate-200' },
  error: { icon: <AlertTriangle size={18} aria-hidden="true" />, className: 'text-status-critical bg-status-critical-bg border-status-critical-border' },
  success: { icon: <CheckCircle2 size={18} aria-hidden="true" />, className: 'text-status-ok bg-status-ok-bg border-status-ok-border' },
};

interface StateMessageProps {
  kind: StateKind;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export default function StateMessage({ kind, title, description, action, compact = false, className = '' }: StateMessageProps) {
  const style = KIND_STYLE[kind];
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`border rounded-xl text-center ${compact ? 'px-4 py-4' : 'px-5 py-9'} ${style.className} ${className}`}
    >
      <div className="flex justify-center mb-2">{style.icon}</div>
      <p className="text-card-title">{title}</p>
      {description && <p className="text-caption mt-1 max-w-md mx-auto opacity-90">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
