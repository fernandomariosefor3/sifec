// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": núcleo puro (validação + montagem) da dimensão turma+disciplina,
// sem Firestore. Mesmo padrão de tests/gradeEntryMonitoringService.test.ts.
import { describe, expect, it } from 'vitest';
import {
  GradeEntryMonitoringDisciplineValidationError,
  buildGradeEntryMonitoringByDisciplinePayload,
  validateGradeEntryMonitoringByDisciplineInput,
  type SaveGradeEntryMonitoringByDisciplineInput,
} from '../src/lib/gradeEntryMonitoringDisciplineService';
import { buildGradeEntryMonitoringByDisciplineId } from '../src/lib/deterministicIds';

function baseInput(overrides: Partial<SaveGradeEntryMonitoringByDisciplineInput> = {}): SaveGradeEntryMonitoringByDisciplineInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    bimestre: 1,
    disciplina: 'matematica',
    expectedGradeEntries: 32,
    completedGradeEntries: 30,
    status: 'confirmado',
    referenceDate: '2026-03-10',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateGradeEntryMonitoringByDisciplineInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput())).not.toThrow();
  });

  it('rejeita disciplina fora das 4 áreas conhecidas', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ disciplina: 'artes' as SaveGradeEntryMonitoringByDisciplineInput['disciplina'] })))
      .toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('rejeita bimestre fora de 1-4', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ bimestre: 5 as 1 }))).toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('rejeita lançamentos realizados maiores que os esperados', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ expectedGradeEntries: 10, completedGradeEntries: 11 })))
      .toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('rejeita lançamentos negativos ou não inteiros', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ expectedGradeEntries: -1 }))).toThrow(GradeEntryMonitoringDisciplineValidationError);
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ completedGradeEntries: 1.5 }))).toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('aceita zero esperado e zero realizado (turma sem lançamento previsto ainda)', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ expectedGradeEntries: 0, completedGradeEntries: 0 }))).not.toThrow();
  });

  it('rejeita status fora de rascunho/confirmado', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ status: 'finalizado' as SaveGradeEntryMonitoringByDisciplineInput['status'] })))
      .toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('rejeita data de referência em formato inválido', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ referenceDate: '10/03/2026' }))).toThrow(GradeEntryMonitoringDisciplineValidationError);
  });
});

describe('buildGradeEntryMonitoringByDisciplinePayload', () => {
  it('gera um ID determinístico por escola+ano+bimestre+turma+disciplina', () => {
    const payload = buildGradeEntryMonitoringByDisciplinePayload(baseInput());
    expect(payload.id).toBe(buildGradeEntryMonitoringByDisciplineId('diva-cabral', 2026, 1, 'turma-3a-diva', 'matematica'));
  });

  it('duas disciplinas da mesma turma geram IDs diferentes — nunca colidem', () => {
    const matematica = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplina: 'matematica' }));
    const portugues = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplina: 'linguaPortuguesa' }));
    expect(matematica.id).not.toBe(portugues.id);
  });

  it('preserva o createdAt/createdBy ao editar um registro existente', () => {
    const existing = buildGradeEntryMonitoringByDisciplinePayload(baseInput());
    const updated = buildGradeEntryMonitoringByDisciplinePayload(
      baseInput({ completedGradeEntries: 32, now: '2026-03-15T00:00:00.000Z' }),
      existing
    );
    expect(updated.id).toBe(existing.id);
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.completedGradeEntries).toBe(32);
  });
});
