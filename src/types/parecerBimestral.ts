// Reestruturação SIFEC — Parecer Bimestral: único campo que este módulo
// efetivamente GRAVA (os outros 8 cards só leem dados já existentes de
// outras coleções). Encaminhamentos da superintendência para a escola,
// por escola+ano+bimestre.
import type { Bimestre } from './gradeEntryMonitoring';

export interface ParecerBimestralNote {
  id: string; // `${schoolId}_${anoLetivo}_b${bimestre}`
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  encaminhamentos: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
