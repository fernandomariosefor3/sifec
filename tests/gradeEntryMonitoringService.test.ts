// Fase 2C.1 — núcleo puro do GradeEntryMonitoringService (validação +
// montagem de payload, sem Firestore — mesmo padrão de
// tests/schoolFlowService.test.ts/studentBimesterGradeService.test.ts).
import { describe, expect, it } from 'vitest';
import {
  buildGradeEntryMonitoringPayload,
  GradeEntryMonitoringValidationError,
  validateGradeEntryMonitoringInput,
  type SaveGradeEntryMonitoringInput,
} from '../src/lib/gradeEntryMonitoringService';
import type { GradeEntryMonitoring } from '../src/types/gradeEntryMonitoring';

function baseInput(overrides: Partial<SaveGradeEntryMonitoringInput> = {}): SaveGradeEntryMonitoringInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    bimestre: 1,
    totalStudents: 32,
    studentsWithCompleteGrades: 32,
    studentsWithPartialGrades: 0,
    studentsWithoutGrades: 0,
    expectedGradeEntries: 128,
    completedGradeEntries: 128,
    status: 'confirmado',
    referenceDate: '2026-03-10',
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateGradeEntryMonitoringInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput())).not.toThrow();
  });

  it('rejeita ano letivo fora do intervalo 2000-2100', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ anoLetivo: 1999 }))).toThrow(GradeEntryMonitoringValidationError);
    expect(() => validateGradeEntryMonitoringInput(baseInput({ anoLetivo: 2101 }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('rejeita bimestre fora de 1-4', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ bimestre: 0 as 1 }))).toThrow(GradeEntryMonitoringValidationError);
    expect(() => validateGradeEntryMonitoringInput(baseInput({ bimestre: 5 as 1 }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('rejeita total negativo ou não inteiro em qualquer um dos contadores', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ totalStudents: -1 }))).toThrow(GradeEntryMonitoringValidationError);
    expect(() => validateGradeEntryMonitoringInput(baseInput({ expectedGradeEntries: 1.5 }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('rejeita completedGradeEntries maior que expectedGradeEntries', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ completedGradeEntries: 130, expectedGradeEntries: 128 }))).toThrow(
      GradeEntryMonitoringValidationError
    );
  });

  it('rejeita quando a soma dos três estados de estudante diverge do total', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({
      studentsWithCompleteGrades: 10, studentsWithPartialGrades: 10, studentsWithoutGrades: 5, totalStudents: 32,
    }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('aceita todos os contadores em zero (turma cadastrada, relatório informado, zero real)', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({
      totalStudents: 0, studentsWithCompleteGrades: 0, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
      expectedGradeEntries: 0, completedGradeEntries: 0,
    }))).not.toThrow();
  });

  it('rejeita data de referência com formato inválido', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ referenceDate: '10-03-2026' }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('rejeita data de referência inexistente no calendário (ex.: 30 de fevereiro)', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ referenceDate: '2026-02-30' }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('aceita data de referência válida em ano bissexto (29 de fevereiro)', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ referenceDate: '2028-02-29' }))).not.toThrow();
  });

  it('rejeita observação acima de 500 caracteres', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ observation: 'x'.repeat(501) }))).toThrow(GradeEntryMonitoringValidationError);
  });

  it('aceita observação com exatamente 500 caracteres', () => {
    expect(() => validateGradeEntryMonitoringInput(baseInput({ observation: 'x'.repeat(500) }))).not.toThrow();
  });
});

