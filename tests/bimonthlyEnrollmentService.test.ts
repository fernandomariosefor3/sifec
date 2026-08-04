// Reestruturação SIFEC — Gestão de Escolas simplificada: núcleo puro de
// bimonthlyEnrollmentService (matrícula por bimestre), sem Firestore —
// mesmo padrão de tests/gradeEntryMonitoringService.test.ts.
import { describe, expect, it } from 'vitest';
import {
  BimonthlyEnrollmentValidationError,
  buildBimonthlyEnrollmentPayload,
  validateBimonthlyEnrollmentInput,
  type SaveBimonthlyEnrollmentInput,
} from '../src/lib/bimonthlyEnrollmentService';
import { buildBimonthlyEnrollmentId } from '../src/lib/deterministicIds';
import type { BimonthlyEnrollment } from '../src/types/bimonthlyEnrollment';

function baseInput(overrides: Partial<SaveBimonthlyEnrollmentInput> = {}): SaveBimonthlyEnrollmentInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    bimestre: 1,
    matricula: 812,
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('buildBimonthlyEnrollmentId', () => {
  it('monta o ID por escola+ano+bimestre', () => {
    expect(buildBimonthlyEnrollmentId('diva-cabral', 2026, 1)).toBe('diva-cabral_2026_b1');
  });
});

describe('validateBimonthlyEnrollmentInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateBimonthlyEnrollmentInput(baseInput())).not.toThrow();
  });

  it('rejeita ano letivo fora do intervalo 2000-2100', () => {
    expect(() => validateBimonthlyEnrollmentInput(baseInput({ anoLetivo: 1999 }))).toThrow(BimonthlyEnrollmentValidationError);
  });

  it('rejeita bimestre fora de 1-4', () => {
    expect(() => validateBimonthlyEnrollmentInput(baseInput({ bimestre: 0 as 1 }))).toThrow(BimonthlyEnrollmentValidationError);
    expect(() => validateBimonthlyEnrollmentInput(baseInput({ bimestre: 5 as 1 }))).toThrow(BimonthlyEnrollmentValidationError);
  });

  it('rejeita matrícula negativa', () => {
    expect(() => validateBimonthlyEnrollmentInput(baseInput({ matricula: -1 }))).toThrow(BimonthlyEnrollmentValidationError);
  });

  it('rejeita matrícula não inteira', () => {
    expect(() => validateBimonthlyEnrollmentInput(baseInput({ matricula: 12.5 }))).toThrow(BimonthlyEnrollmentValidationError);
  });

  it('aceita matrícula zero', () => {
    expect(() => validateBimonthlyEnrollmentInput(baseInput({ matricula: 0 }))).not.toThrow();
  });
});

describe('buildBimonthlyEnrollmentPayload', () => {
  it('monta o payload com o ID determinístico correto', () => {
    const payload = buildBimonthlyEnrollmentPayload(baseInput());
    expect(payload.id).toBe('diva-cabral_2026_b1');
    expect(payload.matricula).toBe(812);
  });

  it('preserva createdAt/createdBy de um registro existente (correção do mesmo bimestre)', () => {
    const existing: BimonthlyEnrollment = {
      id: 'diva-cabral_2026_b1', schoolId: 'diva-cabral', codInep: '23067918', escolaNome: 'EEM Diva Cabral',
      anoLetivo: 2026, bimestre: 1, matricula: 800,
      createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
      createdBy: 'super.antigo@example.com', updatedBy: 'super.antigo@example.com',
    };
    const payload = buildBimonthlyEnrollmentPayload(baseInput({ matricula: 820 }), existing);
    expect(payload.createdAt).toBe('2026-02-01T00:00:00.000Z');
    expect(payload.createdBy).toBe('super.antigo@example.com');
    expect(payload.updatedBy).toBe('super.a@example.com');
    expect(payload.matricula).toBe(820);
  });

  it('cada bimestre tem um ID próprio — nunca sobrescreve outro bimestre', () => {
    const b1 = buildBimonthlyEnrollmentPayload(baseInput({ bimestre: 1 }));
    const b2 = buildBimonthlyEnrollmentPayload(baseInput({ bimestre: 2 }));
    expect(b1.id).not.toBe(b2.id);
  });
});
