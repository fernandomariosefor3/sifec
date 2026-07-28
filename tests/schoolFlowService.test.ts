// Fase 2B — núcleo puro do SchoolFlowService (sem Firestore: as funções
// assíncronas do arquivo real só orquestram getDocs/setDoc em torno deste
// núcleo, que é o que se testa aqui — ver tests/schoolFlowServiceFirestore.test.ts
// para a orquestração assíncrona).
import { describe, expect, it } from 'vitest';
import {
  buildSchoolFlowResultPayload,
  SchoolFlowResultValidationError,
  validateSchoolFlowResultInput,
  type SaveSchoolFlowResultInput,
} from '../src/lib/schoolFlowService';
import type { SchoolFlowResult } from '../src/types/schoolFlow';

function baseInput(overrides: Partial<SaveSchoolFlowResultInput> = {}): SaveSchoolFlowResultInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2025,
    aprovados: 700,
    reprovados: 80,
    abandono: 20,
    status: 'confirmado',
    actingUserEmail: 'super.ativo@example.com',
    now: '2025-12-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateSchoolFlowResultInput', () => {
  it('aceita um input válido confirmado com total > 0', () => {
    expect(() => validateSchoolFlowResultInput(baseInput())).not.toThrow();
  });

  it('rejeita ano letivo fora do intervalo 2000-2100', () => {
    expect(() => validateSchoolFlowResultInput(baseInput({ anoLetivo: 1999 }))).toThrow(SchoolFlowResultValidationError);
    expect(() => validateSchoolFlowResultInput(baseInput({ anoLetivo: 2101 }))).toThrow(SchoolFlowResultValidationError);
  });

  it('rejeita ano letivo decimal', () => {
    expect(() => validateSchoolFlowResultInput(baseInput({ anoLetivo: 2025.5 }))).toThrow(SchoolFlowResultValidationError);
  });

  it('rejeita aprovados/reprovados/abandono negativos', () => {
    expect(() => validateSchoolFlowResultInput(baseInput({ aprovados: -1 }))).toThrow(SchoolFlowResultValidationError);
    expect(() => validateSchoolFlowResultInput(baseInput({ reprovados: -1 }))).toThrow(SchoolFlowResultValidationError);
    expect(() => validateSchoolFlowResultInput(baseInput({ abandono: -1 }))).toThrow(SchoolFlowResultValidationError);
  });

  it('rejeita aprovados/reprovados/abandono decimais', () => {
    expect(() => validateSchoolFlowResultInput(baseInput({ aprovados: 1.5 }))).toThrow(SchoolFlowResultValidationError);
  });

  it('confirmado com total zero é rejeitado', () => {
    expect(() =>
      validateSchoolFlowResultInput(baseInput({ status: 'confirmado', aprovados: 0, reprovados: 0, abandono: 0 }))
    ).toThrow(SchoolFlowResultValidationError);
  });

  it('rascunho com total zero é permitido (ainda em preenchimento)', () => {
    expect(() =>
      validateSchoolFlowResultInput(baseInput({ status: 'rascunho', aprovados: 0, reprovados: 0, abandono: 0 }))
    ).not.toThrow();
  });

  it('observação até 500 caracteres é aceita', () => {
    expect(() => validateSchoolFlowResultInput(baseInput({ observacao: 'x'.repeat(500) }))).not.toThrow();
  });

  it('observação acima de 500 caracteres é rejeitada', () => {
    expect(() => validateSchoolFlowResultInput(baseInput({ observacao: 'x'.repeat(501) }))).toThrow(
      SchoolFlowResultValidationError
    );
  });
});

describe('buildSchoolFlowResultPayload', () => {
  it('monta o payload inicial com o ID determinístico e createdAt/createdBy da primeira gravação', () => {
    const payload = buildSchoolFlowResultPayload(baseInput());
    expect(payload.id).toBe('diva-cabral_2025');
    expect(payload.createdAt).toBe('2025-12-15T12:00:00.000Z');
    expect(payload.createdBy).toBe('super.ativo@example.com');
    expect(payload.updatedAt).toBe('2025-12-15T12:00:00.000Z');
    expect(payload.updatedBy).toBe('super.ativo@example.com');
    expect(payload.aprovados).toBe(700);
  });

  it('nunca inclui percentuais no payload — só os quantitativos brutos e o status', () => {
    const payload = buildSchoolFlowResultPayload(baseInput()) as unknown as Record<string, unknown>;
    expect(payload.percentualAprovacao).toBeUndefined();
    expect(payload.percentualReprovacao).toBeUndefined();
    expect(payload.percentualAbandono).toBeUndefined();
  });

  it('omite observacao por completo quando ausente (nunca `observacao: undefined`)', () => {
    const payload = buildSchoolFlowResultPayload(baseInput()) as unknown as Record<string, unknown>;
    expect('observacao' in payload).toBe(false);
  });

  it('atualização preserva createdAt/createdBy do resultado existente', () => {
    const original: SchoolFlowResult = {
      ...buildSchoolFlowResultPayload(baseInput()),
    };

    const corrigido = buildSchoolFlowResultPayload(
      baseInput({ aprovados: 705, reprovados: 75, actingUserEmail: 'quem-corrigiu@example.com', now: '2026-01-05T09:00:00.000Z' }),
      original
    );

    expect(corrigido.id).toBe(original.id);
    expect(corrigido.createdAt).toBe(original.createdAt);
    expect(corrigido.createdBy).toBe(original.createdBy);
    expect(corrigido.updatedAt).toBe('2026-01-05T09:00:00.000Z');
    expect(corrigido.updatedBy).toBe('quem-corrigiu@example.com');
    expect(corrigido.aprovados).toBe(705);
  });

  it('atualização preserva observação/metadados existentes quando a chamada não os reenvia', () => {
    const original = buildSchoolFlowResultPayload(
      baseInput({ observacao: 'Divergência explicada por transferência tardia.', sourceSystem: 'Manual' })
    );
    const corrigido = buildSchoolFlowResultPayload(baseInput({ aprovados: 701 }), original);
    expect(corrigido.observacao).toBe('Divergência explicada por transferência tardia.');
    expect(corrigido.sourceSystem).toBe('Manual');
  });

  it('atualização substitui observação quando a chamada envia um novo valor', () => {
    const original = buildSchoolFlowResultPayload(baseInput({ observacao: 'Primeira observação.' }));
    const corrigido = buildSchoolFlowResultPayload(baseInput({ observacao: 'Observação atualizada.' }), original);
    expect(corrigido.observacao).toBe('Observação atualizada.');
  });

  it('ano letivo diferente gera outro ID (histórico nunca se mistura entre anos)', () => {
    const ano2025 = buildSchoolFlowResultPayload(baseInput({ anoLetivo: 2025 }));
    const ano2026 = buildSchoolFlowResultPayload(baseInput({ anoLetivo: 2026, status: 'rascunho', aprovados: 0, reprovados: 0, abandono: 0 }));
    expect(ano2025.id).not.toBe(ano2026.id);
  });
});
