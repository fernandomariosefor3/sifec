// Fase 2C — cadastro e notas fictícios para o modo demonstração (seção 15
// do plano). Usado SÓ quando não há usuário Firebase autenticado (ver
// NotasView.tsx) — nunca gravado no Firestore, nunca usado como fallback
// depois de autenticado. Nomes sempre genéricos ("Estudante Demonstração
// NN") — nunca um nome realista, mesmo fictício.
import type { StudentRosterEntry } from '../types/studentRoster';
import type { StudentBimesterGrade } from '../types/studentBimesterGrade';

export const DEMO_SCHOOL_ID = 'diva-cabral';
export const DEMO_COD_INEP = '23067918';
export const DEMO_ESCOLA_NOME = 'EEM Diva Cabral';
export const DEMO_TURMA_ID = 'turma-3a-diva';
export const DEMO_TURMA_NOME = '3º Ano A - Matutino';
export const DEMO_ANO_LETIVO = 2026;
export const DEMO_BIMESTRE = 1;

function demoStudentKey(index: number): string {
  return `demo-student-${index}`;
}

function demoRosterId(index: number): string {
  return `${DEMO_SCHOOL_ID}_${DEMO_ANO_LETIVO}_${DEMO_TURMA_ID}_${demoStudentKey(index)}`;
}

function demoRoster(index: number, active: boolean): StudentRosterEntry {
  return {
    id: demoRosterId(index),
    studentKey: demoStudentKey(index),
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    turmaId: DEMO_TURMA_ID,
    turmaNome: DEMO_TURMA_NOME,
    anoLetivo: DEMO_ANO_LETIVO,
    studentName: `Estudante Demonstração ${String(index).padStart(2, '0')}`,
    active,
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  };
}

export const DEMO_STUDENT_ROSTER: StudentRosterEntry[] = [
  demoRoster(1, true),
  demoRoster(2, true),
  demoRoster(3, true),
  demoRoster(4, true),
  demoRoster(5, false), // inativo — nunca aparece nos indicadores correntes
];

function demoGrade(index: number, scores: StudentBimesterGrade['scores']): StudentBimesterGrade {
  const rosterId = demoRosterId(index);
  return {
    id: `${rosterId}_b${DEMO_BIMESTRE}`,
    rosterId,
    studentKey: demoStudentKey(index),
    schoolId: DEMO_SCHOOL_ID,
    codInep: DEMO_COD_INEP,
    escolaNome: DEMO_ESCOLA_NOME,
    turmaId: DEMO_TURMA_ID,
    turmaNome: DEMO_TURMA_NOME,
    anoLetivo: DEMO_ANO_LETIVO,
    bimestre: DEMO_BIMESTRE,
    scores,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  };
}

export const DEMO_STUDENT_BIMESTER_GRADES: StudentBimesterGrade[] = [
  // Estudante 01: preenchimento completo, acima da referência.
  demoGrade(1, { linguaPortuguesa: 8.5, matematica: 7.2, cienciasNatureza: 9.0, cienciasHumanas: 8.0 }),
  // Estudante 02: preenchimento parcial.
  demoGrade(2, { linguaPortuguesa: 6.0, matematica: null, cienciasNatureza: 5.5, cienciasHumanas: null }),
  // Estudante 03: preenchimento completo, abaixo da referência (6,0).
  demoGrade(3, { linguaPortuguesa: 4.5, matematica: 5.0, cienciasNatureza: 4.8, cienciasHumanas: 5.2 }),
  // Estudante 04: sem nenhuma nota registrada (nenhum documento aqui).
];
