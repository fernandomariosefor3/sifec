// Reestruturação SIFEC — Recomposição (formulário livre): núcleo puro, sem
// Firestore.
import { describe, expect, it } from 'vitest';
import {
  RecomposicaoPlanValidationError,
  buildRecomposicaoPlanPayload,
  validateRecomposicaoPlanInput,
  type SaveRecomposicaoPlanInput,
} from '../src/lib/recomposicaoPlanService';

function baseInput(overrides: Partial<SaveRecomposicaoPlanInput> = {}): SaveRecomposicaoPlanInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    bimestre: 1,
    prazo: 'Até o fim do 2º bimestre',
    areaDisciplina: 'Língua Portuguesa',
    turno: 'Matutino',
    descricao: 'Oficinas de reforço semanais.',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateRecomposicaoPlanInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput())).not.toThrow();
  });

  it('rejeita prazo vazio', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput({ prazo: '  ' }))).toThrow(RecomposicaoPlanValidationError);
  });

  it('rejeita área/disciplina vazia', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput({ areaDisciplina: '' }))).toThrow(RecomposicaoPlanValidationError);
  });

  it('rejeita turno fora da lista permitida', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput({ turno: 'Madrugada' as SaveRecomposicaoPlanInput['turno'] }))).toThrow(RecomposicaoPlanValidationError);
  });

  it('aceita os quatro turnos válidos', () => {
    for (const turno of ['Matutino', 'Vespertino', 'Noturno', 'Integral'] as const) {
      expect(() => validateRecomposicaoPlanInput(baseInput({ turno }))).not.toThrow();
    }
  });

  it('rejeita descrição vazia', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput({ descricao: '' }))).toThrow(RecomposicaoPlanValidationError);
  });

  it('rejeita descrição maior que o limite', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput({ descricao: 'x'.repeat(2001) }))).toThrow(RecomposicaoPlanValidationError);
  });

  it('rejeita bimestre fora de 1-4', () => {
    expect(() => validateRecomposicaoPlanInput(baseInput({ bimestre: 5 as 1 }))).toThrow(RecomposicaoPlanValidationError);
  });
});

describe('buildRecomposicaoPlanPayload', () => {
  it('gera um ID novo (opaco) quando não é edição', () => {
    const payload = buildRecomposicaoPlanPayload(baseInput());
    expect(payload.id).toBeTruthy();
    expect(payload.areaDisciplina).toBe('Língua Portuguesa');
  });

  it('preserva o ID e createdAt ao editar um plano existente', () => {
    const existing = buildRecomposicaoPlanPayload(baseInput());
    const updated = buildRecomposicaoPlanPayload(baseInput({ descricao: 'Plano revisado.' }), existing);
    expect(updated.id).toBe(existing.id);
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.descricao).toBe('Plano revisado.');
  });
});