describe('buildGradeEntryMonitoringPayload', () => {
  it('monta o payload com ID determinístico schoolId_anoLetivo_bBimestre_turmaId', () => {
    const payload = buildGradeEntryMonitoringPayload(baseInput());
    expect(payload.id).toBe('diva-cabral_2026_b1_turma-3a-diva');
    expect(payload.sourceSystem).toBe('SIGE Escola');
    expect(payload.createdAt).toBe('2026-03-10T12:00:00.000Z');
    expect(payload.createdBy).toBe('super.ativo@example.com');
  });

  it('nunca inclui nome de estudante ou qualquer dado nominal', () => {
    const payload = buildGradeEntryMonitoringPayload(baseInput()) as unknown as Record<string, unknown>;
    expect('studentName' in payload).toBe(false);
    expect('rosterId' in payload).toBe(false);
    expect('studentKey' in payload).toBe(false);
  });

  it('omite metadados de origem opcionais quando ausentes (nunca `campo: undefined`)', () => {
    const payload = buildGradeEntryMonitoringPayload(baseInput()) as unknown as Record<string, unknown>;
    expect('sourceReportTitle' in payload).toBe(false);
    expect('sourceFileName' in payload).toBe(false);
    expect('sourceFileHash' in payload).toBe(false);
    expect('observation' in payload).toBe(false);
  });

  it('turma ou bimestre diferente gera outro ID (histórico nunca se mistura)', () => {
    const b1 = buildGradeEntryMonitoringPayload(baseInput({ bimestre: 1 }));
    const b2 = buildGradeEntryMonitoringPayload(baseInput({ bimestre: 2 }));
    const outraTurma = buildGradeEntryMonitoringPayload(baseInput({ turmaId: 'turma-3b-diva' }));
    expect(b1.id).not.toBe(b2.id);
    expect(b1.id).not.toBe(outraTurma.id);
  });

  it('atualização preserva createdAt/createdBy do registro existente', () => {
    const original: GradeEntryMonitoring = buildGradeEntryMonitoringPayload(baseInput());
    const corrigido = buildGradeEntryMonitoringPayload(
      baseInput({ completedGradeEntries: 100, actingUserEmail: 'quem-corrigiu@example.com', now: '2026-03-15T09:00:00.000Z' }),
      original
    );
    expect(corrigido.id).toBe(original.id);
    expect(corrigido.createdAt).toBe(original.createdAt);
    expect(corrigido.createdBy).toBe(original.createdBy);
    expect(corrigido.updatedAt).toBe('2026-03-15T09:00:00.000Z');
    expect(corrigido.updatedBy).toBe('quem-corrigiu@example.com');
    expect(corrigido.completedGradeEntries).toBe(100);
  });

  it('metadados de origem ausentes na chamada de correção preservam o valor já existente', () => {
    const original = buildGradeEntryMonitoringPayload(baseInput({ sourceReportTitle: 'Relatório original' }));
    const corrigido = buildGradeEntryMonitoringPayload(baseInput({ sourceReportTitle: undefined }), original);
    expect(corrigido.sourceReportTitle).toBe('Relatório original');
  });

  it('metadados de origem reenviados substituem o valor existente', () => {
    const original = buildGradeEntryMonitoringPayload(baseInput({ sourceReportTitle: 'Relatório original' }));
    const corrigido = buildGradeEntryMonitoringPayload(baseInput({ sourceReportTitle: 'Relatório novo' }), original);
    expect(corrigido.sourceReportTitle).toBe('Relatório novo');
  });

  describe('observation: undefined preserva, null remove explicitamente', () => {
    it('observation ausente (undefined) na correção preserva o valor existente', () => {
      const original = buildGradeEntryMonitoringPayload(baseInput({ observation: 'Observação original' }));
      const corrigido = buildGradeEntryMonitoringPayload(baseInput({ observation: undefined }), original);
      expect(corrigido.observation).toBe('Observação original');
    });

    it('observation explicitamente null remove o valor existente (nunca preserva o antigo)', () => {
      const original = buildGradeEntryMonitoringPayload(baseInput({ observation: 'Observação original' }));
      const corrigido = buildGradeEntryMonitoringPayload(baseInput({ observation: null }), original) as unknown as Record<string, unknown>;
      expect('observation' in corrigido).toBe(false);
    });

    it('observation com novo texto substitui o valor existente', () => {
      const original = buildGradeEntryMonitoringPayload(baseInput({ observation: 'Observação original' }));
      const corrigido = buildGradeEntryMonitoringPayload(baseInput({ observation: 'Observação nova' }), original);
      expect(corrigido.observation).toBe('Observação nova');
    });

    it('null nunca é gravado literalmente no documento — o campo é omitido', () => {
      const payload = buildGradeEntryMonitoringPayload(baseInput({ observation: null })) as unknown as Record<string, unknown>;
      expect('observation' in payload).toBe(false);
    });
  });
});
