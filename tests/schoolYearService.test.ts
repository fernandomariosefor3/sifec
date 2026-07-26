// Fase 2A — núcleo puro do SchoolYearService.
import { describe, expect, it } from 'vitest';
import {
  buildSchoolYearPayload,
  SchoolYearValidationError,
  validateSaveSchoolYearInput,
  type SaveSchoolYearInput,
} from '../src/lib/schoolYearService';
import type { SchoolYear } from '../src/types/schoolYear';

function baseInput(overrides: Partial<SaveSchoolYearInput> = {}): SaveSchoolYearInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    quantidadeTurmasAtivas: 6,
    status: 'planejamento',
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-01-05T08:00:00.000Z',
    ...overrides,
  };
}

describe('validateSaveSchoolYearInput', () => {
  it('aceita matriculaInicial/matriculaAtual ausentes (null implícito)', () => {
    expect(() => validateSaveSchoolYearInput(baseInput())).not.toThrow();
  });

  it('rejeita matriculaInicial negativa', () => {
    expect(() => validateSaveSchoolYearInput(baseInput({ matriculaInicial: -5 }))).toThrow(
      SchoolYearValidationError
    );
  });

  it('rejeita matriculaAtual decimal', () => {
    expect(() => validateSaveSchoolYearInput(baseInput({ matriculaAtual: 10.5 }))).toThrow(
      SchoolYearValidationError
    );
  });

  it('rejeita quantidadeTurmasAtivas negativa', () => {
    expect(() => validateSaveSchoolYearInput(baseInput({ quantidadeTurmasAtivas: -1 }))).toThrow(
      SchoolYearValidationError
    );
  });
});

describe('buildSchoolYearPayload', () => {
  it('gera o ID no formato schoolId_anoLetivo', () => {
    const payload = buildSchoolYearPayload(baseInput());
    expect(payload.id).toBe('diva-cabral_2026');
  });

  it('nunca copia matrícula legada automaticamente — matriculaInicial nasce null quando não informada', () => {
    const payload = buildSchoolYearPayload(baseInput());
    expect(payload.matriculaInicial).toBeNull();
    expect(payload.matriculaAtual).toBeNull();
  });

  it('preserva matriculaInicial já gravada quando a chamada atual não a informa', () => {
    const existing: SchoolYear = {
      id: 'diva-cabral_2026',
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      anoLetivo: 2026,
      matriculaInicial: 812,
      matriculaAtual: 800,
      quantidadeTurmasAtivas: 6,
      status: 'ativo',
      dataInicio: '2026-02-02',
      dataFim: null,
      ultimaAtualizacao: '2026-02-02T00:00:00.000Z',
      createdAt: '2026-01-05T08:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      createdBy: 'super.ativo@example.com',
      updatedBy: 'super.ativo@example.com',
    };

    const payload = buildSchoolYearPayload(
      baseInput({ status: 'ativo', quantidadeTurmasAtivas: 7, now: '2026-03-01T00:00:00.000Z' }),
      existing
    );

    expect(payload.matriculaInicial).toBe(812);
    expect(payload.matriculaAtual).toBe(800);
    expect(payload.quantidadeTurmasAtivas).toBe(7);
    expect(payload.createdAt).toBe('2026-01-05T08:00:00.000Z');
  });
});
