// Nova identidade visual do SIFEC — cabeçalho padrão de tela (seção 3):
// título, descrição curta, contexto (escola/ano/bimestre) e ação principal
// à direita, sem dominar a tela. Reaproveitado por todas as telas
// principais em vez de cada uma remontar seu próprio cabeçalho do zero.
import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ eyebrow, title, description, context, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`pb-4 mb-5 border-b border-slate-200 space-y-3 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <span className="text-label uppercase text-brand-turquoise-dark block mb-1">{eyebrow}</span>
          )}
          <h2 className="text-page-title text-slate-900">{title}</h2>
          {description && <p className="text-body text-slate-500 mt-1 max-w-2xl">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {context && <div className="flex flex-wrap items-center gap-2">{context}</div>}
    </div>
  );
}
