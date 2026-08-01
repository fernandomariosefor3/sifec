// Fase 2C.1 — correção de escopo: `grade_entry_monitoring` NÃO é um diário
// de notas nem um cadastro nominal de estudantes. É o acompanhamento
// AGREGADO, por escola+turma+ano letivo+bimestre, do preenchimento de notas
// que a própria escola já faz no SIGE Escola — os totais aqui só
// transcrevem o relatório do SIGE, nunca substituem o SIGE. Nunca contém
// nome de estudante, matrícula, CPF, nota individual, média individual ou
// qualquer observação nominal (ver seção 5 do plano da Fase 2C.1).

export type GradeEntryMonitoringStatus = 'rascunho' | 'confirmado';

// Tipo próprio (não reaproveita Bimestre de types/studentBimesterGrade.ts de
// propósito — seção 12 do plano: a nova aplicação não pode depender do
// protótipo nominal descontinuado, nem só para um tipo).
export type Bimestre = 1 | 2 | 3 | 4;

// Único valor aceito nesta fase — mantido como tipo próprio (em vez de
// reusar SourceSystem de types/import.ts inteiro) porque o formulário
// sempre grava 'SIGE Escola' fixo, nunca outra origem (seção 6 do plano:
// "sourceSystem fixo como SIGE Escola").
export type GradeEntryMonitoringSourceSystem = 'SIGE Escola';

export interface GradeEntryMonitoring {
  id: string; // `${schoolId}_${anoLetivo}_b${bimestre}_${turmaId}` — ver buildGradeEntryMonitoringId.

  schoolId: string;
  codInep: string;
  escolaNome: string;

  turmaId: string;
  turmaNome: string;

  anoLetivo: number;
  bimestre: Bimestre;

  totalStudents: number;

  studentsWithCompleteGrades: number;
  studentsWithPartialGrades: number;
  studentsWithoutGrades: number;

  expectedGradeEntries: number;
  completedGradeEntries: number;

  status: GradeEntryMonitoringStatus;

  sourceSystem: GradeEntryMonitoringSourceSystem;
  sourceReportTitle?: string;
  sourceFileName?: string;
  sourceFileHash?: string;
  referenceDate: string; // YYYY-MM-DD — data do relatório do SIGE Escola transcrito.

  observation?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
