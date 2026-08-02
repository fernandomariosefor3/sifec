// Fase 2C.1 — núcleo puro do acompanhamento agregado de preenchimento de
// notas (sem Firestore — ver tests/gradeEntryMonitoringService.test.ts para
// a validação/montagem de payload).
import { describe, expect, it } from 'vitest';
import {
  calculateCompletionPercentage,
  calculatePendingStudents,
  calculateStudentsCompletePercentage,
  classifyTurmaGradeEntryStatus,
  consolidateGradeEntryMonitoring,
  type TurmaGradeEntryRow,
} from '../src/lib/gradeEntryMonitoringCalculations';
import type { GradeEntryMonitoring } from '../src/types/gradeEntryMonitoring';

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

describe('calculateCompletionPercentage', () => {
  it('calcula o percentual a partir de completedGradeEntries/expectedGradeEntries', () => {
    expect(calculateCompletionPercentage({ completedGradeEntries: 60, expectedGradeEntries: 120 })).toBe(50);
  });

  it('expectedGradeEntries zero é null — nunca 0% automático', () => {
    expect(calculateCompletionPercentage({ completedGradeEntries: 0, expectedGradeEntries: 0 })).toBeNull();
  });
});

describe('calculateStudentsCompletePercentage', () => {
  it('calcula o percentual de estudantes com notas completas', () => {
    expect(calculateStudentsCompletePercentage({ studentsWithCompleteGrades: 15, totalStudents: 30 })).toBe(50);
  });

  it('totalStudents zero é null', () => {
    expect(calculateStudentsCompletePercentage({ studentsWithCompleteGrades: 0, totalStudents: 0 })).toBeNull();
  });
});

describe('calculatePendingStudents', () => {
  it('soma parciais e sem notas', () => {
    expect(calculatePendingStudents({ studentsWithPartialGrades: 3, studentsWithoutGrades: 2 })).toBe(5);
  });
});

describe('classifyTurmaGradeEntryStatus', () => {
  it('null (nenhum documento) é "nao_informado" — nunca tratado como zero', () => {
    expect(classifyTurmaGradeEntryStatus(null)).toBe('nao_informado');
  });

  it('completedGradeEntries zero é "sem_preenchimento" (relatório informado, zero real)', () => {
    const monitoring = buildMonitoring({ completedGradeEntries: 0, studentsWithCompleteGrades: 0, studentsWithPartialGrades: 0, studentsWithoutGrades: 30 });
    expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('sem_preenchimento');
  });

  it('completedGradeEntries igual a expectedGradeEntries (> 0) é "completo"', () => {
    expect(classifyTurmaGradeEntryStatus(buildMonitoring())).toBe('completo');
  });

  it('completedGradeEntries entre 0 e expectedGradeEntries é "parcial"', () => {
    const monitoring = buildMonitoring({ completedGradeEntries: 60, studentsWithCompleteGrades: 15, studentsWithPartialGrades: 15, studentsWithoutGrades: 0 });
    expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('parcial');
  });

  it('soma de estudantes divergente de totalStudents é "inconsistente"', () => {
    const monitoring = buildMonitoring({ studentsWithCompleteGrades: 10, studentsWithPartialGrades: 10, studentsWithoutGrades: 5, totalStudents: 30 });
    expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
  });

  it('completedGradeEntries maior que expectedGradeEntries é "inconsistente"', () => {
    const monitoring = buildMonitoring({ completedGradeEntries: 130, expectedGradeEntries: 120 });
    expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
  });

  // Revisão do code review do PR #17, seção 8: mesmo que firestore.rules já
  // impeça a CRIAÇÃO de um documento inválido, o painel ainda precisa
  // classificar corretamente um documento legado/corrompido inserido fora
  // do fluxo normal (ex.: console do Firebase, migração, versão anterior
  // das regras) — qualquer contador negativo, fracionário, NaN ou Infinity
  // é sempre "inconsistente", mesmo quando a comparação numérica "parece"
  // fechar.
  describe('classifica como inconsistente qualquer contador inválido (revisão do PR #17, seção 8)', () => {
    it('contador negativo', () => {
      const monitoring = buildMonitoring({ studentsWithoutGrades: -1, totalStudents: 29 });
      expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
    });

    it('contador fracionário', () => {
      const monitoring = buildMonitoring({ completedGradeEntries: 60.5, expectedGradeEntries: 120 });
      expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
    });

    it('contador NaN', () => {
      const monitoring = buildMonitoring({ completedGradeEntries: NaN });
      expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
    });

    it('contador Infinity — nunca comparado como "sempre menor" ou "sempre maior" sem checagem explícita', () => {
      const monitoring = buildMonitoring({ completedGradeEntries: Infinity, expectedGradeEntries: 120 });
      expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
    });

    it('expectedGradeEntries Infinity com completedGradeEntries finito também é inconsistente', () => {
      const monitoring = buildMonitoring({ completedGradeEntries: 60, expectedGradeEntries: Infinity });
      expect(classifyTurmaGradeEntryStatus(monitoring)).toBe('inconsistente');
    });
  });
});

