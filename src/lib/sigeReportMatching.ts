// Correção funcional pós-PR #17 — "Registrar relatório do SIGE": núcleo puro
// de correspondência entre uma linha do relatório (turma digitada pelo
// usuário) e as turmas JÁ CADASTRADAS da mesma escola+ano letivo. Nunca toca
// o Firestore — recebe a lista de turmas já carregada pelo chamador (mesma
// lista que useSchoolClassrooms + getClassroomsForSchoolYear já resolvem).
//
// Cascata de correspondência (nunca associa automaticamente quando há
// ambiguidade — a interface precisa exigir escolha humana nesse caso):
//   1) turmaId explícito, quando a linha já aponta para uma turma existente
//      (ex.: usuário escolheu de uma lista) — sempre inequívoco quando o ID
//      realmente existe na lista informada.
//   2) nome normalizado (mesma normalização tolerante a caixa/espaço/acento
//      de schoolIdentity.ts — aqui aplicada ao NOME DA TURMA, não da
//      escola) dentro da escola+ano já resolvida.
//   3) turno, só como desempate quando o nome sozinho bate mais de uma vez.
import { normalizeSchoolName } from './schoolIdentity';
import type { Turma } from '../types/classroom';

export type TurmaMatchStatus = 'encontrada' | 'possivel_correspondencia' | 'nao_cadastrada';

export interface TurmaMatchResult {
  status: TurmaMatchStatus;
  // Preenchido só quando status === 'encontrada'.
  turma: Turma | null;
  // Preenchido só quando status === 'possivel_correspondencia' — a
  // interface usa esta lista para o usuário escolher manualmente, ou
  // declarar explicitamente que é uma turma nova.
  candidates: readonly Turma[];
}

export interface TurmaMatchRowInput {
  turmaId?: string;
  turmaNome: string;
  turno?: string;
}

const NAO_ENCONTRADA: TurmaMatchResult = { status: 'nao_cadastrada', turma: null, candidates: [] };

function normalizeTurno(turno: string): string {
  // normalizeSchoolName é, apesar do nome, um normalizador genérico de
  // string (trim + minúsculas + colapso de espaço + remoção de acentos) —
  // reaproveitado aqui para turno pelo mesmo motivo de DRY já aplicado a
  // nome de turma logo abaixo.
  return normalizeSchoolName(turno);
}

// Nunca associa automaticamente quando houver ambiguidade — cada ramo que
// não consegue decidir com confiança retorna 'possivel_correspondencia'
// (nome bate mais de uma vez e turno não desempata) em vez de "adivinhar".
export function matchTurmaForReportRow(
  row: TurmaMatchRowInput,
  existingTurmas: readonly Turma[]
): TurmaMatchResult {
  if (row.turmaId) {
    const byId = existingTurmas.find(t => t.id === row.turmaId);
    if (byId) return { status: 'encontrada', turma: byId, candidates: [] };
    // ID informado mas ausente da lista atual: pode ser uma turma de fora
    // do escopo (outra escola/ano) — nunca tratada como "encontrada", cai
    // para a correspondência por nome abaixo em vez de falhar de imediato.
  }

  const targetName = normalizeSchoolName(row.turmaNome);
  const nameMatches = existingTurmas.filter(t => normalizeSchoolName(t.nome) === targetName);

  if (nameMatches.length === 0) {
    return NAO_ENCONTRADA;
  }

  if (nameMatches.length === 1) {
    const only = nameMatches[0];
    // Nome bate uma única vez, mas se turno foi informado dos DOIS lados e
    // diverge, ainda não associamos automaticamente — mesmo princípio de
    // "nunca decidir por adivinhação" quando um dado concreto diverge.
    if (row.turno && only.turno && normalizeTurno(row.turno) !== normalizeTurno(only.turno)) {
      return { status: 'possivel_correspondencia', turma: null, candidates: nameMatches };
    }
    return { status: 'encontrada', turma: only, candidates: [] };
  }

  // Nome ambíguo (mais de uma turma com o mesmo nome normalizado) — turno é
  // a única segunda chave disponível para desempatar.
  if (row.turno) {
    const targetTurno = normalizeTurno(row.turno);
    const turnoMatches = nameMatches.filter(t => t.turno && normalizeTurno(t.turno) === targetTurno);
    if (turnoMatches.length === 1) {
      return { status: 'encontrada', turma: turnoMatches[0], candidates: [] };
    }
  }

  return { status: 'possivel_correspondencia', turma: null, candidates: nameMatches };
}
