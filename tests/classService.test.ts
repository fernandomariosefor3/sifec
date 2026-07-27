// Fase 2A — núcleo puro do ClassService (turmas estendidas).
import { describe, expect, it } from 'vitest';
import {
  buildClassroomPayload,
  buildClassYearFieldsUpdate,
  ClassroomValidationError,
  getActiveClassroomCount,
  getClassroomsForSchool,
  isDuplicateClassroom,
  validateCreateClassroomInput,
  type CreateClassroomInput,
} from '../src/lib/classService';
import type { Turma } from '../src/types/classroom';

const turmasDivaCabral: Turma[] = [
  { id: 't1', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral', nome: '3A', ano: '3º Ano', periodo: 'Matutino', schoolId: 'diva-cabral', ativa: true },
  { id: 't2', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral', nome: '3B', ano: '3º Ano', periodo: 'Vespertino', schoolId: 'diva-cabral', ativa: false },
  { id: 't3', escolaId: 'figueiredo-correia', escolaNome: 'EEM Figueiredo Correia', nome: '3A', ano: '3º Ano', periodo: 'Matutino' },
];

describe('getActiveClassroomCount', () => {
  it('conta apenas as turmas com ativa !== false', () => {
    expect(getActiveClassroomCount(turmasDivaCabral)).toBe(2);
  });

  it('turmas legadas sem o campo ativa contam como ativas', () => {
    expect(getActiveClassroomCount([{}, {}])).toBe(2);
  });
});

describe('getClassroomsForSchool', () => {
  it('filtra por schoolId (Fase 2A) quando presente', () => {
    const result = getClassroomsForSchool(turmasDivaCabral, { id: 'diva-cabral', nome: 'EEM Diva Cabral' });
    expect(result.map(t => t.id)).toEqual(['t1', 't2']);
  });

  it('cai para escolaId legado quando schoolId não está preenchido', () => {
    const result = getClassroomsForSchool(turmasDivaCabral, { id: 'figueiredo-correia', nome: 'EEM Figueiredo Correia' });
    expect(result.map(t => t.id)).toEqual(['t3']);
  });

  it('prioriza codInep mesmo quando o id não bate (turma legada com escolaId desatualizado)', () => {
    const turmasComInep: Turma[] = [
      { id: 't4', escolaId: 'id-antigo-divergente', escolaNome: 'EEM Diva Cabral', nome: '4A', ano: '4º Ano', periodo: 'Matutino', codInep: '23067918' },
    ];
    const result = getClassroomsForSchool(turmasComInep, { id: 'diva-cabral', nome: 'Nome Qualquer', codInep: '23067918' });
    expect(result.map(t => t.id)).toEqual(['t4']);
  });

  it('cai para nome normalizado só quando a turma não tem NENHUM identificador estável (legada)', () => {
    const turmaLegadaSemId: Turma[] = [
      { id: 't5', escolaId: '', escolaNome: 'EEM DIVA CABRAL ', nome: '5A', ano: '5º Ano', periodo: 'Matutino' },
    ];
    const result = getClassroomsForSchool(turmaLegadaSemId, { id: 'diva-cabral', nome: 'EEM Diva Cabral' });
    expect(result.map(t => t.id)).toEqual(['t5']);
  });

  it('cascata estrita: mesmo nome e IDs diferentes NÃO associa (não cai para nome)', () => {
    const turmaComIdDivergente: Turma[] = [
      { id: 't6', escolaId: 'id-totalmente-diferente', escolaNome: 'EEM DIVA CABRAL ', nome: '6A', ano: '6º Ano', periodo: 'Matutino' },
    ];
    const result = getClassroomsForSchool(turmaComIdDivergente, { id: 'diva-cabral', nome: 'EEM Diva Cabral' });
    expect(result).toEqual([]);
  });

  it('cascata estrita: mesmo nome e códigos INEP diferentes NÃO associa (não cai para nome)', () => {
    const turmaComInepDivergente: Turma[] = [
      { id: 't7', escolaId: 'diva-cabral', escolaNome: 'EEM DIVA CABRAL ', nome: '7A', ano: '7º Ano', periodo: 'Matutino', codInep: '00000000' },
    ];
    const result = getClassroomsForSchool(turmaComInepDivergente, { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' });
    expect(result).toEqual([]);
  });

  it('não retorna turmas de outra escola quando nada corresponde', () => {
    const result = getClassroomsForSchool(turmasDivaCabral, { id: 'escola-inexistente', nome: 'Escola Que Não Existe' });
    expect(result).toEqual([]);
  });
});

describe('buildClassYearFieldsUpdate', () => {
  it('monta o parcial de atualização com os campos anuais, sem tocar campos legados', () => {
    const update = buildClassYearFieldsUpdate({
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      anoLetivo: 2026,
      modalidade: 'Regular',
      turno: 'Matutino',
      matriculaAtual: 30,
      ativa: true,
      actingUserEmail: 'super.ativo@example.com',
      now: '2026-03-01T00:00:00.000Z',
    });

    expect(update).toMatchObject({
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      anoLetivo: 2026,
      modalidade: 'Regular',
      turno: 'Matutino',
      matriculaAtual: 30,
      ativa: true,
      updatedBy: 'super.ativo@example.com',
    });
    expect(update).not.toHaveProperty('lancamentosBimestre');
    expect(update).not.toHaveProperty('mediaBimestre');
  });

  it('omite por completo campos opcionais ausentes (nunca grava undefined — Firestore rejeita)', () => {
    // Simula "Ativar/Inativar" (seção 7 do plano): só ativa muda.
    const update = buildClassYearFieldsUpdate({
      schoolId: 'diva-cabral',
      codInep: '23067918',
      escolaNome: 'EEM Diva Cabral',
      anoLetivo: 2026,
      ativa: false,
      actingUserEmail: 'super.ativo@example.com',
      now: '2026-03-01T00:00:00.000Z',
    });

    expect(update.ativa).toBe(false);
    expect('serie' in update).toBe(false);
    expect('etapa' in update).toBe(false);
    expect('modalidade' in update).toBe(false);
    expect('turno' in update).toBe(false);
    expect('oferta' in update).toBe(false);
    expect('cargaHoraria' in update).toBe(false);
    expect('matriculaInicial' in update).toBe(false);
    expect('matriculaAtual' in update).toBe(false);
    expect('codigoTurma' in update).toBe(false);
    expect('dataInicio' in update).toBe(false);
    expect('dataEncerramento' in update).toBe(false);
  });
});

function baseCreateInput(overrides: Partial<CreateClassroomInput> = {}): CreateClassroomInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    nome: '3º Ano C',
    serie: '3º Ano',
    etapa: 'Ensino Médio',
    modalidade: 'Regular',
    turno: 'Matutino',
    oferta: 'Regular',
    matriculaInicial: 30,
    ativa: true,
    actingUserEmail: 'super.ativo@example.com',
    now: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateCreateClassroomInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateCreateClassroomInput(baseCreateInput())).not.toThrow();
  });

  it('rejeita nome vazio', () => {
    expect(() => validateCreateClassroomInput(baseCreateInput({ nome: '  ' }))).toThrow(ClassroomValidationError);
  });

  it('rejeita matrícula inicial negativa', () => {
    expect(() => validateCreateClassroomInput(baseCreateInput({ matriculaInicial: -1 }))).toThrow(ClassroomValidationError);
  });

  it('rejeita carga horária decimal', () => {
    expect(() => validateCreateClassroomInput(baseCreateInput({ cargaHoraria: 20.5 }))).toThrow(ClassroomValidationError);
  });

  it('aceita carga horária ausente (campo opcional)', () => {
    expect(() => validateCreateClassroomInput(baseCreateInput())).not.toThrow();
  });
});

