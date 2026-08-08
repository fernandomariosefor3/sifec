// Nova identidade visual do SIFEC — indicador de status compacto e
// semântico. Nunca usa cor como único sinal: sempre acompanha um rótulo em
// texto (ver seção 18, acessibilidade — "cor nunca como único indicador").
import type { ReactNode } from 'react';

export type BadgeTone = 'ok' | 'attention' | 'critical' | 'info' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: 'bg-brand-green-light text-brand-green-dark border-brand-green/30',
  attention: 'bg-brand-orange-light text-brand-orange-dark border-brand-orange/30',
  critical: 'bg-brand-coral-light text-brand-coral-dark border-brand-coral/30',
  info: 'bg-brand-turquoise-light text-brand-turquoise-dark border-brand-turquoise/30',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
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
