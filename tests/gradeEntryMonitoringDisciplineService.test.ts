// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": núcleo puro (validação + montagem) da dimensão turma+disciplina,
// sem Firestore. Mesmo padrão de tests/gradeEntryMonitoringService.test.ts.
//
// Correção final da auditoria, seção 3: disciplina deixou de ser uma lista
// fechada de 4 áreas — os testes agora cobrem disciplinas reais distintas
// (História/Geografia, Física/Química), nomes com acento/espaço, e o ID
// determinístico derivado do nome normalizado.
import { describe, expect, it } from 'vitest';
import {
  GradeEntryMonitoringDisciplineValidationError,
  buildGradeEntryMonitoringByDisciplinePayload,
  validateGradeEntryMonitoringByDisciplineInput,
  type SaveGradeEntryMonitoringByDisciplineInput,
} from '../src/lib/gradeEntryMonitoringDisciplineService';
import { buildGradeEntryMonitoringByDisciplineId } from '../src/lib/deterministicIds';
import { normalizeDisciplinaId } from '../src/types/gradeEntryMonitoringDiscipline';
import { consolidateGradeEntryMonitoringDisciplineByArea } from '../src/lib/gradeEntryMonitoringCalculations';
import type { GradeEntryMonitoringByDiscipline } from '../src/types/gradeEntryMonitoringDiscipline';

function baseInput(overrides: Partial<SaveGradeEntryMonitoringByDisciplineInput> = {}): SaveGradeEntryMonitoringByDisciplineInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    bimestre: 1,
    disciplinaNome: 'Matemática',
    expectedGradeEntries: 32,
    completedGradeEntries: 30,
    status: 'confirmado',
    referenceDate: '2026-03-10',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeDisciplinaId', () => {
  it('remove acentos, minusculiza e troca espaços por hífen', () => {
    expect(normalizeDisciplinaId('Educação Física')).toBe('educacao-fisica');
    expect(normalizeDisciplinaId('Língua Portuguesa')).toBe('lingua-portuguesa');
  });

  it('nomes iguais a menos de acentuação/maiúsculas geram o mesmo ID (comportamento desejado)', () => {
    expect(normalizeDisciplinaId('MATEMÁTICA')).toBe(normalizeDisciplinaId('matemática'));
    expect(normalizeDisciplinaId(' Matemática ')).toBe(normalizeDisciplinaId('Matemática'));
  });

  it('disciplinas genuinamente diferentes nunca colidem', () => {
    expect(normalizeDisciplinaId('História')).not.toBe(normalizeDisciplinaId('Geografia'));
    expect(normalizeDisciplinaId('Física')).not.toBe(normalizeDisciplinaId('Química'));
  });
});

describe('validateGradeEntryMonitoringByDisciplineInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput())).not.toThrow();
  });

  it('nunca limita a quatro disciplinas — aceita qualquer disciplina real do relatório', () => {
    const disciplinas = ['História', 'Geografia', 'Física', 'Química', 'Biologia', 'Filosofia', 'Sociologia', 'Língua Inglesa', 'Arte', 'Educação Física'];
    disciplinas.forEach(disciplinaNome => {
      expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ disciplinaNome }))).not.toThrow();
    });
  });

  it('rejeita disciplinaNome vazio', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ disciplinaNome: '   ' }))).toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('rejeita disciplinaNome só com símbolos (normalizaria para uma chave vazia)', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ disciplinaNome: '???' }))).toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('rejeita areaConhecimento fora do enum quando informada', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ areaConhecimento: 'Artes Marciais' as SaveGradeEntryMonitoringByDisciplineInput['areaConhecimento'] })))
      .toThrow(GradeEntryMonitoringDisciplineValidationError);
  });

  it('aceita sem areaConhecimento (campo opcional)', () => {
    expect(() => validateGradeEntryMonitoringByDisciplineInput(baseInput({ areaConhecimento: undefined }))).not.toThrow();
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
  it('gera um ID determinístico por escola+ano+bimestre+turma+disciplinaId (normalizado)', () => {
    const payload = buildGradeEntryMonitoringByDisciplinePayload(baseInput());
    expect(payload.id).toBe(buildGradeEntryMonitoringByDisciplineId('diva-cabral', 2026, 1, 'turma-3a-diva', 'matematica'));
    expect(payload.disciplinaId).toBe('matematica');
  });

  it('preserva o nome de exibição exatamente como informado (nunca substitui pela versão normalizada)', () => {
    const payload = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplinaNome: 'Educação Física' }));
    expect(payload.disciplinaNome).toBe('Educação Física');
    expect(payload.disciplinaId).toBe('educacao-fisica');
  });

  it('duas disciplinas reais e distintas da mesma turma geram IDs diferentes — nunca colidem', () => {
    const historia = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplinaNome: 'História' }));
    const geografia = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplinaNome: 'Geografia' }));
    expect(historia.id).not.toBe(geografia.id);
  });

  it('física e química geram IDs diferentes', () => {
    const fisica = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplinaNome: 'Física' }));
    const quimica = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ disciplinaNome: 'Química' }));
    expect(fisica.id).not.toBe(quimica.id);
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

  it('grava areaConhecimento quando informada; omite o campo quando ausente', () => {
    const comArea = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ areaConhecimento: 'Ciências Humanas' }));
    expect(comArea.areaConhecimento).toBe('Ciências Humanas');
    const semArea = buildGradeEntryMonitoringByDisciplinePayload(baseInput({ areaConhecimento: undefined }));
    expect('areaConhecimento' in semArea).toBe(false);
  });
});

