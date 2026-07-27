// Fase 2A — núcleo puro do EnrollmentSnapshotService (sem Firestore: as
// funções assíncronas do arquivo real só orquestram getDoc/setDoc em torno
// deste núcleo, que é o que se testa aqui).
import { describe, expect, it } from 'vitest';
import {
  buildEnrollmentSnapshotPayload,
  EnrollmentSnapshotValidationError,
  validateEnrollmentSnapshotInput,
  type SaveEnrollmentSnapshotInput,
} from '../src/lib/enrollmentSnapshotService';

function baseInput(overrides: Partial<SaveEnrollmentSnapshotInput> = {}): SaveEnrollmentSnapshotInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    turmaId: 'turma-3a-diva',
    turmaNome: '3º Ano A - Matutino',
    anoLetivo: 2026,
    mesReferencia: '2026-02',
    matriculaInicioMes: 30,
    novasMatriculas: 2,
    transferenciasEntrada: 0,
    transferenciasSaida: 1,
    abandono: 0,
    outrasSaidas: 0,
    matriculaFimMes: 31,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-02-28T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateEnrollmentSnapshotInput', () => {
  it('aceita um input válido sem divergência', () => {
    expect(() => validateEnrollmentSnapshotInput(baseInput())).not.toThrow();
  });

  it('rejeita mês de referência fora do formato YYYY-MM', () => {
    expect(() => validateEnrollmentSnapshotInput(baseInput({ mesReferencia: '02-2026' }))).toThrow(
      EnrollmentSnapshotValidationError
    );
  });

  it('rejeita valores negativos', () => {
    expect(() => validateEnrollmentSnapshotInput(baseInput({ abandono: -1 }))).toThrow(
      EnrollmentSnapshotValidationError
    );
  });

  it('rejeita valores decimais', () => {
    expect(() => validateEnrollmentSnapshotInput(baseInput({ novasMatriculas: 1.5 }))).toThrow(
      EnrollmentSnapshotValidationError
    );
  });

  it('rejeita mês de referência fora do ano letivo informado', () => {
    expect(() => validateEnrollmentSnapshotInput(baseInput({ mesReferencia: '2027-02', anoLetivo: 2026 }))).toThrow(
      EnrollmentSnapshotValidationError
    );
  });

  it('rejeita divergência sem observação', () => {
    expect(() => validateEnrollmentSnapshotInput(baseInput({ matriculaFimMes: 999 }))).toThrow(
      EnrollmentSnapshotValidationError
    );
  });

  it('aceita divergência quando há observação', () => {
    expect(() =>
      validateEnrollmentSnapshotInput(baseInput({ matriculaFimMes: 999, observacao: 'Conferido com a secretaria.' }))
    ).not.toThrow();
  });
});

describe('buildEnrollmentSnapshotPayload', () => {
  it('marca reviewStatus como manual na primeira gravação sem divergência', () => {
    const payload = buildEnrollmentSnapshotPayload(baseInput());
    expect(payload.reviewStatus).toBe('manual');
    expect(payload.createdAt).toBe('2026-02-28T12:00:00.000Z');
    expect(payload.createdBy).toBe('super.ativo@example.com');
  });

  it('marca reviewStatus como divergencia quando o cálculo não bate', () => {
    const payload = buildEnrollmentSnapshotPayload(
      baseInput({ matriculaFimMes: 999, observacao: 'Divergência sob investigação.' })
    );
    expect(payload.reviewStatus).toBe('divergencia');
  });

  it('gera IDs diferentes para meses diferentes da mesma turma (fevereiro nunca vira março)', () => {
    const fevereiro = buildEnrollmentSnapshotPayload(baseInput({ mesReferencia: '2026-02' }));
    const marco = buildEnrollmentSnapshotPayload(
      baseInput({ mesReferencia: '2026-03', matriculaInicioMes: 31, matriculaFimMes: 32 })
    );
    expect(fevereiro.id).not.toBe(marco.id);
    expect(fevereiro.id).toBe('diva-cabral_turma-3a-diva_2026-02');
    expect(marco.id).toBe('diva-cabral_turma-3a-diva_2026-03');
  });

  it('preserva createdAt/createdBy do snapshot existente ao corrigir o MESMO mês', () => {
    const fevereiroOriginal = buildEnrollmentSnapshotPayload(
      baseInput({ now: '2026-02-28T12:00:00.000Z', actingUserEmail: 'quem-lancou@example.com' })
    );

    const fevereiroCorrigido = buildEnrollmentSnapshotPayload(
      baseInput({
        now: '2026-03-05T09:00:00.000Z',
        actingUserEmail: 'quem-corrigiu@example.com',
      }),
      fevereiroOriginal
    );

    // Mesmo documento (mesmo ID) — é uma correção, não um novo mês.
    expect(fevereiroCorrigido.id).toBe(fevereiroOriginal.id);
    expect(fevereiroCorrigido.createdAt).toBe('2026-02-28T12:00:00.000Z');
    expect(fevereiroCorrigido.createdBy).toBe('quem-lancou@example.com');
    expect(fevereiroCorrigido.updatedAt).toBe('2026-03-05T09:00:00.000Z');
    expect(fevereiroCorrigido.updatedBy).toBe('quem-corrigiu@example.com');
    expect(fevereiroCorrigido.reviewStatus).toBe('corrigido');
  });

  it('corrigir março não altera o conteúdo já calculado para fevereiro (documentos independentes)', () => {
    // fevereiro: 30 + 2 + 0 - 1 - 0 - 0 = 31 (valores default de baseInput)
    const fevereiro = buildEnrollmentSnapshotPayload(baseInput({ mesReferencia: '2026-02' }));
    // marçoOriginal: 31 + 2 + 0 - 1 - 0 - 0 = 32
    const marcoOriginal = buildEnrollmentSnapshotPayload(
      baseInput({ mesReferencia: '2026-03', matriculaInicioMes: 31, matriculaFimMes: 32, novasMatriculas: 2 })
    );
    // marçoCorrigido: 31 + 3 + 0 - 1 - 0 - 0 = 33
    const marcoCorrigido = buildEnrollmentSnapshotPayload(
      baseInput({
        mesReferencia: '2026-03',
        matriculaInicioMes: 31,
        matriculaFimMes: 33,
        novasMatriculas: 3,
        now: '2026-04-01T00:00:00.000Z',
      }),
      marcoOriginal
    );

    expect(marcoCorrigido.id).toBe(marcoOriginal.id);
    expect(marcoCorrigido.matriculaFimMes).toBe(33);
    // fevereiro nunca foi tocado por nenhuma das chamadas de março.
    expect(fevereiro.matriculaFimMes).toBe(31);
    expect(fevereiro.id).not.toBe(marcoCorrigido.id);
  });
});
