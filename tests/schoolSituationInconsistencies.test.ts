// Fase 2D — detecção de inconsistências (sem Firestore). Só sinaliza —
// nunca corrige nada automaticamente (seção 11 do plano).
import { describe, expect, it } from 'vitest';
import { detectInconsistencies, type InconsistencyDetectionInput } from '../src/lib/schoolSituationInconsistencies';
import type { EnrollmentSnapshot } from '../src/types/enrollment';
import type { GradeEntryMonitoring } from '../src/types/gradeEntryMonitoring';
import type { SchoolFlowResult } from '../src/types/schoolFlow';
import type { SchoolSituationSourceAvailability } from '../src/types/schoolSituation';

const AVAILABILITY_ALL: SchoolSituationSourceAvailability = {
  schoolYear: true, turmas: true, snapshots: true, flow: true, gradeEntryMonitoring: true, visitas: true,
};

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

function buildMonitoring(overrides: Partial<GradeEntryMonitoring> = {}): GradeEntryMonitoring {
  return {
    id: 'esc1_2026_b1_t1', schoolId: 'esc1', codInep: '123', escolaNome: 'Escola 1',
    turmaId: 't1', turmaNome: 'Turma A', anoLetivo: 2026, bimestre: 1,
    totalStudents: 30, studentsWithCompleteGrades: 30, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
    expectedGradeEntries: 120, completedGradeEntries: 120, status: 'confirmado', sourceSystem: 'SIGE Escola',
    referenceDate: '2026-04-01',
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
    monitoring: [],
    flowResult: null,
    availability: AVAILABILITY_ALL,
    schoolYearDocs: [{ id: 'esc1_2026' }],
    flowResultDocs: [],
    ...overrides,
  };
}