describe('consolidateGradeEntryMonitoring', () => {
  it('turma sem monitoring conta como sem relatório, nunca como zero preenchido', () => {
    const rows: TurmaGradeEntryRow[] = [{ turmaId: 't1', turmaNome: 'Turma A', monitoring: null }];
    const result = consolidateGradeEntryMonitoring(rows);
    expect(result.turmasCadastradas).toBe(1);
    expect(result.turmasSemRelatorio).toBe(1);
    expect(result.turmasComRelatorio).toBe(0);
  });

  it('classifica turmas completas/parciais/sem preenchimento separadamente', () => {
    const rows: TurmaGradeEntryRow[] = [
      { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({ turmaId: 't1' }) },
      { turmaId: 't2', turmaNome: 'Turma B', monitoring: buildMonitoring({
        turmaId: 't2', completedGradeEntries: 60, studentsWithCompleteGrades: 15, studentsWithPartialGrades: 15, studentsWithoutGrades: 0,
      }) },
      { turmaId: 't3', turmaNome: 'Turma C', monitoring: buildMonitoring({
        turmaId: 't3', completedGradeEntries: 0, studentsWithCompleteGrades: 0, studentsWithPartialGrades: 0, studentsWithoutGrades: 30,
      }) },
    ];
    const result = consolidateGradeEntryMonitoring(rows);
    expect(result.turmasCompletas).toBe(1);
    expect(result.turmasParciais).toBe(1);
    expect(result.turmasSemPreenchimento).toBe(1);
    expect(result.turmasComRelatorio).toBe(3);
  });

  it('percentualPreenchimentoGeral é a soma dos completados / soma dos esperados — nunca a média simples dos percentuais', () => {
    const rows: TurmaGradeEntryRow[] = [
      { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({ turmaId: 't1', expectedGradeEntries: 100, completedGradeEntries: 100 }) },
      { turmaId: 't2', turmaNome: 'Turma B', monitoring: buildMonitoring({
        turmaId: 't2', expectedGradeEntries: 300, completedGradeEntries: 0,
        studentsWithCompleteGrades: 0, studentsWithPartialGrades: 0, studentsWithoutGrades: 30,
      }) },
    ];
    // Média simples dos percentuais seria (100% + 0%) / 2 = 50%; a soma
    // correta é 100/400 = 25%.
    const result = consolidateGradeEntryMonitoring(rows);
    expect(result.percentualPreenchimentoGeral).toBe(25);
  });

  it('percentualPreenchimentoGeral é null quando a soma de expectedGradeEntries das turmas com relatório é zero', () => {
    const rows: TurmaGradeEntryRow[] = [
      { turmaId: 't1', turmaNome: 'Turma A', monitoring: null },
    ];
    const result = consolidateGradeEntryMonitoring(rows);
    expect(result.percentualPreenchimentoGeral).toBeNull();
  });

  // Revisão do code review do PR #17, seção 1: uma turma inconsistente é
  // contada em turmasInconsistentes/turmasComRelatorio (um documento FOI
  // submetido), mas NUNCA soma seus contadores aos totais — um documento
  // inconsistente pode ter negativo/NaN/Infinity/fracionário em qualquer
  // campo, e somar isso contaminaria totalStudents/expectedGradeEntries/
  // completedGradeEntries e, por consequência, percentualPreenchimentoGeral.
  describe('turma inconsistente nunca contamina os totais (revisão do code review do PR #17, seção 1)', () => {
    it('turma inconsistente é contada, mas nunca soma aos totais de estudantes', () => {
      const rows: TurmaGradeEntryRow[] = [
        { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({
          turmaId: 't1', studentsWithCompleteGrades: 10, studentsWithPartialGrades: 10, studentsWithoutGrades: 5, totalStudents: 30,
        }) },
      ];
      const result = consolidateGradeEntryMonitoring(rows);
      expect(result.turmasInconsistentes).toBe(1);
      expect(result.turmasComRelatorio).toBe(1);
      expect(result.totalStudents).toBe(0);
    });

    it('documento inconsistente não altera expectedGradeEntries', () => {
      const rows: TurmaGradeEntryRow[] = [
        { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({
          turmaId: 't1', expectedGradeEntries: 500, completedGradeEntries: 600, // completed > expected: inconsistente
        }) },
      ];
      const result = consolidateGradeEntryMonitoring(rows);
      expect(result.turmasInconsistentes).toBe(1);
      expect(result.expectedGradeEntries).toBe(0);
    });

    it('documento inconsistente não altera completedGradeEntries', () => {
      const rows: TurmaGradeEntryRow[] = [
        { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({
          turmaId: 't1', studentsWithCompleteGrades: 999, totalStudents: 32, // soma de estudantes não bate: inconsistente
        }) },
      ];
      const result = consolidateGradeEntryMonitoring(rows);
      expect(result.turmasInconsistentes).toBe(1);
      expect(result.completedGradeEntries).toBe(0);
    });

    it('contador NaN não produz percentualPreenchimentoGeral NaN', () => {
      const rows: TurmaGradeEntryRow[] = [
        { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({ turmaId: 't1', completedGradeEntries: NaN }) },
      ];
      const result = consolidateGradeEntryMonitoring(rows);
      expect(result.percentualPreenchimentoGeral).toBeNull();
      expect(Number.isNaN(result.percentualPreenchimentoGeral)).toBe(false);
    });

    it('contador Infinity não produz percentualPreenchimentoGeral infinito', () => {
      const rows: TurmaGradeEntryRow[] = [
        { turmaId: 't1', turmaNome: 'Turma A', monitoring: buildMonitoring({ turmaId: 't1', expectedGradeEntries: Infinity }) },
      ];
      const result = consolidateGradeEntryMonitoring(rows);
      expect(result.percentualPreenchimentoGeral).toBeNull();
      expect(result.percentualPreenchimentoGeral).not.toBe(Infinity);
    });

    it('turma válida + turma inconsistente: percentual reflete só a turma válida, nunca um valor enganoso', () => {
      const rows: TurmaGradeEntryRow[] = [
        { turmaId: 't1', turmaNome: 'Turma Válida', monitoring: buildMonitoring({
          turmaId: 't1', expectedGradeEntries: 100, completedGradeEntries: 100,
        }) },
        { turmaId: 't2', turmaNome: 'Turma Inconsistente', monitoring: buildMonitoring({
          turmaId: 't2', expectedGradeEntries: 100, completedGradeEntries: 999, // completed > expected: inconsistente
        }) },
      ];
      const result = consolidateGradeEntryMonitoring(rows);
      expect(result.turmasInconsistentes).toBe(1);
      // Só a turma válida (100/100) entra na soma — nunca (100+999)/(100+100),
      // que produziria um percentual > 100% sem sentido.
      expect(result.expectedGradeEntries).toBe(100);
      expect(result.completedGradeEntries).toBe(100);
      expect(result.percentualPreenchimentoGeral).toBe(100);
    });
  });
});
