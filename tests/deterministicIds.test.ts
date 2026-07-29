// Fase 2A — IDs determinísticos de school_years e enrollment_snapshots.
// Sem Firebase, sem I/O — camada pura (ver src/lib/deterministicIds.ts).
import { describe, expect, it } from 'vitest';
import {
  buildEnrollmentSnapshotId,
  buildSchoolFlowResultId,
  buildSchoolYearId,
  buildStudentBimesterGradeId,
  buildStudentRosterId,
  parseSchoolYearId,
} from '../src/lib/deterministicIds';

describe('buildSchoolYearId', () => {
  it('gera o ID no formato schoolId_anoLetivo', () => {
    expect(buildSchoolYearId('diva-cabral', 2026)).toBe('diva-cabral_2026');
  });

  it('escolas diferentes no mesmo ano geram IDs diferentes', () => {
    expect(buildSchoolYearId('diva-cabral', 2026)).not.toBe(buildSchoolYearId('figueiredo-correia', 2026));
  });

  it('a mesma escola em anos diferentes gera IDs diferentes', () => {
    expect(buildSchoolYearId('diva-cabral', 2026)).not.toBe(buildSchoolYearId('diva-cabral', 2027));
  });
});

describe('parseSchoolYearId', () => {
  it('extrai schoolId e anoLetivo de um ID válido', () => {
    expect(parseSchoolYearId('diva-cabral_2026')).toEqual({ schoolId: 'diva-cabral', anoLetivo: 2026 });
  });

  it('lida com schoolId contendo hífens', () => {
    expect(parseSchoolYearId('eemti-anisio-teixeira_2026')).toEqual({
      schoolId: 'eemti-anisio-teixeira',
      anoLetivo: 2026,
    });
  });

  it('retorna undefined para um ID sem separador', () => {
    expect(parseSchoolYearId('diva-cabral2026')).toBeUndefined();
  });

  it('retorna undefined quando o sufixo não é um ano de 4 dígitos', () => {
    expect(parseSchoolYearId('diva-cabral_26')).toBeUndefined();
  });
});

describe('buildEnrollmentSnapshotId', () => {
  it('gera o ID no formato schoolId_turmaId_YYYY-MM', () => {
    expect(buildEnrollmentSnapshotId('diva-cabral', 'turma-3a-diva', '2026-03')).toBe(
      'diva-cabral_turma-3a-diva_2026-03'
    );
  });

  it('meses diferentes da mesma turma geram IDs diferentes (histórico nunca colide)', () => {
    const fevereiro = buildEnrollmentSnapshotId('diva-cabral', 'turma-3a-diva', '2026-02');
    const marco = buildEnrollmentSnapshotId('diva-cabral', 'turma-3a-diva', '2026-03');
    expect(fevereiro).not.toBe(marco);
  });

  it('turmas diferentes na mesma escola/mês geram IDs diferentes', () => {
    const turmaA = buildEnrollmentSnapshotId('diva-cabral', 'turma-3a-diva', '2026-03');
    const turmaB = buildEnrollmentSnapshotId('diva-cabral', 'turma-3b-diva', '2026-03');
    expect(turmaA).not.toBe(turmaB);
  });
});

describe('buildSchoolFlowResultId', () => {
  it('gera o ID no formato schoolId_anoLetivo', () => {
    expect(buildSchoolFlowResultId('diva-cabral', 2025)).toBe('diva-cabral_2025');
  });

  it('escolas diferentes no mesmo ano geram IDs diferentes', () => {
    expect(buildSchoolFlowResultId('diva-cabral', 2025)).not.toBe(buildSchoolFlowResultId('figueiredo-correia', 2025));
  });

  it('a mesma escola em anos diferentes gera IDs diferentes (histórico nunca colide)', () => {
    expect(buildSchoolFlowResultId('diva-cabral', 2025)).not.toBe(buildSchoolFlowResultId('diva-cabral', 2026));
  });

  it('não depende de nenhuma identidade de superintendente — troca de responsável nunca afeta o ID', () => {
    // Mesma garantia estrutural de buildSchoolYearId/buildEnrollmentSnapshotId
    // (ver tests/schoolYearOwnershipTransfer.test.ts): o ID é função pura de
    // schoolId/anoLetivo, então o histórico nunca se perde numa troca de
    // vínculo em superintendentes/{email}.escolas.
    expect(buildSchoolFlowResultId('diva-cabral', 2025)).toBe('diva-cabral_2025');
  });
});

describe('buildStudentRosterId', () => {
  it('gera o ID no formato schoolId_anoLetivo_turmaId_studentKey', () => {
    expect(buildStudentRosterId('diva-cabral', 2026, 'turma-3a-diva', 'abc-123')).toBe(
      'diva-cabral_2026_turma-3a-diva_abc-123'
    );
  });

  it('studentKeys diferentes na mesma turma geram IDs diferentes', () => {
    const a = buildStudentRosterId('diva-cabral', 2026, 'turma-3a-diva', 'key-a');
    const b = buildStudentRosterId('diva-cabral', 2026, 'turma-3a-diva', 'key-b');
    expect(a).not.toBe(b);
  });

  it('turmas diferentes na mesma escola/ano geram IDs diferentes para o mesmo studentKey', () => {
    const a = buildStudentRosterId('diva-cabral', 2026, 'turma-3a-diva', 'key-a');
    const b = buildStudentRosterId('diva-cabral', 2026, 'turma-3b-diva', 'key-a');
    expect(a).not.toBe(b);
  });

  it('anos letivos diferentes geram IDs diferentes (histórico nunca colide entre anos)', () => {
    const a = buildStudentRosterId('diva-cabral', 2026, 'turma-3a-diva', 'key-a');
    const b = buildStudentRosterId('diva-cabral', 2027, 'turma-3a-diva', 'key-a');
    expect(a).not.toBe(b);
  });

  it('não depende de nenhuma identidade de superintendente', () => {
    expect(buildStudentRosterId('diva-cabral', 2026, 'turma-3a-diva', 'key-a')).toBe(
      'diva-cabral_2026_turma-3a-diva_key-a'
    );
  });
});

describe('buildStudentBimesterGradeId', () => {
  it('gera o ID no formato rosterId_bBimestre', () => {
    expect(buildStudentBimesterGradeId('diva-cabral_2026_turma-3a-diva_key-a', 1)).toBe(
      'diva-cabral_2026_turma-3a-diva_key-a_b1'
    );
  });

  it('bimestres diferentes do mesmo estudante geram IDs diferentes (histórico nunca colide)', () => {
    const rosterId = 'diva-cabral_2026_turma-3a-diva_key-a';
    const b1 = buildStudentBimesterGradeId(rosterId, 1);
    const b2 = buildStudentBimesterGradeId(rosterId, 2);
    expect(b1).not.toBe(b2);
  });

  it('estudantes diferentes (rosterId diferente) no mesmo bimestre geram IDs diferentes', () => {
    const a = buildStudentBimesterGradeId('diva-cabral_2026_turma-3a-diva_key-a', 1);
    const b = buildStudentBimesterGradeId('diva-cabral_2026_turma-3a-diva_key-b', 1);
    expect(a).not.toBe(b);
  });
});
