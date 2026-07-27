// Correção de usabilidade — mensagens de orientação para o estado inicial
// do painel de matrículas. Puramente informativo: nunca bloqueia o
// preenchimento, nunca participa de nenhum cálculo de matrícula (ver
// src/lib/enrollmentCalculations.ts, que não foi tocado por esta correção).

export const SCHOOL_YEAR_SETUP_GUIDANCE =
  'Esta escola ainda não possui configuração para 2026. Comece informando a matrícula inicial.';

export const CLASSROOMS_SETUP_GUIDANCE =
  'Cadastre pelo menos uma turma para liberar o registro mensal.';

export const MONTHLY_ENROLLMENT_SETUP_GUIDANCE =
  'Nenhum mês foi registrado ainda.';

// Retorna a mensagem quando o estado ainda não tem o dado, ou null quando
// já existe — o chamador decide se/como renderizar.
export function getSchoolYearSetupGuidance(hasSchoolYear: boolean): string | null {
  return hasSchoolYear ? null : SCHOOL_YEAR_SETUP_GUIDANCE;
}

export function getClassroomsSetupGuidance(hasTurmas: boolean): string | null {
  return hasTurmas ? null : CLASSROOMS_SETUP_GUIDANCE;
}

export function getMonthlyEnrollmentSetupGuidance(hasSnapshots: boolean): string | null {
  return hasSnapshots ? null : MONTHLY_ENROLLMENT_SETUP_GUIDANCE;
}
