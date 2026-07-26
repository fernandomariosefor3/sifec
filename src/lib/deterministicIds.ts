// Fase 2A — construtores de ID determinístico. Nenhum import do Firebase
// (mesma razão de schoolIdentity.ts/superintendentRules.ts): precisam ser
// testáveis isoladamente, e usados tanto no cliente quanto em testes de
// regras para prever o ID exato de um documento antes de gravá-lo.

// `school_years/{schoolId_anoLetivo}` — ex.: "diva-cabral_2026".
export function buildSchoolYearId(schoolId: string, anoLetivo: number): string {
  return `${schoolId}_${anoLetivo}`;
}

export interface ParsedSchoolYearId {
  schoolId: string;
  anoLetivo: number;
}

// Inverso de buildSchoolYearId — o ano letivo é sempre o último segmento
// separado por "_", já que um schoolId pode conter hifens mas não "_".
export function parseSchoolYearId(id: string): ParsedSchoolYearId | undefined {
  const lastUnderscore = id.lastIndexOf('_');
  if (lastUnderscore === -1) return undefined;
  const schoolId = id.slice(0, lastUnderscore);
  const anoLetivoRaw = id.slice(lastUnderscore + 1);
  if (!schoolId || !/^\d{4}$/.test(anoLetivoRaw)) return undefined;
  return { schoolId, anoLetivo: Number(anoLetivoRaw) };
}

// `enrollment_snapshots/{schoolId_turmaId_YYYY-MM}` — ex.:
// "diva-cabral_turma-3a-diva_2026-03". mesReferencia já vem no formato
// YYYY-MM (ver isValidMonthReference em enrollmentCalculations.ts).
export function buildEnrollmentSnapshotId(
  schoolId: string,
  turmaId: string,
  mesReferencia: string
): string {
  return `${schoolId}_${turmaId}_${mesReferencia}`;
}
