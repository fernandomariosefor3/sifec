// Fase 2D — detecção de inconsistências (sem Firestore). Só sinaliza —
// nunca corrige nada automaticamente (seção 11 do plano).
import { describe, expect, it } from 'vitest';
import { detectInconsistencies, type InconsistencyDetectionInput } from '../src/lib/schoolSituationInconsistencies';
import type { EnrollmentSnapshot } from '../src/types/enrollment';
import type { StudentBimesterGrade } from '../src/types/studentBimesterGrade';
import type { StudentRosterEntry } from '../src/types/studentRoster';
import type { SchoolFlowResult } from '../src/types/schoolFlow';

function buildSnapshot(overrides: Partial<EnrollmentSnapshot> = {}): EnrollmentSnapshot {
  return {
    id: 'esc1_t1_2026-03', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1',
    turmaId: 't1', turmaNome: 'Turma A', anoLetivo: 2026, mesReferencia: '2026-03',
    matriculaInicioMes: 30, novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0,
    abandono: 0, outrasSaidas: 0, matriculaFimMes: 30, reviewStatus: 'manual',
    createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildRoster(overrides: Partial<StudentRosterEntry> = {}): StudentRosterEntry {
  return {
    id: 'esc1_2026_t1_s1', studentKey: 's1', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1',
    turmaId: 't1', turmaNome: 'Turma A', anoLetivo: 2026, studentName: 'Estudante Um', active: true,
    createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildGrade(overrides: Partial<StudentBimesterGrade> = {}): StudentBimesterGrade {
  return {
    id: 'esc1_2026_t1_s1_b1', rosterId: 'esc1_2026_t1_s1', studentKey: 's1',
    schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1', turmaId: 't1', turmaNome: 'Turma A',
    anoLetivo: 2026, bimestre: 1,
    scores: { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 },
    createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function buildFlow(overrides: Partial<SchoolFlowResult> = {}): SchoolFlowResult {
  return {
    id: 'esc1_2025', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1', anoLetivo: 2025,
    aprovados: 10, reprovados: 0, abandono: 0, status: 'confirmado',
    createdAt: '2025-12-01T00:00:00.000Z', updatedAt: '2025-12-01T00:00:00.000Z',
    createdBy: 'x@example.com', updatedBy: 'x@example.com',
    ...overrides,
  };
}

function baseInput(overrides: Partial<InconsistencyDetectionInput> = {}): InconsistencyDetectionInput {
  const turma1 = { id: 't1', schoolId: 'esc1', anoLetivo: 2026, nome: 'Turma A' };
  return {
    schoolId: 'esc1',
    codInep: '123',
    anoLetivo: 2026,
    turmasDoAno: [turma1],
    turmasById: new Map([['t1', turma1]]),
    snapshots: [],
    roster: [],
    grades: [],
    flowResult: null,
    ...overrides,
  };
}

describe('detectInconsistencies', () => {
  it('conjunto de dados íntegro não gera nenhuma inconsistência', () => {
    const input = baseInput({
      snapshots: [buildSnapshot()],
      roster: [buildRoster()],
      grades: [buildGrade()],
      flowResult: buildFlow(),
    });
    expect(detectInconsistencies(input)).toEqual([]);
  });

  it('escola sem código INEP é sinalizada', () => {
    const result = detectInconsistencies(baseInput({ codInep: '' }));
    expect(result.some(i => i.type === 'cod_inep_ausente')).toBe(true);
  });

  it('snapshot referenciando turma de outra escola é sinalizado (nunca corrigido)', () => {
    const turmaOutraEscola = { id: 't1', schoolId: 'esc2', anoLetivo: 2026, nome: 'Turma A' };
    const input = baseInput({
      turmasById: new Map([['t1', turmaOutraEscola]]),
      snapshots: [buildSnapshot({ turmaId: 't1', schoolId: 'esc1' })],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'snapshot_turma_outra_escola')).toBe(true);
  });

  it('snapshot com ano letivo diferente da turma referenciada é sinalizado', () => {
    const turmaOutroAno = { id: 't1', schoolId: 'esc1', anoLetivo: 2025, nome: 'Turma A' };
    const input = baseInput({
      turmasById: new Map([['t1', turmaOutroAno]]),
      snapshots: [buildSnapshot({ anoLetivo: 2026 })],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'snapshot_ano_diferente')).toBe(true);
  });

  it('cadastro de estudante vinculado a turma de outro ano letivo é sinalizado', () => {
    const turmaOutroAno = { id: 't1', schoolId: 'esc1', anoLetivo: 2025, nome: 'Turma A' };
    const input = baseInput({
      turmasById: new Map([['t1', turmaOutroAno]]),
      roster: [buildRoster({ anoLetivo: 2026 })],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'roster_turma_ano_diferente')).toBe(true);
  });

  it('nota sem roster correspondente é sinalizada, sem expor nome', () => {
    const input = baseInput({ grades: [buildGrade({ rosterId: 'inexistente' })] });
    const result = detectInconsistencies(input);
    const item = result.find(i => i.type === 'nota_sem_roster');
    expect(item).toBeDefined();
    expect(JSON.stringify(item)).not.toContain('Estudante');
  });

  it('nota de estudante inativo é sinalizada', () => {
    const input = baseInput({
      roster: [buildRoster({ active: false })],
      grades: [buildGrade()],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'nota_estudante_inativo')).toBe(true);
  });

  it('fluxo confirmado com total zero é sinalizado', () => {
    const input = baseInput({ flowResult: buildFlow({ aprovados: 0, reprovados: 0, abandono: 0, status: 'confirmado' }) });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'fluxo_confirmado_total_zero')).toBe(true);
  });

  it('fluxo em rascunho com total zero NÃO é inconsistência (ainda em preenchimento)', () => {
    const input = baseInput({ flowResult: buildFlow({ aprovados: 0, reprovados: 0, abandono: 0, status: 'rascunho' }) });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'fluxo_confirmado_total_zero')).toBe(false);
  });

  it('duas turmas ativas com o mesmo nome normalizado no mesmo ano são sinalizadas como duplicidade', () => {
    const input = baseInput({
      turmasDoAno: [
        { id: 't1', schoolId: 'esc1', anoLetivo: 2026, nome: 'Turma A' },
        { id: 't2', schoolId: 'esc1', anoLetivo: 2026, nome: '  turma a  ' },
      ],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'registro_duplicado')).toBe(true);
  });
});