describe('consolidateGradeEntryMonitoringDisciplineByArea', () => {
  function entry(overrides: Partial<GradeEntryMonitoringByDiscipline> = {}): GradeEntryMonitoringByDiscipline {
    return {
      id: 'x', schoolId: 'diva-cabral', codInep: '23067918', escolaNome: 'EEM Diva Cabral',
      turmaId: 'turma-3a-diva', turmaNome: '3º Ano A', anoLetivo: 2026, bimestre: 1,
      disciplinaId: 'x', disciplinaNome: 'X', expectedGradeEntries: 10, completedGradeEntries: 5,
      status: 'confirmado', referenceDate: '2026-03-10',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: 'a', updatedBy: 'a',
      ...overrides,
    };
  }

  it('disciplinas da mesma área consolidam corretamente (soma, nunca média)', () => {
    const [humanas] = consolidateGradeEntryMonitoringDisciplineByArea([
      entry({ disciplinaId: 'historia', disciplinaNome: 'História', areaConhecimento: 'Ciências Humanas', expectedGradeEntries: 32, completedGradeEntries: 32 }),
      entry({ disciplinaId: 'geografia', disciplinaNome: 'Geografia', areaConhecimento: 'Ciências Humanas', expectedGradeEntries: 32, completedGradeEntries: 0 }),
    ]);
    expect(humanas.areaConhecimento).toBe('Ciências Humanas');
    expect(humanas.disciplinasNoEscopo).toBe(2);
    expect(humanas.totalExpectedGradeEntries).toBe(64);
    expect(humanas.totalCompletedGradeEntries).toBe(32);
    // soma(realizados)/soma(esperados) = 32/64 = 50% — NUNCA a média simples
    // dos percentuais individuais (100% e 0%, que também daria 50% aqui por
    // coincidência simétrica — ver o teste seguinte, com pesos diferentes,
    // que desfaz essa coincidência).
    expect(humanas.percentualGeral).toBe(50);
  });

  it('a média simples dos percentuais individuais divergiria do resultado correto quando os pesos são diferentes', () => {
    const [area] = consolidateGradeEntryMonitoringDisciplineByArea([
      entry({ disciplinaId: 'a', expectedGradeEntries: 100, completedGradeEntries: 100, areaConhecimento: 'Matemática' }),
      entry({ disciplinaId: 'b', expectedGradeEntries: 10, completedGradeEntries: 0, areaConhecimento: 'Matemática' }),
    ]);
    // Correto: soma(realizados)/soma(esperados) = 100/110 ≈ 90.9%.
    // Errado (média simples dos percentuais): (100% + 0%) / 2 = 50%.
    expect(area.percentualGeral).toBeCloseTo((100 / 110) * 100, 5);
    expect(area.percentualGeral).not.toBe(50);
  });

  it('entradas sem areaConhecimento entram no grupo "Sem área" — nunca descartadas', () => {
    const result = consolidateGradeEntryMonitoringDisciplineByArea([entry({ areaConhecimento: undefined })]);
    expect(result).toHaveLength(1);
    expect(result[0].areaConhecimento).toBe('Sem área');
  });

  it('lista vazia produz resultado vazio', () => {
    expect(consolidateGradeEntryMonitoringDisciplineByArea([])).toEqual([]);
  });

  it('percentual null quando a área inteira tem zero esperado', () => {
    const [area] = consolidateGradeEntryMonitoringDisciplineByArea([
      entry({ expectedGradeEntries: 0, completedGradeEntries: 0, areaConhecimento: 'Matemática' }),
    ]);
    expect(area.percentualGeral).toBeNull();
  });
});
