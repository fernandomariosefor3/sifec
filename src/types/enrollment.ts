// Fase 2A — matrícula mensal por turma (coleção `enrollment_snapshots`).
// Cada documento é IMUTÁVEL por mês: um snapshot de março nunca substitui o
// de fevereiro, e uma correção de março só atualiza o próprio documento de
// março (ver seção 9 do plano — histórico nunca é sobrescrito entre meses).
import type { SourceMetadata } from './import';

export type EnrollmentReviewStatus =
  | 'manual'
  | 'importado_pendente'
  | 'confirmado'
  | 'divergencia'
  | 'corrigido';

export interface EnrollmentSnapshot extends SourceMetadata {
  id: string; // `${schoolId}_${turmaId}_${mesReferencia}`, ex.: "diva-cabral_turma-3a_2026-03"
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  mesReferencia: string; // formato YYYY-MM
  matriculaInicioMes: number;
  novasMatriculas: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  abandono: number;
  outrasSaidas: number;
  matriculaFimMes: number;
  observacao?: string;
  reviewStatus: EnrollmentReviewStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
