// Reestruturação SIFEC — Gestão de Escolas simplificada: substitui o
// registro mensal por turma (enrollment_snapshots) por um único número de
// matrícula por ESCOLA e por BIMESTRE (1º ao 4º), a granularidade pedida
// pelo plano. Documento por escola+ano+bimestre — nunca por turma.
import type { Bimestre } from './gradeEntryMonitoring';

export interface BimonthlyEnrollment {
  id: string; // `${schoolId}_${anoLetivo}_b${bimestre}` — ver buildBimonthlyEnrollmentId.
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  matricula: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
