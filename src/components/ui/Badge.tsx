// Nova identidade visual do SIFEC — indicador de status compacto e
// semântico. Nunca usa cor como único sinal: sempre acompanha um rótulo em
// texto (ver seção 18, acessibilidade — "cor nunca como único indicador").
import type { ReactNode } from 'react';

export type BadgeTone = 'ok' | 'attention' | 'critical' | 'info' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: 'bg-status-ok-bg text-status-ok border-status-ok-border',
  attention: 'bg-status-attention-bg text-status-attention border-status-attention-border',
  critical: 'bg-status-critical-bg text-status-critical border-status-critical-border',
  info: 'bg-status-info-bg text-status-info border-status-info-border',
  neutral: 'bg-status-neutral-bg text-status-neutral border-status-neutral-border',
};

interface BadgeProps {
  tone: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export default function Badge({ tone, children, icon, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
