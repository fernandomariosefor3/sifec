// Fase 2C — núcleo puro do StudentRosterService (sem Firestore: as funções
// assíncronas do arquivo real só orquestram getDocs/writeBatch em torno
// deste núcleo — ver tests/studentRosterServiceFirestore.test.ts).
import { describe, expect, it } from 'vitest';
import {
  buildStudentRosterPayload,
  normalizeStudentName,
  StudentRosterValidationError,
  validateStudentRosterInput,
  type SaveStudentRosterEntryInput,
} from '../src/lib/studentRosterService';
import type { StudentRosterEntry } from '../src/types/studentRoster';

function baseInput(overrides: Partial<SaveStudentRosterEntryInput> = {}): SaveStudentRosterEntryInput {
  return {
    studentKey: 'a1b2c3d4-uuid',
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    studentName: 'Estudante Teste',
    active: true,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-02-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeStudentName', () => {
  it('remove espaços nas pontas e colapsa espaços duplicados internos', () => {
    expect(normalizeStudentName('  Maria   da   Silva  ')).toBe('Maria da Silva');
  });
});

describe('validateStudentRosterInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateStudentRosterInput(baseInput())).not.toThrow();
  });

  it('rejeita nome com menos de 2 caracteres', () => {
    expect(() => validateStudentRosterInput(baseInput({ studentName: 'A' }))).toThrow(StudentRosterValidationError);
  });

  it('rejeita nome acima de 150 caracteres', () => {
    expect(() => validateStudentRosterInput(baseInput({ studentName: 'A'.repeat(151) }))).toThrow(
      StudentRosterValidationError
    );
  });

  it('nome só com espaços é rejeitado (normalizado fica vazio)', () => {
    expect(() => validateStudentRosterInput(baseInput({ studentName: '   ' }))).toThrow(StudentRosterValidationError);
  });

  it('rejeita ano letivo fora do intervalo 2000-2100', () => {
    expect(() => validateStudentRosterInput(baseInput({ anoLetivo: 1999 }))).toThrow(StudentRosterValidationError);
    expect(() => validateStudentRosterInput(baseInput({ anoLetivo: 2101 }))).toThrow(StudentRosterValidationError);
  });

  it('rejeita ano letivo decimal', () => {
    expect(() => validateStudentRosterInput(baseInput({ anoLetivo: 2026.5 }))).toThrow(StudentRosterValidationError);
  });
});

describe('buildStudentRosterPayload', () => {
  it('monta o payload inicial com o ID determinístico e createdAt/createdBy da primeira gravação', () => {
    const payload = buildStudentRosterPayload(baseInput());
    expect(payload.id).toBe('diva-cabral_2026_turma-3a-diva_a1b2c3d4-uuid');
    expect(payload.createdAt).toBe('2026-02-10T12:00:00.000Z');
    expect(payload.createdBy).toBe('super.ativo@example.com');
    expect(payload.active).toBe(true);
  });

  it('studentKey nunca é derivado do nome — o ID muda só se o studentKey mudar, não o nome', () => {
    const a = buildStudentRosterPayload(baseInput({ studentName: 'Nome A', studentKey: 'fixed-key' }));
    const b = buildStudentRosterPayload(baseInput({ studentName: 'Nome Completamente Diferente', studentKey: 'fixed-key' }));
    expect(a.id).toBe(b.id);
    expect(a.studentKey).toBe(b.studentKey);
  });

  it('normaliza o nome no payload final', () => {
    const payload = buildStudentRosterPayload(baseInput({ studentName: '  Maria   da   Silva  ' }));
    expect(payload.studentName).toBe('Maria da Silva');
  });

  it('omite campos opcionais quando ausentes (nunca `campo: undefined`)', () => {
    const payload = buildStudentRosterPayload(baseInput()) as unknown as Record<string, unknown>;
    expect('sourceSystem' in payload).toBe(false);
    expect('importBatchId' in payload).toBe(false);
  });

  it('atualização preserva createdAt/createdBy do cadastro existente', () => {
    const original: StudentRosterEntry = buildStudentRosterPayload(baseInput());
    const corrigido = buildStudentRosterPayload(
      baseInput({ studentName: 'Nome Corrigido', actingUserEmail: 'quem-corrigiu@example.com', now: '2026-03-01T09:00:00.000Z' }),
      original
    );
    expect(corrigido.id).toBe(original.id);
    expect(corrigido.createdAt).toBe(original.createdAt);
    expect(corrigido.createdBy).toBe(original.createdBy);
    expect(corrigido.updatedAt).toBe('2026-03-01T09:00:00.000Z');
    expect(corrigido.updatedBy).toBe('quem-corrigiu@example.com');
    expect(corrigido.studentName).toBe('Nome Corrigido');
  });

  it('inativação (active: false) preserva o resto do cadastro', () => {
    const original = buildStudentRosterPayload(baseInput());
    const inativado = buildStudentRosterPayload(baseInput({ active: false, now: '2026-04-01T00:00:00.000Z' }), original);
    expect(inativado.active).toBe(false);
    expect(inativado.studentName).toBe(original.studentName);
    expect(inativado.id).toBe(original.id);
  });
});
