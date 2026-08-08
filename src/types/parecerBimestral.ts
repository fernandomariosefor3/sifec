// Reestruturação SIFEC — Parecer Bimestral: único campo que este módulo
// efetivamente GRAVA (os outros 8 cards só leem dados já existentes de
// outras coleções). Encaminhamentos da superintendência para a escola,
// por escola+ano+bimestre.
import type { Bimestre, GradeEntryMonitoring } from './gradeEntryMonitoring';
import type { Turma } from './classroom';
import type { BimonthlyEnrollment } from './bimonthlyEnrollment';
import type { SchoolFlowResult } from './schoolFlow';
import type { FarolEstudanteItem } from './farolEstudante';
import type { CdgPlan, CdgTask } from './cdgPlan';
import type { RecomposicaoPlan } from './recomposicaoPlan';
import type { GradeEntryMonitoringByDiscipline } from './gradeEntryMonitoringDiscipline';

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

// Correção final da auditoria da reestruturação — seção 5: ParecerBimestralData
// não pode ficar definido só dentro do componente (ParecerBimestralView.tsx)
// — movido para uma fonte canônica única em src/types/, mesmo princípio de
// RankingEscola (ver types/schoolRiskRanking.ts).
//
// Auditoria da reestruturação, seção 10: cada card precisa diferenciar
// carregamento/sucesso/FALHA da fonte correspondente — nunca um único
// Promise.all combinado onde uma fonte fora do ar apaga o parecer inteiro.
// SourceResult carrega o valor (com fallback vazio em caso de falha, NUNCA
// null silencioso) + a flag `failed` + a mensagem de erro, para cada card
// poder mostrar "não foi possível carregar" em vez de reaproveitar
// silenciosamente um estado vazio como se fosse "sem dado".
export interface SourceResult<T> {
  value: T;
  failed: boolean;
  errorMessage: string | null;
}

// Shape de dados do Parecer Bimestral — nome pedido explicitamente pela
// auditoria da reestruturação.
export interface ParecerBimestralData {
  turmas: SourceResult<Turma[]>;
  bimonthly: SourceResult<BimonthlyEnrollment[]>;
  flow: SourceResult<SchoolFlowResult | null>;
  monitoring: SourceResult<GradeEntryMonitoring[]>;
  // Correção final da auditoria, seção 7: o card "Notas Informadas" precisa
  // usar disciplina real (grade_entry_monitoring_disciplina), não só o
  // total por turma de `monitoring` acima.
  disciplina: SourceResult<GradeEntryMonitoringByDiscipline[]>;
  farol: SourceResult<FarolEstudanteItem[]>;
  cdgPlan: SourceResult<CdgPlan | null>;
  cdgTasks: SourceResult<CdgTask[]>;
  recomposicao: SourceResult<RecomposicaoPlan[]>;
}
