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

// `school_flow_results/{schoolId_anoLetivo}` — ex.: "diva-cabral_2025".
// Mesmo formato de buildSchoolYearId, mas mantida como função própria
// (Fase 2B) porque as duas coleções são independentes — escola+ano letivo é
// só coincidentemente a mesma chave composta para ambas.
export function buildSchoolFlowResultId(schoolId: string, anoLetivo: number): string {
  return `${schoolId}_${anoLetivo}`;
}

// `student_rosters/{schoolId_anoLetivo_turmaId_studentKey}` — studentKey é
// um identificador interno opaco (crypto.randomUUID() no cadastro manual),
// nunca derivado do nome do estudante (Fase 2C).
export function buildStudentRosterId(
  schoolId: string,
  anoLetivo: number,
  turmaId: string,
  studentKey: string
): string {
  return `${schoolId}_${anoLetivo}_${turmaId}_${studentKey}`;
}

// `student_bimester_grades/{rosterId_bBimestre}` — ex.:
// "diva-cabral_2026_turma-3a-diva_9c3b...-uuid_b1". Como rosterId já
// contém schoolId/anoLetivo/turmaId/studentKey, a nota herda o mesmo
// isolamento sem precisar repeti-lo no ID.
export function buildStudentBimesterGradeId(rosterId: string, bimestre: number): string {
  return `${rosterId}_b${bimestre}`;
}

// `grade_entry_monitoring/{schoolId_anoLetivo_bBimestre_turmaId}` — ex.:
// "diva-cabral_2026_b1_turma-3a-diva" (Fase 2C.1). Chave por TURMA, nunca
// por estudante — este acompanhamento é agregado, não nominal (ver
// docs/descontinuacao-prototipo-notas-nominais.md).
export function buildGradeEntryMonitoringId(
  schoolId: string,
  anoLetivo: number,
  bimestre: number,
  turmaId: string
): string {
  return `${schoolId}_${anoLetivo}_b${bimestre}_${turmaId}`;
}

// `bimonthly_enrollments/{schoolId_anoLetivo_bBimestre}` — ex.:
// "diva-cabral_2026_b1". Reestruturação SIFEC: matrícula por ESCOLA e por
// bimestre (nunca por turma) — mesmo formato de buildGradeEntryMonitoringId
// sem o sufixo de turma.
export function buildBimonthlyEnrollmentId(
  schoolId: string,
  anoLetivo: number,
  bimestre: number
): string {
  return `${schoolId}_${anoLetivo}_b${bimestre}`;
}
