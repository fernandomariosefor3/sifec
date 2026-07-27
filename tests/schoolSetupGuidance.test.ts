// Correção de usabilidade — mensagens de orientação de estado inicial (ver
// src/lib/schoolSetupGuidance.ts). Puramente informativo, sem I/O.
import { describe, expect, it } from 'vitest';
import {
  CLASSROOMS_SETUP_GUIDANCE,
  getClassroomsSetupGuidance,
  getMonthlyEnrollmentSetupGuidance,
  getSchoolYearSetupGuidance,
  MONTHLY_ENROLLMENT_SETUP_GUIDANCE,
  SCHOOL_YEAR_SETUP_GUIDANCE,
} from '../src/lib/schoolSetupGuidance';

describe('getSchoolYearSetupGuidance', () => {
  it('mostra a mensagem quando a escola ainda não tem school_year de 2026', () => {
    expect(getSchoolYearSetupGuidance(false)).toBe(SCHOOL_YEAR_SETUP_GUIDANCE);
  });

  it('não mostra nada quando já existe school_year', () => {
    expect(getSchoolYearSetupGuidance(true)).toBeNull();
  });
});

describe('getClassroomsSetupGuidance', () => {
  it('mostra a mensagem quando não há turmas', () => {
    expect(getClassroomsSetupGuidance(false)).toBe(CLASSROOMS_SETUP_GUIDANCE);
  });

  it('não mostra nada quando já há turmas', () => {
    expect(getClassroomsSetupGuidance(true)).toBeNull();
  });
});

describe('getMonthlyEnrollmentSetupGuidance', () => {
  it('mostra a mensagem quando nenhum mês foi registrado', () => {
    expect(getMonthlyEnrollmentSetupGuidance(false)).toBe(MONTHLY_ENROLLMENT_SETUP_GUIDANCE);
  });

  it('não mostra nada quando já há snapshots', () => {
    expect(getMonthlyEnrollmentSetupGuidance(true)).toBeNull();
  });
});
