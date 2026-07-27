// Fase 2A — núcleo puro do ImportService.
import { describe, expect, it } from 'vitest';
import { buildImportId, buildImportRecord, canConfirmImport, type CreateImportInput } from '../src/lib/importService';

const baseInput: CreateImportInput = {
  sourceSystem: 'SIGE Escola',
  reportType: 'Enturmação',
  reportTitle: 'Relação de Enturmação — Março/2026',
  fileName: 'enturmacao-marco-2026.pdf',
  fileHash: 'abc123',
  schoolId: 'diva-cabral',
  codInep: '23067918',
  anoLetivo: 2026,
  preview: { linhas: 32 },
  createdBy: 'super.ativo@example.com',
  now: '2026-03-10T10:00:00.000Z',
};

describe('buildImportId', () => {
  it('gera um ID determinístico por escola e hash do arquivo', () => {
    expect(buildImportId('diva-cabral', 'abc123')).toBe('diva-cabral_abc123');
  });
});

describe('buildImportRecord', () => {
  it('nasce sempre em "analisando", com contadores zerados', () => {
    const record = buildImportRecord(baseInput);
    expect(record.status).toBe('analisando');
    expect(record.recordsRead).toBe(0);
    expect(record.recordsCreated).toBe(0);
    expect(record.recordsUpdated).toBe(0);
    expect(record.recordsIgnored).toBe(0);
    expect(record.inconsistencies).toEqual([]);
  });

  it('nunca nasce confirmado ou processado', () => {
    const record = buildImportRecord(baseInput);
    expect(record.status).not.toBe('confirmado');
    expect(record.status).not.toBe('processado');
    expect(record.confirmedAt).toBeUndefined();
    expect(record.processedAt).toBeUndefined();
  });

  it('usa o ID determinístico escola+hash', () => {
    const record = buildImportRecord(baseInput);
    expect(record.id).toBe('diva-cabral_abc123');
  });
});

describe('canConfirmImport', () => {
  it('admin sempre pode confirmar', () => {
    expect(canConfirmImport(true, false)).toBe(true);
  });

  it('superintendente com acesso de escrita à escola pode confirmar', () => {
    expect(canConfirmImport(false, true)).toBe(true);
  });

  it('superintendente sem vínculo com a escola não pode confirmar', () => {
    expect(canConfirmImport(false, false)).toBe(false);
  });
});