describe('detectInconsistencies', () => {
  it('conjunto de dados íntegro não gera nenhuma inconsistência', () => {
    const input = baseInput({
      snapshots: [buildSnapshot()],
      monitoring: [buildMonitoring()],
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

  it('acompanhamento de notas vinculado a turma de outra escola é sinalizado', () => {
    const turmaOutraEscola = { id: 't1', schoolId: 'esc2', anoLetivo: 2026, nome: 'Turma A' };
    const input = baseInput({
      turmasById: new Map([['t1', turmaOutraEscola]]),
      monitoring: [buildMonitoring({ turmaId: 't1', schoolId: 'esc1' })],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'grade_entry_monitoring_turma_outra_escola')).toBe(true);
  });

  it('acompanhamento de notas vinculado a turma de outro ano letivo é sinalizado', () => {
    const turmaOutroAno = { id: 't1', schoolId: 'esc1', anoLetivo: 2025, nome: 'Turma A' };
    const input = baseInput({
      turmasById: new Map([['t1', turmaOutroAno]]),
      monitoring: [buildMonitoring({ turmaId: 't1', anoLetivo: 2026 })],
    });
    const result = detectInconsistencies(input);
    expect(result.some(i => i.type === 'grade_entry_monitoring_turma_ano_diferente')).toBe(true);
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

// Revisão do code review do PR #16, seção 6: matricula_final_divergente
// existia no tipo mas nunca era detectada.
describe('matricula_final_divergente', () => {
  it('cálculo correto (matriculaFimMes bate com o esperado) não gera inconsistência', () => {
    const snap = buildSnapshot({
      matriculaInicioMes: 30, novasMatriculas: 2, transferenciasEntrada: 0,
      transferenciasSaida: 1, abandono: 0, outrasSaidas: 0, matriculaFimMes: 31,
    });
    const result = detectInconsistencies(baseInput({ snapshots: [snap] }));
    expect(result.some(i => i.type === 'matricula_final_divergente')).toBe(false);
  });

  it('diferença positiva (matriculaFimMes maior que o esperado) gera inconsistência', () => {
    const snap = buildSnapshot({
      matriculaInicioMes: 30, novasMatriculas: 0, transferenciasEntrada: 0,
      transferenciasSaida: 0, abandono: 0, outrasSaidas: 0, matriculaFimMes: 35,
    });
    const result = detectInconsistencies(baseInput({ snapshots: [snap] }));
    const item = result.find(i => i.type === 'matricula_final_divergente');
    expect(item).toBeDefined();
    expect(item?.message).toContain('35');
    expect(item?.message).toContain('30');
  });

  it('diferença negativa (matriculaFimMes menor que o esperado) gera inconsistência', () => {
    const snap = buildSnapshot({
      matriculaInicioMes: 30, novasMatriculas: 0, transferenciasEntrada: 0,
      transferenciasSaida: 0, abandono: 0, outrasSaidas: 0, matriculaFimMes: 20,
    });
    const result = detectInconsistencies(baseInput({ snapshots: [snap] }));
    expect(result.some(i => i.type === 'matricula_final_divergente')).toBe(true);
  });

  it('valores zero funcionam (matrícula inicial e final ambas zero, sem movimento)', () => {
    const snap = buildSnapshot({
      matriculaInicioMes: 0, novasMatriculas: 0, transferenciasEntrada: 0,
      transferenciasSaida: 0, abandono: 0, outrasSaidas: 0, matriculaFimMes: 0,
    });
    const result = detectInconsistencies(baseInput({ snapshots: [snap] }));
    expect(result.some(i => i.type === 'matricula_final_divergente')).toBe(false);
  });

  it('múltiplos snapshots inconsistentes são todos listados', () => {
    const snap1 = buildSnapshot({ id: 'esc1_t1_2026-01', mesReferencia: '2026-01', matriculaInicioMes: 30, matriculaFimMes: 999 });
    const snap2 = buildSnapshot({ id: 'esc1_t1_2026-02', mesReferencia: '2026-02', matriculaInicioMes: 30, matriculaFimMes: 1 });
    const result = detectInconsistencies(baseInput({ snapshots: [snap1, snap2] }));
    const divergentes = result.filter(i => i.type === 'matricula_final_divergente');
    expect(divergentes).toHaveLength(2);
  });

  it('nunca é detectada quando enrollment_snapshots está indisponível (fonte falhou)', () => {
    const snap = buildSnapshot({ matriculaInicioMes: 30, matriculaFimMes: 999 });
    const result = detectInconsistencies(baseInput({
      snapshots: [snap],
      availability: { ...AVAILABILITY_ALL, snapshots: false },
    }));
    expect(result.some(i => i.type === 'matricula_final_divergente')).toBe(false);
  });
});

// Revisão do code review do PR #16, seção 7: duplicidade real pela chave
// natural, inclusive quando um documento antigo tem ID não canônico — os
// serviços da Sala de Situação usam listagem própria (sem limit(1)) para
// isto, então mais de um documento na lista já é a duplicidade.
describe('registro_duplicado — chave natural por coleção', () => {
  it('school_years: mais de um documento para schoolId+anoLetivo é duplicidade', () => {
    const result = detectInconsistencies(baseInput({
      schoolYearDocs: [{ id: 'esc1_2026' }, { id: 'esc1_2026_legado' }],
    }));
    const item = result.find(i => i.type === 'registro_duplicado' && i.message.includes('school_years'));
    expect(item).toBeDefined();
  });

  it('school_years: um único documento não é duplicidade', () => {
    const result = detectInconsistencies(baseInput({ schoolYearDocs: [{ id: 'esc1_2026' }] }));
    expect(result.some(i => i.type === 'registro_duplicado' && i.message.includes('school_years'))).toBe(false);
  });

  it('school_years: duplicidade não é sinalizada quando a fonte falhou', () => {
    const result = detectInconsistencies(baseInput({
      schoolYearDocs: [{ id: 'esc1_2026' }, { id: 'esc1_2026_legado' }],
      availability: { ...AVAILABILITY_ALL, schoolYear: false },
    }));
    expect(result.some(i => i.type === 'registro_duplicado' && i.message.includes('school_years'))).toBe(false);
  });

  it('school_flow_results: mais de um documento para schoolId+anoLetivo é duplicidade', () => {
    const result = detectInconsistencies(baseInput({
      flowResultDocs: [{ id: 'esc1_2026' }, { id: 'esc1_2026_legado' }],
    }));
    const item = result.find(i => i.type === 'registro_duplicado' && i.message.includes('school_flow_results'));
    expect(item).toBeDefined();
  });

  it('enrollment_snapshots: dois documentos para a mesma turmaId+mesReferencia são duplicidade', () => {
    const snapA = buildSnapshot({ id: 'esc1_t1_2026-03' });
    const snapB = buildSnapshot({ id: 'esc1_t1_2026-03_legado' });
    const result = detectInconsistencies(baseInput({ snapshots: [snapA, snapB] }));
    const item = result.find(i => i.type === 'registro_duplicado' && i.message.includes('enrollment_snapshots'));
    expect(item).toBeDefined();
  });

  it('enrollment_snapshots: turmas/meses diferentes não são duplicidade', () => {
    const snapA = buildSnapshot({ id: 'esc1_t1_2026-03', turmaId: 't1', mesReferencia: '2026-03' });
    const snapB = buildSnapshot({ id: 'esc1_t1_2026-04', turmaId: 't1', mesReferencia: '2026-04' });
    const result = detectInconsistencies(baseInput({ snapshots: [snapA, snapB] }));
    expect(result.some(i => i.type === 'registro_duplicado' && i.message.includes('enrollment_snapshots'))).toBe(false);
  });

  it('grade_entry_monitoring: dois documentos para a mesma turmaId são duplicidade', () => {
    const monA = buildMonitoring({ id: 'esc1_2026_b1_t1' });
    const monB = buildMonitoring({ id: 'esc1_2026_b1_t1_legado' });
    const result = detectInconsistencies(baseInput({ monitoring: [monA, monB] }));
    const item = result.find(i => i.type === 'registro_duplicado' && i.message.includes('grade_entry_monitoring'));
    expect(item).toBeDefined();
  });

  it('grade_entry_monitoring: turmas diferentes não são duplicidade', () => {
    const monA = buildMonitoring({ id: 'esc1_2026_b1_t1', turmaId: 't1' });
    const monB = buildMonitoring({ id: 'esc1_2026_b1_t2', turmaId: 't2' });
    const result = detectInconsistencies(baseInput({ monitoring: [monA, monB] }));
    expect(result.some(i => i.type === 'registro_duplicado' && i.message.includes('grade_entry_monitoring'))).toBe(false);
  });

  it('grade_entry_monitoring: duplicidade não é sinalizada quando a fonte falhou', () => {
    const monA = buildMonitoring({ id: 'esc1_2026_b1_t1' });
    const monB = buildMonitoring({ id: 'esc1_2026_b1_t1_legado' });
    const result = detectInconsistencies(baseInput({
      monitoring: [monA, monB],
      availability: { ...AVAILABILITY_ALL, gradeEntryMonitoring: false },
    }));
    expect(result.some(i => i.type === 'registro_duplicado' && i.message.includes('grade_entry_monitoring'))).toBe(false);
  });
});

describe('disponibilidade das fontes — nenhum diagnóstico a partir de uma fonte que falhou', () => {
  it('grade_entry_monitoring indisponível: nenhuma verificação de turma outra escola/ano diferente/duplicidade roda', () => {
    const turmaOutroAno = { id: 't1', schoolId: 'esc1', anoLetivo: 2025, nome: 'Turma A' };
    const result = detectInconsistencies(baseInput({
      turmasById: new Map([['t1', turmaOutroAno]]),
      monitoring: [buildMonitoring({ turmaId: 't1', anoLetivo: 2026 })],
      availability: { ...AVAILABILITY_ALL, gradeEntryMonitoring: false },
    }));
    expect(result.some(i => i.type === 'grade_entry_monitoring_turma_ano_diferente')).toBe(false);
    expect(result.some(i => i.type === 'grade_entry_monitoring_turma_outra_escola')).toBe(false);
  });

  it('turmas indisponível: registro_duplicado de turmas (mesmo nome normalizado) não roda', () => {
    const result = detectInconsistencies(baseInput({
      turmasDoAno: [
        { id: 't1', schoolId: 'esc1', anoLetivo: 2026, nome: 'Turma A' },
        { id: 't2', schoolId: 'esc1', anoLetivo: 2026, nome: 'turma a' },
      ],
      availability: { ...AVAILABILITY_ALL, turmas: false },
    }));
    expect(result).toEqual([]);
  });

  it('flow indisponível: fluxo_confirmado_total_zero não é sinalizado', () => {
    const result = detectInconsistencies(baseInput({
      flowResult: buildFlow({ aprovados: 0, reprovados: 0, abandono: 0, status: 'confirmado' }),
      availability: { ...AVAILABILITY_ALL, flow: false },
    }));
    expect(result.some(i => i.type === 'fluxo_confirmado_total_zero')).toBe(false);
  });
});