describe('isDuplicateClassroom', () => {
  it('detecta duplicata pela mesma escola (schoolId), ano e nome normalizado', () => {
    const existentes: Turma[] = [
      { id: 't1', schoolId: 'diva-cabral', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral', nome: '3º Ano C', ano: '3º Ano', periodo: 'Matutino', anoLetivo: 2026, alunosSinalizados: 0 },
    ];
    expect(isDuplicateClassroom(existentes, { schoolId: 'diva-cabral', anoLetivo: 2026, nome: '3º ANO C ' })).toBe(true);
  });

  it('não considera duplicata quando o ano letivo é diferente', () => {
    const existentes: Turma[] = [
      { id: 't1', schoolId: 'diva-cabral', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral', nome: '3º Ano C', ano: '3º Ano', periodo: 'Matutino', anoLetivo: 2025, alunosSinalizados: 0 },
    ];
    expect(isDuplicateClassroom(existentes, { schoolId: 'diva-cabral', anoLetivo: 2026, nome: '3º Ano C' })).toBe(false);
  });

  it('não considera duplicata quando é outra escola', () => {
    const existentes: Turma[] = [
      { id: 't1', schoolId: 'figueiredo-correia', escolaId: 'figueiredo-correia', escolaNome: 'EEM Figueiredo Correia', nome: '3º Ano C', ano: '3º Ano', periodo: 'Matutino', anoLetivo: 2026, alunosSinalizados: 0 },
    ];
    expect(isDuplicateClassroom(existentes, { schoolId: 'diva-cabral', anoLetivo: 2026, nome: '3º Ano C' })).toBe(false);
  });
});

describe('buildClassroomPayload', () => {
  it('monta o payload com campos legados e novos, sem duplicar turma existente', () => {
    const payload = buildClassroomPayload(baseCreateInput(), 'turma-nova-id');
    expect(payload).toMatchObject({
      id: 'turma-nova-id',
      escolaId: 'diva-cabral',
      escolaNome: 'EEM Diva Cabral',
      nome: '3º Ano C',
      ano: '3º Ano',
      periodo: 'Matutino',
      alunosSinalizados: 0,
      schoolId: 'diva-cabral',
      codInep: '23067918',
      anoLetivo: 2026,
      matriculaInicial: 30,
      matriculaAtual: 30,
      ativa: true,
    });
  });

  it('nunca inclui codigoTurma/cargaHoraria como undefined quando ausentes', () => {
    const payload = buildClassroomPayload(baseCreateInput(), 'turma-nova-id');
    expect('codigoTurma' in payload).toBe(false);
    expect('cargaHoraria' in payload).toBe(false);
  });

  it('inclui codigoTurma/cargaHoraria quando informados', () => {
    const payload = buildClassroomPayload(baseCreateInput({ codigoTurma: 'COD-1', cargaHoraria: 800 }), 'turma-nova-id');
    expect(payload.codigoTurma).toBe('COD-1');
    expect(payload.cargaHoraria).toBe(800);
  });
});
