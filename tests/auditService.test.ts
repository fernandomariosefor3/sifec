// Fase 2A — núcleo puro do AuditService.
// Hotfix Fase 2B — "Function setDoc() called with invalid data. Unsupported
// field value: undefined (found in field importBatchId...)": buildAuditLogEntry
// incluía schoolId/codInep/anoLetivo/importBatchId diretamente, então um
// campo opcional ausente virava `campo: undefined` no payload — o Firestore
// rejeita undefined em qualquer profundidade. stripUndefinedDeep (usada
// internamente por buildAuditLogEntry) e o conditional spread dos campos
// opcionais de nível raiz eliminam isso pela raiz.
import { describe, expect, it } from 'vitest';
import { AuditPayloadError, buildAuditLogEntry, stripUndefinedDeep, type RecordAuditLogInput } from '../src/lib/auditService';

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

  // Correção final da auditoria da reestruturação, seção 2: garantia
  // estrutural de que o audit_log de arquivamento do Farol do Estudante
  // nunca inclui o nome do estudante, mesmo que um chamador futuro esqueça
  // de sanitizar o payload manualmente (ver buildFarolArchiveAuditInput em
  // farolEstudanteService.ts, que já nasce sem esse campo).
  it('nunca registra "estudanteNome" (Farol do Estudante)', () => {
    expect(() => buildAuditLogEntry(baseInput({ newValue: { estudanteNome: 'Fulano' } }), 'log-11b')).toThrow(AuditPayloadError);
    expect(() => buildAuditLogEntry(baseInput({ previousValue: { estudanteNome: 'Fulano' } }), 'log-11c')).toThrow(AuditPayloadError);
  });

  it('não bloqueia "nome" isoladamente (campo de negócio legítimo, ex.: turmaNome/escolaNome)', () => {
    expect(() =>
      buildAuditLogEntry(baseInput({ newValue: { turmaNome: '3º Ano A', escolaNome: 'EEM Diva Cabral' } }), 'log-12')
    ).not.toThrow();
  });

  it('importBatchId ausente não aparece no payload (nunca `importBatchId: undefined`)', () => {
    const entry = buildAuditLogEntry(baseInput({ importBatchId: undefined }), 'log-13') as unknown as Record<string, unknown>;
    expect('importBatchId' in entry).toBe(false);
  });

  it('schoolId ausente não aparece no payload', () => {
    const entry = buildAuditLogEntry(baseInput({ schoolId: undefined }), 'log-14') as unknown as Record<string, unknown>;
    expect('schoolId' in entry).toBe(false);
  });

  it('codInep ausente não aparece no payload', () => {
    const entry = buildAuditLogEntry(baseInput({ codInep: undefined }), 'log-15') as unknown as Record<string, unknown>;
    expect('codInep' in entry).toBe(false);
  });

  it('anoLetivo ausente não aparece no payload', () => {
    const entry = buildAuditLogEntry(baseInput({ anoLetivo: undefined }), 'log-16') as unknown as Record<string, unknown>;
    expect('anoLetivo' in entry).toBe(false);
  });

  it('undefined aninhado em previousValue é removido do payload final', () => {
    const entry = buildAuditLogEntry(
      baseInput({ previousValue: { matriculaAtual: 800, observacao: undefined } }),
      'log-17'
    );
    expect(entry.previousValue).toEqual({ matriculaAtual: 800 });
  });

  it('undefined aninhado em newValue é removido do payload final', () => {
    const entry = buildAuditLogEntry(
      baseInput({ newValue: { matriculaAtual: 812, sourceSystem: undefined } }),
      'log-18'
    );
    expect(entry.newValue).toEqual({ matriculaAtual: 812 });
  });
});

describe('stripUndefinedDeep', () => {
  it('remove propriedades undefined de um objeto simples', () => {
    expect(stripUndefinedDeep({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('remove undefined recursivamente em objetos aninhados', () => {
    expect(stripUndefinedDeep({ a: { b: undefined, c: 2 }, d: undefined })).toEqual({ a: { c: 2 } });
  });

  it('arrays com objetos e undefined são tratados corretamente — elementos válidos preservados, undefined removido, objetos limpos internamente', () => {
    const result = stripUndefinedDeep([
      { nome: 'Turma A', observacao: undefined },
      undefined,
      { nome: 'Turma B' },
    ]);
    expect(result).toEqual([{ nome: 'Turma A' }, { nome: 'Turma B' }]);
  });

  it('preserva null (nunca remove nem converte)', () => {
    expect(stripUndefinedDeep({ a: null })).toEqual({ a: null });
  });

  it('preserva zero', () => {
    expect(stripUndefinedDeep({ a: 0 })).toEqual({ a: 0 });
  });

  it('preserva false', () => {
    expect(stripUndefinedDeep({ a: false })).toEqual({ a: false });
  });

  it('preserva string vazia', () => {
    expect(stripUndefinedDeep({ a: '' })).toEqual({ a: '' });
  });

  it('nunca converte undefined em null — a chave some, não vira null', () => {
    const result = stripUndefinedDeep({ a: undefined }) as Record<string, unknown>;
    expect('a' in result).toBe(false);
    expect(result.a).not.toBe(null);
  });

  it('preserva objetos especiais (ex.: Date) sem recursão, mesmo aninhados', () => {
    const date = new Date('2026-03-10T10:00:00.000Z');
    const result = stripUndefinedDeep({ criadoEm: date }) as { criadoEm: Date };
    expect(result.criadoEm).toBe(date);
    expect(result.criadoEm instanceof Date).toBe(true);
  });

  it('não modifica o objeto original (retorna uma cópia nova)', () => {
    const original = { a: 1, b: undefined, c: { d: undefined, e: 2 } };
    const result = stripUndefinedDeep(original);
    expect(result).not.toBe(original);
    expect(result.c).not.toBe(original.c);
    expect('b' in original).toBe(true);
    expect('d' in original.c).toBe(true);
  });
});
