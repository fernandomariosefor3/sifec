// Fase 2A — núcleo puro do AuditService.
import { describe, expect, it } from 'vitest';
import { AuditPayloadError, buildAuditLogEntry, type RecordAuditLogInput } from '../src/lib/auditService';

function baseInput(overrides: Partial<RecordAuditLogInput> = {}): RecordAuditLogInput {
  return {
    collectionName: 'school_years',
    documentId: 'diva-cabral_2026',
    schoolId: 'diva-cabral',
    codInep: '23067918',
    anoLetivo: 2026,
    operation: 'update',
    previousValue: { matriculaAtual: 800 },
    newValue: { matriculaAtual: 812 },
    source: 'Manual',
    userId: 'uid-123',
    userEmail: 'super.ativo@example.com',
    now: '2026-03-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildAuditLogEntry', () => {
  it('monta o registro com o id informado', () => {
    const entry = buildAuditLogEntry(baseInput(), 'log-1');
    expect(entry.id).toBe('log-1');
    expect(entry.operation).toBe('update');
    expect(entry.timestamp).toBe('2026-03-10T10:00:00.000Z');
  });

  it('nunca registra um campo "password" em previousValue', () => {
    expect(() =>
      buildAuditLogEntry(baseInput({ previousValue: { password: 'segredo' } }), 'log-2')
    ).toThrow(AuditPayloadError);
  });

  it('nunca registra um campo "token" em newValue', () => {
    expect(() =>
      buildAuditLogEntry(baseInput({ newValue: { authToken: 'xyz' } }), 'log-3')
    ).toThrow(AuditPayloadError);
  });

  it('nunca registra "senha" ou "credencial" (variantes em português)', () => {
    expect(() => buildAuditLogEntry(baseInput({ previousValue: { senha: '123' } }), 'log-4')).toThrow(
      AuditPayloadError
    );
    expect(() => buildAuditLogEntry(baseInput({ newValue: { credencial: 'x' } }), 'log-5')).toThrow(
      AuditPayloadError
    );
  });

  it('aceita valores de negócio comuns sem lançar erro', () => {
    expect(() => buildAuditLogEntry(baseInput(), 'log-6')).not.toThrow();
  });

  it('nunca registra "token" aninhado dentro de outro objeto', () => {
    expect(() =>
      buildAuditLogEntry(baseInput({ newValue: { auth: { token: 'xyz' } } }), 'log-7')
    ).toThrow(AuditPayloadError);
  });

  it('nunca registra "matriculaSige" aninhada', () => {
    expect(() =>
      buildAuditLogEntry(baseInput({ newValue: { aluno: { matriculaSige: '123456' } } }), 'log-8')
    ).toThrow(AuditPayloadError);
  });

  it('nunca registra "dataNascimento" dentro de um array de objetos', () => {
    expect(() =>
      buildAuditLogEntry(
        baseInput({ newValue: { alunos: [{ nome: 'Aluno Um' }, { dataNascimento: '2010-05-01' }] } }),
        'log-9'
      )
    ).toThrow(AuditPayloadError);
  });

  it('nunca registra "idCenso" ou "nomeAluno"', () => {
    expect(() => buildAuditLogEntry(baseInput({ newValue: { idCenso: '999' } }), 'log-10')).toThrow(AuditPayloadError);
    expect(() => buildAuditLogEntry(baseInput({ newValue: { nomeAluno: 'Fulano' } }), 'log-11')).toThrow(AuditPayloadError);
  });

  it('não bloqueia "nome" isoladamente (campo de negócio legítimo, ex.: turmaNome/escolaNome)', () => {
    expect(() =>
      buildAuditLogEntry(baseInput({ newValue: { turmaNome: '3º Ano A', escolaNome: 'EEM Diva Cabral' } }), 'log-12')
    ).not.toThrow();
  });
});
