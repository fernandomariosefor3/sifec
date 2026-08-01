// Fase 2D — Sala de Situação: painel analítico agregado, calculado a partir
// das coleções existentes (schools, turmas, school_years, enrollment_snapshots,
// school_flow_results, grade_entry_monitoring, visitas). Não persiste NENHUM
// resultado consolidado — tudo aqui é derivado por funções puras em
// schoolSituationCalculations.ts a partir do que já está gravado. Nunca
// inclui nome de estudante, nota individual ou qualquer dado nominal — só
// agregados (ver seção 15 do plano da Fase 2D).
//
// Fase 2C.1 — correção de escopo: notas passa a vir de
// `grade_entry_monitoring` (agregado por turma), nunca mais de
// `student_rosters`/`student_bimester_grades` (protótipo nominal
// descontinuado — ver docs/descontinuacao-prototipo-notas-nominais.md).

// 'indisponivel' (revisão do code review do PR #16): uma fonte que FALHOU
// ao ler nunca vira 'sem_dados' (que significa "consultamos com sucesso e
// não há registro"). Precisa de um estado próprio para que a interface
// mostre "Falha de leitura" / "Dados indisponíveis" em vez de inventar uma
// ausência que pode não ser real — ver SourceLoadResult abaixo.
export type DataQualityState = 'sem_dados' | 'incompleto' | 'atualizado' | 'inconsistente' | 'indisponivel';

export type PendingItemType =
  | 'ano_letivo_nao_configurado'
  | 'nenhuma_turma_cadastrada'
  | 'turma_sem_ano_letivo'
  | 'matricula_inicial_nao_informada'
  | 'registro_mensal_pendente'
  | 'fluxo_nao_informado'
  | 'fluxo_rascunho'
  | 'turmas_sem_relatorio_notas'
  | 'turmas_com_preenchimento_parcial'
  | 'escola_sem_visita';

// Revisão do code review do PR #16 (seção 3): resultado explícito de uma
// tentativa de carregar UMA fonte. 'not_requested' é diferente de
// 'success' com dado vazio — nunca confundir "não pedimos essa fonte agora"
// (ex.: notas na visão global sem escola selecionada) com "pedimos e não
// havia nada" ou "pedimos e falhou". buildPendingItems/detectInconsistencies
// só podem gerar diagnóstico a partir de fontes 'success'.
export type SourceLoadResult<T> =
  | { status: 'success'; data: T }
  | { status: 'failure'; error: SchoolSituationSourceFailure }
  | { status: 'not_requested' };

// Disponibilidade das fontes usadas por UMA escola — passada explicitamente
// para buildPendingItems/detectInconsistencies (revisão do PR #16, seção 3)
// para que nenhuma das duas gere diagnóstico a partir de uma fonte que
// falhou. `true` cobre tanto 'success' quanto (quando aplicável) uma lista
// vazia bem-sucedida — só 'failure' vira `false`.
export interface SchoolSituationSourceAvailability {
  schoolYear: boolean;
  turmas: boolean;
  snapshots: boolean;
  flow: boolean;
  gradeEntryMonitoring: boolean;
  visitas: boolean;
}

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
  | 'grade_entry_monitoring_turma_outra_escola'
  | 'grade_entry_monitoring_turma_ano_diferente'
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
// escola selecionada — seção 13 do plano, nunca carrega turmas/notas das 56
// escolas de uma vez). Nunca inclui nome de estudante — agregado por TURMA
// (Fase 2C.1, ver src/lib/gradeEntryMonitoringCalculations.ts).
export interface GradeEntryMonitoringIndicators {
  turmasCadastradas: number;
  turmasComRelatorio: number;
  turmasSemRelatorio: number;
  turmasCompletas: number;
  turmasParciais: number;
  turmasSemPreenchimento: number;
  // Soma de completedGradeEntries / soma de expectedGradeEntries das turmas
  // com relatório — null quando nenhuma turma com relatório tem
  // expectedGradeEntries > 0 (nunca 0% automático).
  percentualPreenchimentoGeral: number | null;
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
  // GradeEntryMonitoringIndicators) — nunca confundir com "sem_dados" (que é
  // um GradeEntryMonitoringIndicators real com todos os contadores em zero).
  notas: GradeEntryMonitoringIndicators | null;
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
  // Revisão do code review do PR #16 (seção 9): quantas escolas do conjunto
  // têm ao menos uma fonte indisponível (sourceFailures.length > 0) — nunca
  // contabilizada como se fosse "dado não informado" nos outros contadores.
  escolasComFontesIndisponiveis: number;
}

export type SchoolScopeMode = 'carteira' | 'global';
