// Fase 1G — camada pura de identidade de escola, sem nenhum import do
// Firebase (mesma razão de superintendentRules.ts: precisa ser testável
// isoladamente, sem emulador/app inicializado).
//
// Problema que isto resolve: em toda a base, o vínculo entre um
// superintendente/admin e uma escola — e entre turmas/visitas/ações do
// Circuito de Gestão/Busca Ativa/PPDT e a escola a que pertencem — é feito
// comparando o NOME DE EXIBIÇÃO por igualdade exata (=== ou Array.includes).
// Documentos reais de `schools` podem ter diferenças de caixa, espaços
// finais ou acentuação (ex.: "EEMTI ANISIO TEIXEIRA " vs "EEMTI Anísio
// Teixeira") que quebram essa comparação exata sem quebrar o significado —
// é a mesma escola. Este módulo centraliza a normalização e a resolução de
// identidade para nunca depender só de igualdade exata de nome.
//
// IMPORTANTE: a normalização é só para COMPARAÇÃO. Nunca usar
// normalizeSchoolName() para decidir o que gravar ou exibir — o nome
// armazenado/mostrado ao usuário permanece exatamente como está no
// documento de origem.

export interface SchoolRef {
  id?: string;
  nome: string;
  codInep?: string;
}

// trim + lowercase + colapso de espaços internos + remoção de diacríticos
// (NFD, só para a comparação). Mesma técnica de remoção de marcas
// combinantes já usada em superintendentRules.ts (slugify).
export function normalizeSchoolName(name: string): string {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Igualdade tolerante a caixa/espaço/acento — substitui toda comparação
// direta (===) de nome de escola feita hoje no app. NÃO usar para `id`/
// `escolaId`: identificadores de documento são chaves exatas por definição
// e nunca devem passar por esta normalização.
export function schoolNamesMatch(a: string, b: string): boolean {
  return normalizeSchoolName(a) === normalizeSchoolName(b);
}

// Resolve um alvo (nome solto, ou objeto parcial com codInep/id/nome)
// contra uma lista de escolas candidatas, na prioridade exigida:
// 1) codInep (quando os dois lados o possuem e não é vazio);
// 2) id do documento (quando os dois lados o possuem);
// 3) nome normalizado, como fallback de compatibilidade.
export function resolveSchoolRef(
  target: string | Partial<SchoolRef>,
  candidates: readonly SchoolRef[]
): SchoolRef | undefined {
  const targetRef: Partial<SchoolRef> = typeof target === 'string' ? { nome: target } : target;

  if (targetRef.codInep) {
    const byInep = candidates.find(c => !!c.codInep && c.codInep === targetRef.codInep);
    if (byInep) return byInep;
  }

  if (targetRef.id) {
    const byId = candidates.find(c => !!c.id && c.id === targetRef.id);
    if (byId) return byId;
  }

  if (targetRef.nome) {
    const targetKey = normalizeSchoolName(targetRef.nome);
    const byName = candidates.find(c => normalizeSchoolName(c.nome) === targetKey);
    if (byName) return byName;
  }

  return undefined;
}
