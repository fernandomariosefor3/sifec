// Fase 2C — núcleo puro do StudentBimesterGradeService (sem Firestore — ver
// tests/studentBimesterGradeServiceFirestore.test.ts para a orquestração
// assíncrona, incluindo a checagem de roster existente/ativo).
import { describe, expect, it } from 'vitest';
import {
  buildStudentBimesterGradePayload,
  isValidBimesterScore,
  StudentBimesterGradeValidationError,
  validateStudentBimesterGradeInput,
  type SaveStudentBimesterGradeInput,
} from '../src/lib/studentBimesterGradeService';
import type { BimesterScores, StudentBimesterGrade } from '../src/types/studentBimesterGrade';

const FULL_SCORES: BimesterScores = { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 };
const EMPTY_SCORES: BimesterScores = { linguaPortuguesa: null, matematica: null, cienciasNatureza: null, cienciasHumanas: null };

function baseInput(overrides: Partial<SaveStudentBimesterGradeInput> = {}): SaveStudentBimesterGradeInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    studentKey: 'a1b2c3d4-uuid',
    bimestre: 1,
    scores: FULL_SCORES,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-03-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('isValidBimesterScore', () => {
  it('null é sempre válido', () => {
    expect(isValidBimesterScore(null)).toBe(true);
  });

  it('nota zero é válida', () => {
    expect(isValidBimesterScore(0)).toBe(true);
  });

  it('nota dez é válida', () => {
    expect(isValidBimesterScore(10)).toBe(true);
  });

  it('nota abaixo de zero é rejeitada', () => {
    expect(isValidBimesterScore(-0.1)).toBe(false);
  });

  it('nota acima de dez é rejeitada', () => {
    expect(isValidBimesterScore(10.1)).toBe(false);
  });

  it('NaN é rejeitado', () => {
    expect(isValidBimesterScore(NaN)).toBe(false);
  });

  it('string numérica é rejeitada (mesmo representando um valor válido)', () => {
    expect(isValidBimesterScore('7.5' as unknown as number)).toBe(false);
  });

  it('até duas casas decimais é válido', () => {
    expect(isValidBimesterScore(7.55)).toBe(true);
  });

  it('mais de duas casas decimais é rejeitado', () => {
    expect(isValidBimesterScore(7.555)).toBe(false);
  });
});

describe('validateStudentBimesterGradeInput', () => {
  it('aceita um input válido com as quatro notas preenchidas', () => {
    expect(() => validateStudentBimesterGradeInput(baseInput())).not.toThrow();
  });

  it('aceita todas as notas null (rascunho vazio)', () => {
    expect(() => validateStudentBimesterGradeInput(baseInput({ scores: EMPTY_SCORES }))).not.toThrow();
  });

  it('rejeita bimestre fora de 1-4', () => {
    expect(() => validateStudentBimesterGradeInput(baseInput({ bimestre: 0 as 1 }))).toThrow(StudentBimesterGradeValidationError);
    expect(() => validateStudentBimesterGradeInput(baseInput({ bimestre: 5 as 1 }))).toThrow(StudentBimesterGradeValidationError);
  });

  it('rejeita qualquer nota inválida (NaN, fora do intervalo, mais de duas casas)', () => {
    expect(() => validateStudentBimesterGradeInput(baseInput({ scores: { ...FULL_SCORES, matematica: NaN } }))).toThrow(
      StudentBimesterGradeValidationError
    );
    expect(() => validateStudentBimesterGradeInput(baseInput({ scores: { ...FULL_SCORES, matematica: 10.5 } }))).toThrow(
      StudentBimesterGradeValidationError
    );
    expect(() => validateStudentBimesterGradeInput(baseInput({ scores: { ...FULL_SCORES, matematica: -1 } }))).toThrow(
      StudentBimesterGradeValidationError
    );
  });

  it('observação até 500 caracteres é aceita', () => {
    expect(() => validateStudentBimesterGradeInput(baseInput({ observacao: 'x'.repeat(500) }))).not.toThrow();
  });

  it('observação acima de 500 caracteres é rejeitada', () => {
    expect(() => validateStudentBimesterGradeInput(baseInput({ observacao: 'x'.repeat(501) }))).toThrow(
      StudentBimesterGradeValidationError
    );
  });
});

