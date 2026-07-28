// Hotfix estabilização — o SIFEC roda publicado em dois endereços (Vercel e
// GitHub Pages, ver .github/workflows/deploy.yml), o que confundia o
// diagnóstico de login (domínios diferentes autorizados de forma diferente
// no Firebase). O endereço oficial de produção passa a ser só o da Vercel;
// GitHub Pages continua publicado (não alteramos DNS nem o pipeline), mas
// mostra um aviso apontando para o endereço oficial em vez de rodar o app
// duplicado.
export const CANONICAL_SIFEC_URL = 'https://sifec-sand.vercel.app/';

const GITHUB_PAGES_HOSTNAME_SUFFIX = '.github.io';

export function isGithubPagesHostname(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(GITHUB_PAGES_HOSTNAME_SUFFIX);
}
