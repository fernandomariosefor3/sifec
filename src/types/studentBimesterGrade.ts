// Fase 2C — nota bimestral por estudante (coleção
// `student_bimester_grades`). Não é diário oficial nem sistema de
// aprovação: só monitora preenchimento. Nunca persiste média, percentual,
// classificação, situação pedagógica ou indicação de defasagem — tudo isso
// é sempre calculado (ver src/lib/studentGradeCalculations.ts). O nome do
// estudante NUNCA é duplicado aqui — vem sempre do vínculo com
// student_rosters via studentKey/rosterId.

export type Bimestre = 1 | 2 | 3 | 4;

export interface BimesterScores {
  linguaPortuguesa: number | null;
  matematica: number | null;
  cienciasNatureza: number | null;
  cienciasHumanas: number | null;
}

export type StudentBimesterGradeSourceSystem = 'Manual' | 'SIGE Escola' | 'Importação administrativa';

export interface StudentBimesterGrade {
  id: string; // `${rosterId}_b${bimestre}`
  rosterId: string;
  studentKey: string;

  schoolId: string;
  codInep: string;
  escolaNome: string;

  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;

  scores: BimesterScores;

  observacao?: string;

  sourceSystem?: StudentBimesterGradeSourceSystem;
  sourceReportTitle?: string;
  sourceFileName?: string;
  sourceFileHash?: string;
  importBatchId?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
