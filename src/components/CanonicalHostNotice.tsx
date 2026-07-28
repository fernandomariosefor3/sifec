import { ExternalLink } from 'lucide-react';
import { CANONICAL_SIFEC_URL } from '../lib/canonicalHost';

// Hotfix estabilização — o SIFEC publica em dois endereços (Vercel via
// deploy manual/automático e GitHub Pages via .github/workflows/deploy.yml).
// Isso complicava o diagnóstico de login (domínios diferentes autorizados de
// forma diferente no Firebase Auth). Em vez de rodar o app duplicado nos
// dois hosts, o GitHub Pages passa a mostrar só este aviso apontando para o
// endereço oficial — sem alterar DNS nem desligar o pipeline de publicação.
export default function CanonicalHostNotice() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center space-y-4">
        <div className="w-12 h-12 bg-brand-turquoise text-white rounded-xl flex items-center justify-center font-black text-xl mx-auto shadow-md">
          3
        </div>
        <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight">
          Este endereço não é mais usado pelo SIFEC
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          O SIFEC (Sistema de Frequência e Indicadores Escolares do Ceará) agora funciona
          exclusivamente em um único endereço oficial. Acesse pelo link abaixo.
        </p>
        <a
          href={CANONICAL_SIFEC_URL}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white text-xs font-bold rounded-xl shadow-sm transition"
        >
          <ExternalLink size={14} />
          Acessar o SIFEC oficial
        </a>
        <p className="text-[10px] text-slate-400 font-mono break-all">{CANONICAL_SIFEC_URL}</p>
      </div>
    </div>
  );
}
