// Reestruturação SIFEC — Farol do Estudante: núcleo puro, sem Firestore.
import { describe, expect, it } from 'vitest';
import {
  FarolEstudanteValidationError,
  buildFarolArchiveAuditInput,
  buildFarolArchivePayload,
  buildFarolCreateAuditInput,
  buildFarolEstudantePayload,
  buildFarolUpdateAuditInput,
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

  // Correção do code review do PR #19, seção 4: a checagem anterior só
  // media o tamanho da string (10 caracteres) — datas com formato certo mas
  // mês/dia fora de faixa, ou datas que não existem no calendário real,
  // passavam batido.
  it('rejeita mês fora de 01-12', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '2026-13-10' }))).toThrow(FarolEstudanteValidationError);
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '2026-00-10' }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita 30 de fevereiro (data que não existe no calendário real, mesmo com formato correto)', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '2026-02-30' }))).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita 31 de abril (mês de 30 dias)', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '2026-04-31' }))).toThrow(FarolEstudanteValidationError);
  });

  it('aceita 29 de fevereiro em ano bissexto; rejeita em ano não bissexto', () => {
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '2028-02-29' }))).not.toThrow();
    expect(() => validateFarolEstudanteInput(baseInput({ referenceDate: '2026-02-29' }))).toThrow(FarolEstudanteValidationError);
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

  // Correção do code review do PR #19, seção 3: turmaId/turmaNome nunca
  // podem mudar por edição — firestore.rules já bloqueia isso no update,
  // mas a validação aqui dá um erro claro na interface em vez de deixar a
  // gravação falhar só no Firestore.
  it('edição válida (mesma turma) é permitida', () => {
    const existing = buildFarolEstudantePayload(baseInput());
    expect(() => buildFarolEstudantePayload(baseInput({ percentualAcerto: 10 }), existing)).not.toThrow();
  });

  it('rejeita alteração de turmaId na edição', () => {
    const existing = buildFarolEstudantePayload(baseInput());
    expect(() => buildFarolEstudantePayload(baseInput({ turmaId: 'outra-turma' }), existing)).toThrow(FarolEstudanteValidationError);
  });

  it('rejeita alteração de turmaNome na edição, mesmo com turmaId igual', () => {
    const existing = buildFarolEstudantePayload(baseInput());
    expect(() => buildFarolEstudantePayload(baseInput({ turmaNome: '3º Ano B - Vespertino' }), existing)).toThrow(FarolEstudanteValidationError);
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
    const auditInput = buildFarolArchiveAuditInput(archived, existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const serialized = JSON.stringify(auditInput);
    expect(serialized).not.toContain('Nome Sensível Do Estudante');
    expect(serialized.toLowerCase()).not.toContain('estudantenome');
  });

  it('nunca inclui percentualAcerto nem observação no audit_log', () => {
    const withObservacao = buildFarolEstudantePayload(baseInput({ observacao: 'Observação sensível sobre o estudante' }));
    const archived = buildFarolArchivePayload(withObservacao, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const auditInput = buildFarolArchiveAuditInput(archived, withObservacao, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const serialized = JSON.stringify(auditInput);
    expect(serialized).not.toContain('Observação sensível');
    expect(serialized).not.toContain('percentualAcerto');
  });

  it('operação registrada é "archive"', () => {
    const archived = buildFarolArchivePayload(existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const auditInput = buildFarolArchiveAuditInput(archived, existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    expect(auditInput.operation).toBe('archive');
  });

  it('newValue contém só o resumo permitido (id, escola, turma, disciplina, ano, bimestre, status, statusRegistro) — statusRegistro reflete o arquivamento', () => {
    const archived = buildFarolArchivePayload(existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    const auditInput = buildFarolArchiveAuditInput(archived, existing, 'super.a@example.com', '2026-03-20T00:00:00.000Z');
    expect(auditInput.newValue).toEqual({
      itemId: archived.id, schoolId: archived.schoolId, turmaId: archived.turmaId,
      disciplina: archived.disciplina, anoLetivo: archived.anoLetivo, bimestre: archived.bimestre,
      status: archived.status, statusRegistro: 'arquivado',
    });
    expect(auditInput.previousValue).toEqual({
      itemId: existing.id, schoolId: existing.schoolId, turmaId: existing.turmaId,
      disciplina: existing.disciplina, anoLetivo: existing.anoLetivo, bimestre: existing.bimestre,
      status: existing.status, statusRegistro: 'ativo',
    });
  });
});

describe('buildFarolCreateAuditInput / buildFarolUpdateAuditInput', () => {
  it('create: previousValue é null, newValue reflete o registro recém-criado', () => {
    const created = buildFarolEstudantePayload(baseInput());
    const auditInput = buildFarolCreateAuditInput(created, 'super.a@example.com', '2026-03-10T12:00:00.000Z');
    expect(auditInput.operation).toBe('create');
    expect(auditInput.previousValue).toBeNull();
    expect(auditInput.newValue).toEqual({
      itemId: created.id, schoolId: created.schoolId, turmaId: created.turmaId,
      disciplina: created.disciplina, anoLetivo: created.anoLetivo, bimestre: created.bimestre,
      status: created.status, statusRegistro: 'ativo',
    });
  });

  it('create: nunca inclui estudanteNome nem percentualAcerto', () => {
    const created = buildFarolEstudantePayload(baseInput({ estudanteNome: 'Nome Sensível Criação' }));
    const auditInput = buildFarolCreateAuditInput(created, 'super.a@example.com', '2026-03-10T12:00:00.000Z');
    const serialized = JSON.stringify(auditInput);
    expect(serialized).not.toContain('Nome Sensível Criação');
    expect(serialized).not.toContain('percentualAcerto');
  });

  it('update: previousValue/newValue refletem status antes/depois da edição', () => {
    const existing = buildFarolEstudantePayload(baseInput({ status: 'Identificado' }));
    const updated = buildFarolEstudantePayload(baseInput({ status: 'Em acompanhamento', now: '2026-03-15T00:00:00.000Z' }), existing);
    const auditInput = buildFarolUpdateAuditInput(updated, existing, 'super.a@example.com', '2026-03-15T00:00:00.000Z');
    expect(auditInput.operation).toBe('update');
    expect((auditInput.previousValue as { status: string }).status).toBe('Identificado');
    expect((auditInput.newValue as { status: string }).status).toBe('Em acompanhamento');
  });
});
