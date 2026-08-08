// Nova identidade visual do SIFEC — nível único e consistente de
// "superfície" (seção 15): substitui a mistura de rounded-2xl/rounded-3xl,
// sombras fortes e bordas grossas espalhadas pelo app. Reservado para
// indicadores, resumos, chamadas de ação e alertas — tabelas e formulários
// não precisam de mais uma camada de card em volta.
import type { ReactNode } from 'react';

interface SurfaceCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<SurfaceCardProps['padding']>, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export default function SurfaceCard({ children, className = '', padding = 'md' }: SurfaceCardProps) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl ${PADDING[padding]} ${className}`}>
      {children}
    </div>
  );
}