describe('buildStudentBimesterGradePayload', () => {
  it('monta o payload inicial com ID e rosterId determinísticos', () => {
    const payload = buildStudentBimesterGradePayload(baseInput());
    expect(payload.rosterId).toBe('diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid');
    expect(payload.id).toBe('diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid_b1');
    expect(payload.createdAt).toBe('2026-03-01T12:00:00.000Z');
    expect(payload.createdBy).toBe('super.ativo@example.com');
  });

  it('nunca inclui média/percentual/classificação no payload — só os scores brutos', () => {
    const payload = buildStudentBimesterGradePayload(baseInput()) as unknown as Record<string, unknown>;
    expect('media' in payload).toBe(false);
    expect('percentual' in payload).toBe(false);
    expect('classificacao' in payload).toBe(false);
    expect('situacaoPedagogica' in payload).toBe(false);
  });

  it('não duplica o nome do estudante — StudentBimesterGrade nunca tem studentName', () => {
    const payload = buildStudentBimesterGradePayload(baseInput()) as unknown as Record<string, unknown>;
    expect('studentName' in payload).toBe(false);
  });

  it('omite observacao quando ausente (nunca `observacao: undefined`)', () => {
    const payload = buildStudentBimesterGradePayload(baseInput()) as unknown as Record<string, unknown>;
    expect('observacao' in payload).toBe(false);
  });

  it('mês/bimestre diferente gera outro ID (histórico nunca se mistura entre bimestres)', () => {
    const b1 = buildStudentBimesterGradePayload(baseInput({ bimestre: 1 }));
    const b2 = buildStudentBimesterGradePayload(baseInput({ bimestre: 2 }));
    expect(b1.id).not.toBe(b2.id);
    expect(b1.rosterId).toBe(b2.rosterId); // mesmo estudante, mesmo roster
  });

  it('observacao ausente (undefined) preserva o valor existente na atualização', () => {
    const original = buildStudentBimesterGradePayload(baseInput({ observacao: 'Observação original' }));
    const corrigido = buildStudentBimesterGradePayload(baseInput({ observacao: undefined }), original);
    expect(corrigido.observacao).toBe('Observação original');
  });

  it('observacao explicitamente null remove o valor existente (nunca preserva o antigo)', () => {
    const original = buildStudentBimesterGradePayload(baseInput({ observacao: 'Observação original' }));
    const corrigido = buildStudentBimesterGradePayload(baseInput({ observacao: null }), original) as unknown as Record<string, unknown>;
    expect('observacao' in corrigido).toBe(false);
  });

  it('observacao com novo texto substitui o valor existente', () => {
    const original = buildStudentBimesterGradePayload(baseInput({ observacao: 'Observação original' }));
    const corrigido = buildStudentBimesterGradePayload(baseInput({ observacao: 'Nova observação' }), original);
    expect(corrigido.observacao).toBe('Nova observação');
  });

  it('atualização preserva createdAt/createdBy do registro existente', () => {
    const original: StudentBimesterGrade = buildStudentBimesterGradePayload(baseInput());
    const corrigido = buildStudentBimesterGradePayload(
      baseInput({ scores: { ...FULL_SCORES, matematica: 9 }, actingUserEmail: 'quem-corrigiu@example.com', now: '2026-03-05T09:00:00.000Z' }),
      original
    );
    expect(corrigido.id).toBe(original.id);
    expect(corrigido.createdAt).toBe(original.createdAt);
    expect(corrigido.createdBy).toBe(original.createdBy);
    expect(corrigido.updatedAt).toBe('2026-03-05T09:00:00.000Z');
    expect(corrigido.updatedBy).toBe('quem-corrigiu@example.com');
    expect(corrigido.scores.matematica).toBe(9);
  });
});
