// Reestruturação SIFEC — Farol do Estudante: núcleo puro, sem Firestore.
import { describe, expect, it } from 'vitest';
import {
  FarolEstudanteValidationError,
  buildFarolArchiveAuditInput,
  buildFarolArchivePayload,
  buildFarolEstudantePayload,
  validateFarolEstudanteInput,
  type SaveFarolEstudanteInput,
} from '../src/lib/farolEstudanteService';
import { FAROL_ACERTO_LIMITE, FAROL_SOURCE_SYSTEM, type FarolEstudanteItem } from '../src/types/farolEstudante';

function baseInput(overrides: Partial<SaveFarolEstudanteInput> = {}): SaveFarolEstudanteInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    disciplina: 'Matemática',
    anoLetivo: 2026,
    bimestre: 1,
    estudanteNome: 'Estudante Exemplo',
    percentualAcerto: 18,
    referenceDate: '2026-03-08',
    status: 'Identificado',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateFarolEstudanteInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateFarolEstudanteInput(baseInput())).not.toThrow();
  });

  it('rejeita nome do estudante vazio', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ estudanteNome: '  ' }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita turma não selecionada', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ turmaId: '', turmaNome: '' }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita disciplina vazia', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ disciplina: '' }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita bimestre fora de 1-4', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ bimestre: 5 as 1 }))).toThrow(FarolEstudanteValidationError);
  });

  it(`rejeita percentual de acerto >= ${FAROL_ACERTO_LIMITE} — a listagem é exclusiva para baixo desempenho`, () => {
    expect(() => validateFarolEstudanteInput(baseInput({ percentualAcerto: FAROL_ACERTO_LIMITE }))).toThrow(FarolEstudanteValidationError);
    expect(() => validateFarolEstudanteInput(baseInput({ percentualAcerto: 100 }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita percentual negativo ou não inteiro', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ percentualAcerto: -1 }))).toThrow(FarolEstudanteValidationError);
    expect(() => validateFarolEstudanteInput(baseInput({ percentualAcerto: 12.5 }))).toThrow(FarolEstudanteValidationError);
  });

  it('aceita percentual zero', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ percentualAcerto: 0 }))).not.toThrow();
  });

  it(`aceita percentual ${FAROL_ACERTO_LIMITE - 1} (o maior valor válido)`, () => {
    expect(() => validateFarolEstudanteInput(baseInput({ percentualAcerto: FAROL_ACERTO_LIMITE - 1 }))).not.toThrow();
  });

  it('rejeita data de referência ausente ou em formato inválido', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '' }))).toThrow(FarolEstudanteValidationError);
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '08/03/2026' }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita status de acompanhamento inválido', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ status: 'Concluído' as SaveFarolEstudanteInput['status'] }))).toThrow(FarolEstudanteValidationError);
  });
});

describe('buildFarolEstudantePayload', () => {
  it('gera um ID novo (opaco) quando não é edição', () => {
    const payload = buildFarolEstudantePayload(baseInput());
    expect(payload.id).toBeTruthy();
    expect(payload.estudanteNome).toBe('Estudante Exemplo');
  });

  it('observação vazia é omitida do payload (nunca grava string vazia)', () => {
    const payload = buildFarolEstudantePayload(baseInput({ observacao: '   ' }));
    expect('observacao' in payload).toBe(false);
  });

  it('preserva o ID e createdAt/createdBy ao editar um registro existente', () => {
    const existing = buildFarolEstudantePayload(baseInput());
    const updated = buildFarolEstudantePayload(baseInput({ percentualAcerto: 5, now: '2026-03-15T00:00:00.000Z' }), existing);
    expect(updated.id).toBe(existing.id);
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.percentualAcerto).toBe(5);
  });

  it('sempre grava a fonte fixa SISEDU Analytics, nunca outra origem', () => {
    const payload = buildFarolEstudantePayload(baseInput());
    expect(payload.sourceSystem).toBe(FAROL_SOURCE_SYSTEM);
  });

  it('grava a data de referência e o status de acompanhamento informados', () => {
    const payload = buildFarolEstudantePayload(baseInput({ referenceDate: '2026-03-05', status: 'Em acompanhamento' }));
    expect(payload.referenceDate).toBe('2026-03-05');
    expect(payload.status).toBe('Em acompanhamento');
  });

  // Correção final da auditoria, seção 2: exclusão física bloqueada para o
  // superintendente comum — statusRegistro é o campo de arquivamento.
  it('novo registro sempre nasce com statusRegistro "ativo"', () => {
    const payload = buildFarolEstudantePayload(baseInput());
    expect(payload.statusRegistro).toBe('ativo');
  });

  it('editar um registro arquivado nunca reativa por acidente — preserva statusRegistro', () => {
    const existing = buildFarolEstudantePayload(baseInput());
    const archived = buildFarolArchivePayload(existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const editedAfterArchive = buildFarolEstudantePayload(baseInput({ percentualAcerto: 3 }), archived);
    expect(editedAfterArchive.statusRegistro).toBe('arquivado');
  });
});

describe('buildFarolArchivePayload', () => {
  it('muda só statusRegistro/updatedAt/updatedBy — preserva todos os demais campos, inclusive estudanteNome', () => {
    const existing = buildFarolEstudantePayload(baseInput());
    const archived = buildFarolArchivePayload(existing, 'super.b@example.com', '2026-03-20T00:00:00.000Z');
    expect(archived.statusRegistro).toBe('arquivado');
    expect(archived.updatedAt).toBe('2026-03-20T00:00:00.000Z');
    expect(archived.updatedBy).toBe('super.b@example.com');
    expect(archived.estudanteNome).toBe(existing.estudanteNome);
    expect(archived.createdAt).toBe(existing.createdAt);
    expect(archived.createdBy).toBe(existing.createdBy);
    expect(archived.id).toBe(existing.id);
  });
});

describe('buildFarolArchiveAuditInput', () => {
  const existing: FarolEstudanteItem = buildFarolEstudantePayload(baseInput({ estudanteNome: 'Nome Sensível Do Estudante' }));

  it('nunca inclui estudanteNome (nem qualquer variação de nome do estudante) no audit_log', () => {
    const archived = buildFarolArchivePayload(existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const auditInput = buildFarolArchiveAuditInput(archived, existing.statusRegistro, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const serialized = JSON.stringify(auditInput);
    expect(serialized).not.toContain('Nome Sensível Do Estudante');
    expect(serialized.toLowerCase()).not.toContain('estudantenome');
  });

  it('operação registrada é "archive"', () => {
    const archived = buildFarolArchivePayload(existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const auditInput = buildFarolArchiveAuditInput(archived, existing.statusRegistro, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    expect(auditInput.operation).toBe('archive');
  });

  it('newValue contém só identificadores não-nominais (turma, disciplina, bimestre, id do registro)', () => {
    const archived = buildFarolArchivePayload(existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const auditInput = buildFarolArchiveAuditInput(archived, existing.statusRegistro, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    expect(auditInput.newValue).toEqual({
      action: 'archive', itemId: archived.id, turmaId: archived.turmaId,
      disciplina: archived.disciplina, bimestre: archived.bimestre,
    });
  });
});
