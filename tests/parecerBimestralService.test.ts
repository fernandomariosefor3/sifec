// Reestruturação SIFEC — Parecer Bimestral: núcleo puro do único dado
// gravado por este módulo (encaminhamentos), sem Firestore.
import { describe, expect, it } from 'vitest';
import {
  ParecerBimestralValidationError,
  buildParecerBimestralNotePayload,
  validateParecerBimestralNoteInput,
  type SaveParecerBimestralNoteInput,
} from '../src/lib/parecerBimestralService';

function baseInput(overrides: Partial<SaveParecerBimestralNoteInput> = {}): SaveParecerBimestralNoteInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    bimestre: 1,
    encaminhamentos: 'Priorizar acompanhamento das turmas com baixo preenchimento de notas.',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateParecerBimestralNoteInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateParecerBimestralNoteInput(baseInput())).not.toThrow();
  });

  it('aceita encaminhamentos vazios (campo opcional na prática)', () => {
    expect(() => validateParecerBimestralNoteInput(baseInput({ encaminhamentos: '' }))).not.toThrow();
  });

  it('rejeita encaminhamentos acima do limite de caracteres', () => {
    expect(() => validateParecerBimestralNoteInput(baseInput({ encaminhamentos: 'x'.repeat(4001) }))).toThrow(ParecerBimestralValidationError);
  });
});

describe('buildParecerBimestralNotePayload', () => {
  it('monta o ID determinístico por escola+ano+bimestre', () => {
    const payload = buildParecerBimestralNotePayload(baseInput());
    expect(payload.id).toBe('diva-cabral_2026_b1');
  });

  it('cada bimestre tem seu próprio registro — nunca sobrescreve outro bimestre', () => {
    const b1 = buildParecerBimestralNotePayload(baseInput({ bimestre: 1 }));
    const b2 = buildParecerBimestralNotePayload(baseInput({ bimestre: 2 }));
    expect(b1.id).not.toBe(b2.id);
  });

  it('preserva createdAt/createdBy ao editar um registro existente do mesmo bimestre', () => {
    const existing = buildParecerBimestralNotePayload(baseInput());
    const updated = buildParecerBimestralNotePayload(
      baseInput({ encaminhamentos: 'Texto revisado.', now: '2026-03-15T00:00:00.000Z' }),
      existing
    );
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.encaminhamentos).toBe('Texto revisado.');
  });
});
