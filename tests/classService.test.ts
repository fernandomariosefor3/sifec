// Fase 2A — núcleo puro do ClassService (turmas estendidas).
import { describe, expect, it } from 'vitest';
import { buildClassYearFieldsUpdate, getActiveClassroomCount, getClassroomsForSchool } from '../src/lib/classService';
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

  it('cai para nome normalizado quando nem codInep nem id/escolaId batem', () => {
    const turmasSemIdBatendo: Turma[] = [
      { id: 't5', escolaId: 'id-totalmente-diferente', escolaNome: 'EEM DIVA CABRAL ', nome: '5A', ano: '5º Ano', periodo: 'Matutino' },
    ];
    const result = getClassroomsForSchool(turmasSemIdBatendo, { id: 'diva-cabral', nome: 'EEM Diva Cabral' });
    expect(result.map(t => t.id)).toEqual(['t5']);
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
});
