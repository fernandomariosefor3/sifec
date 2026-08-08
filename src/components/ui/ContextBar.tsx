// Nova identidade visual do SIFEC — diferencia visualmente o FILTRO DE
// CONTEXTO GLOBAL (escola/ano/bimestre, sempre no topo da tela) do filtro
// local de uma tabela específica (seção 4). Um único container consistente
// em vez de cada tela desenhar sua própria barra.
import type { ReactNode } from 'react';

interface ContextBarProps {
  children: ReactNode;
  className?: string;
}

export default function ContextBar({ children, className = '' }: ContextBarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 ${className}`}>
      {children}
    </div>
  );
}
