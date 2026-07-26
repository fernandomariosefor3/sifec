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
});
