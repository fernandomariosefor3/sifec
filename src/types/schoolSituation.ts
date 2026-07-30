// Fase 2D — Sala de Situação: painel analítico agregado, calculado a partir
// das coleções existentes (schools, turmas, school_years, enrollment_snapshots,
// school_flow_results, student_rosters, student_bimester_grades, visitas).
// Não persiste NENHUM resultado consolidado — tudo aqui é derivado por
// funções puras em schoolSituationCalculations.ts a partir do que já está
// gravado. Nunca inclui nome de estudante, nota individual ou qualquer dado
// nominal — só agregados (ver seção 15 do plano da Fase 2D).

export type DataQualityState = 'sem_dados' | 'incompleto' | 'atualizado' | 'inconsistente';

export type PendingItemType =
  | 'ano_letivo_nao_configurado'
  | 'nenhuma_turma_cadastrada'
  | 'turma_sem_ano_letivo'
  | 'matricula_inicial_nao_informada'
  | 'registro_mensal_pendente'
  | 'fluxo_nao_informado'
  | 'fluxo_rascunho'
  | 'estudantes_sem_notas'
  | 'notas_parcialmente_preenchidas'
  | 'escola_sem_visita';

// Cada pendência precisa explicar o que falta, de qual período, de qual
// coleção veio a verificação, e qual ação resolve — nunca um rótulo
// genérico como "situação grave" (seção 9 do plano).
export interface SchoolSituationPendingItem {
  type: PendingItemType;
  schoolId: string;
  message: string;
  period: string | null;
  sourceCollection: string;
  resolutionAction: string;
}

export type InconsistencyType =
  | 'matricula_final_divergente'
  | 'snapshot_turma_outra_escola'
  | 'snapshot_ano_diferente'
  | 'roster_turma_ano_diferente'
  | 'nota_sem_roster'
  | 'nota_estudante_inativo'
  | 'fluxo_confirmado_total_zero'
  | 'registro_duplicado'
  | 'school_id_inexistente'
  | 'cod_inep_ausente';

// Só sinaliza — nunca corrige automaticamente (seção 11 do plano).
export interface SchoolSituationInconsistency {
  type: InconsistencyType;
  schoolId: string;
  message: string;
  details?: string;
}

export interface SchoolStructureIndicators {
  turmasCadastradas: number;
  turmasAtivas: number;
  matriculaInicial: number | null;
  matriculaAtual: number | null;
  mediaAlunosPorTurma: number | null;
  anoLetivoConfigurado: boolean;
  dataQuality: DataQualityState;
}

export interface EnrollmentMovementIndicators {
  matriculaInicial: number | null;
  novasMatriculas: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  abandono: number;
  outrasSaidas: number;
  matriculaFinalCalculada: number | null;
  ultimoMesPreenchido: string | null;
  quantidadeMesesRegistrados: number;
  quantidadeMesesPendentes: number;
  dataQuality: DataQualityState;
}

export type SchoolFlowIndicatorStatus = 'nao_informado' | 'rascunho' | 'confirmado';

export interface SchoolFlowIndicators {
  aprovados: number;
  reprovados: number;
  abandono: number;
  totalInformado: number;
  percentualAprovacao: number;
  percentualReprovacao: number;
  percentualAbandono: number;
  status: SchoolFlowIndicatorStatus;
  dataQuality: DataQualityState;
}

// null: notas ainda não carregadas para esta escola (visão global sem
// escola selecionada — seção 13 do plano, nunca carrega nomes/turmas de
// notas das 56 escolas de uma vez). Nunca inclui nome de estudante.
export interface GradeFillIndicators {
  estudantesAtivos: number;
  completos: number;
  parciais: number;
  semNotas: number;
  abaixoReferencia: number;
  percentualPreenchimento: number;
  turmasComPreenchimentoCompleto: number;
  turmasComPendencia: number;
  dataQuality: DataQualityState;
}

export interface VisitIndicators {
  quantidadeVisitasNoAno: number;
  dataUltimaVisita: string | null;
  semVisitaNoAno: boolean;
  dataQuality: DataQualityState;
}

export interface SchoolSituationSourceFailure {
  source: string;
  message: string;
}

export interface SchoolSituation {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  estrutura: SchoolStructureIndicators;
  matricula: EnrollmentMovementIndicators;
  fluxo: SchoolFlowIndicators;
  // null só quando as notas não foram carregadas para esta escola (ver
  // GradeFillIndicators) — nunca confundir com "sem_dados" (que é um
  // GradeFillIndicators real com todos os contadores em zero).
  notas: GradeFillIndicators | null;
  visitas: VisitIndicators;
  pendencias: SchoolSituationPendingItem[];
  inconsistencias: SchoolSituationInconsistency[];
  qualidadeGeral: DataQualityState;
  sourceFailures: SchoolSituationSourceFailure[];
}

export interface PortfolioSituationSummary {
  escolasAcompanhadas: number;
  escolasComAnoConfigurado: number;
  turmasAtivas: number;
  matriculaAtual: number;
  escolasComRegistroMensalEmDia: number;
  // null quando nenhuma escola do conjunto teve notas carregadas.
  percentualPreenchimentoNotas: number | null;
  escolasComFluxoInformado: number;
  escolasComPendencias: number;
}

export type SchoolScopeMode = 'carteira' | 'global';
