// Correção funcional pós-PR #17 — testes do núcleo puro de correspondência
// de turmas do relatório do SIGE ("Registrar relatório do SIGE").
import { describe, expect, it } from 'vitest';
import { matchTurmaForReportRow } from '../src/lib/sigeReportMatching';
import type { Turma } from '../src/types/classroom';

function turma(overrides: Partial<Turma> = {}): Turma {
  return {
    id: 't1', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral',
    nome: '3º Ano A', ano: '3º Ano', periodo: 'Matutino',
    ...overrides,
  };
}

describe('matchTurmaForReportRow', () => {
  it('turma existente é associada por ID quando o ID informado existe na lista', () => {
    const existentes = [turma({ id: 't1', nome: '3º Ano A' }), turma({ id: 't2', nome: '3º Ano B' })];
    const result = matchTurmaForReportRow({ turmaId: 't2', turmaNome: 'Nome Digitado Diferente' }, existentes);
    expect(result.status).toBe('encontrada');
    expect(result.turma?.id).toBe('t2');
  });

  it('ID informado mas ausente da lista cai para correspondência por nome, nunca falha de imediato', () => {
    const existentes = [turma({ id: 't1', nome: '3º Ano A' })];
    const result = matchTurmaForReportRow({ turmaId: 'id-de-outro-escopo', turmaNome: '3º Ano A' }, existentes);
    expect(result.status).toBe('encontrada');
    expect(result.turma?.id).toBe('t1');
  });

  it('turma existente é associada por nome normalizado (tolerante a caixa/espaço/acento)', () => {
    const existentes = [turma({ id: 't1', nome: 'EEMTI 3º Ano A ' })];
    const result = matchTurmaForReportRow({ turmaNome: 'eemti 3º ano a' }, existentes);
    expect(result.status).toBe('encontrada');
    expect(result.turma?.id).toBe('t1');
  });

  it('turma não existente fica pendente de confirmação (nao_cadastrada)', () => {
    const existentes = [turma({ id: 't1', nome: '3º Ano A' })];
    const result = matchTurmaForReportRow({ turmaNome: '2º Ano C' }, existentes);
    expect(result.status).toBe('nao_cadastrada');
    expect(result.turma).toBeNull();
  });

  it('lista de turmas vazia sempre resulta em nao_cadastrada', () => {
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A' }, []);
    expect(result.status).toBe('nao_cadastrada');
  });

  it('nome bate uma única vez mas turno diverge dos dois lados: ambiguidade nunca resolvida automaticamente', () => {
    const existentes = [turma({ id: 't1', nome: '3º Ano A', turno: 'Matutino' })];
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A', turno: 'Vespertino' }, existentes);
    expect(result.status).toBe('possivel_correspondencia');
    expect(result.turma).toBeNull();
    expect(result.candidates.map(t => t.id)).toEqual(['t1']);
  });

  it('nome ambíguo (duas turmas com o mesmo nome) sem turno informado: possível correspondência, nunca associação automática', () => {
    const existentes = [
      turma({ id: 't1', nome: '3º Ano A', turno: 'Matutino' }),
      turma({ id: 't2', nome: '3º Ano A', turno: 'Vespertino' }),
    ];
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A' }, existentes);
    expect(result.status).toBe('possivel_correspondencia');
    expect(result.candidates.map(t => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('nome ambíguo desempatado pelo turno informado resolve para encontrada', () => {
    const existentes = [
      turma({ id: 't1', nome: '3º Ano A', turno: 'Matutino' }),
      turma({ id: 't2', nome: '3º Ano A', turno: 'Vespertino' }),
    ];
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A', turno: 'vespertino' }, existentes);
    expect(result.status).toBe('encontrada');
    expect(result.turma?.id).toBe('t2');
  });

  it('nome ambíguo com turno informado que não desempata (nenhuma turma tem esse turno) continua possível correspondência', () => {
    const existentes = [
      turma({ id: 't1', nome: '3º Ano A', turno: 'Matutino' }),
      turma({ id: 't2', nome: '3º Ano A', turno: 'Vespertino' }),
    ];
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A', turno: 'Noturno' }, existentes);
    expect(result.status).toBe('possivel_correspondencia');
    expect(result.candidates).toHaveLength(2);
  });

  it('nome ambíguo com turno faltando em uma das turmas candidatas: turno informado ainda desempata pela que tem o campo preenchido', () => {
    const existentes = [
      turma({ id: 't1', nome: '3º Ano A', turno: 'Matutino' }),
      turma({ id: 't2', nome: '3º Ano A', turno: undefined }),
    ];
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A', turno: 'Matutino' }, existentes);
    expect(result.status).toBe('encontrada');
    expect(result.turma?.id).toBe('t1');
  });

  it('a função confia inteiramente na lista já escopada pelo chamador — não filtra escola/ano por conta própria', () => {
    // getClassroomsForSchoolYear já resolve escola+ano ANTES de chegar
    // aqui (ver sigeReportService.ts) — este teste documenta que
    // matchTurmaForReportRow não repete esse escopo, só compara dentro do
    // que recebeu.
    const existentes = [turma({ id: 't1', nome: '3º Ano A', escolaId: 'outra-escola' })];
    const result = matchTurmaForReportRow({ turmaNome: '3º Ano A' }, existentes);
    expect(result.status).toBe('encontrada');
  });
});
