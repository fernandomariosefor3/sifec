// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": o modelo anterior só tinha um total geral por TURMA
// (grade_entry_monitoring, preservado intacto — nunca migrado nem excluído,
// continua servindo o fluxo de registro do SIGE do PR #18 e a Sala de
// Situação). Esta coleção NOVA e SEPARADA acrescenta a dimensão
// disciplina/área, exigida explicitamente pelo plano: escola + ano letivo +
// bimestre + turma + disciplina. Nunca duplica nome de estudante nem nota
// individual — só lançamentos esperados/realizados agregados por turma e
// disciplina (percentual sempre calculado, nunca persistido).
//
// As quatro áreas reaproveitam a mesma nomenclatura já usada pelo protótipo
// nominal descontinuado (src/types/studentBimesterGrade.ts —
// BimesterScores.linguaPortuguesa/matematica/cienciasNatureza/
// cienciasHumanas), para não inventar uma taxonomia nova de disciplinas.
import type { Bimestre } from './gradeEntryMonitoring';

export const DISCIPLINA_AREAS = ['linguaPortuguesa', 'matematica', 'cienciasNatureza', 'cienciasHumanas'] as const;
export type DisciplinaArea = (typeof DISCIPLINA_AREAS)[number];

export const DISCIPLINA_AREA_LABELS: Record<DisciplinaArea, string> = {
  linguaPortuguesa: 'Língua Portuguesa',
  matematica: 'Matemática',
  cienciasNatureza: 'Ciências da Natureza',
  cienciasHumanas: 'Ciências Humanas',
};

export type GradeEntryMonitoringDisciplineStatus = 'rascunho' | 'confirmado';

export interface GradeEntryMonitoringByDiscipline {
  id: string; // `${schoolId}_${anoLetivo}_b${bimestre}_${turmaId}_${disciplina}`
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  disciplina: DisciplinaArea;
  // Só o necessário ao cálculo do percentual (soma realizados / soma
  // esperados) — nunca duplica totalStudents/breakdown por situação do
  // estudante, que continua sendo um conceito por TURMA (grade_entry_monitoring),
  // não por disciplina.
  expectedGradeEntries: number;
  completedGradeEntries: number;
  status: GradeEntryMonitoringDisciplineStatus;
  referenceDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
