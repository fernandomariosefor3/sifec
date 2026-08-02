// Fase 2D — Sala de Situação: pendências operacionais (seção 9 do plano).
// Extraído de schoolSituationCalculations.ts para manter os arquivos desta
// fase pequenos e focados (ver coding-style.md: muitos arquivos pequenos >
// poucos arquivos grandes). Cada pendência é sempre explicável: o que
// falta, de qual período, de qual coleção veio a verificação, e qual ação
// resolve — nunca um rótulo genérico de julgamento ("situação grave" etc.)
// e nunca uma pontuação secreta.
import type {
  EnrollmentMovementIndicators,
  GradeEntryMonitoringIndicators,
  SchoolFlowIndicators,
  SchoolSituationPendingItem,
  SchoolSituationSourceAvailability,
  SchoolStructureIndicators,
  VisitIndicators,
} from '../types/schoolSituation';

export interface PendingItemsInput {
  schoolId: string;
  anoLetivo: number;
  estrutura: SchoolStructureIndicators;
  matricula: EnrollmentMovementIndicators;
  fluxo: SchoolFlowIndicators;
  notas: GradeEntryMonitoringIndicators | null;
  visitas: VisitIndicators;
  turmasSemAnoLetivo: number;
  // Revisão do code review do PR #16 (seção 3): disponibilidade das fontes
  // desta escola. Uma pendência só pode ser gerada a partir de uma fonte
  // que foi lida com SUCESSO — uma fonte que falhou nunca vira pendência
  // (isso seria um diagnóstico falso, ver schoolSituationService.ts).
  availability: SchoolSituationSourceAvailability;
}

export function buildPendingItems(input: PendingItemsInput): SchoolSituationPendingItem[] {
  const { schoolId, anoLetivo, estrutura, matricula, fluxo, notas, visitas, turmasSemAnoLetivo, availability } = input;
  const items: SchoolSituationPendingItem[] = [];

  if (availability.schoolYear && !estrutura.anoLetivoConfigurado) {
    items.push({
      type: 'ano_letivo_nao_configurado',
      schoolId,
      message: `Ano letivo ${anoLetivo} ainda não foi configurado para esta escola.`,
      period: String(anoLetivo),
      sourceCollection: 'school_years',
      resolutionAction: 'Configurar o ano letivo em Gestão de Escolas.',
    });
  }
  if (availability.turmas && estrutura.turmasCadastradas === 0) {
    items.push({
      type: 'nenhuma_turma_cadastrada',
      schoolId,
      message: 'Nenhuma turma cadastrada para esta escola e ano letivo.',
      period: String(anoLetivo),
      sourceCollection: 'turmas',
      resolutionAction: 'Cadastrar turmas em Gestão de Escolas.',
    });
  }
  if (availability.turmas && turmasSemAnoLetivo > 0) {
    items.push({
      type: 'turma_sem_ano_letivo',
      schoolId,
      message: `${turmasSemAnoLetivo} turma(s) sem ano letivo definido.`,
      period: null,
      sourceCollection: 'turmas',
      resolutionAction: 'Completar o ano letivo de cada turma em Gestão de Escolas.',
    });
  }
  if (availability.schoolYear && estrutura.matriculaInicial == null) {
    items.push({
      type: 'matricula_inicial_nao_informada',
      schoolId,
      message: 'Matrícula inicial ainda não foi informada.',
      period: String(anoLetivo),
      sourceCollection: 'school_years',
      resolutionAction: 'Registrar a matrícula inicial em Gestão de Escolas.',
    });
  }
  // registro_mensal_pendente depende de school_years (dataInicio/dataFim,
  // usado por getExpectedMonthReferences) e de turmas (cobertura por turma
  // ativa), além de enrollment_snapshots — uma falha em qualquer uma das
  // três infla artificialmente quantidadeMesesPendentes (ver
  // schoolSituationService.ts), então as três precisam estar disponíveis
  // antes desta pendência ser confiável.
  if (availability.schoolYear && availability.turmas && availability.snapshots && matricula.quantidadeMesesPendentes > 0) {
    items.push({
      type: 'registro_mensal_pendente',
      schoolId,
      message: `${matricula.quantidadeMesesPendentes} mês(es) do acompanhamento mensal ainda não foram preenchidos.`,
      period: String(anoLetivo),
      sourceCollection: 'enrollment_snapshots',
      resolutionAction: 'Preencher o registro mensal em Gestão de Escolas.',
    });
  }
  if (availability.flow && fluxo.status === 'nao_informado') {
    items.push({
      type: 'fluxo_nao_informado',
      schoolId,
      message: 'Fluxo escolar ainda não foi informado.',
      period: String(anoLetivo),
      sourceCollection: 'school_flow_results',
      resolutionAction: 'Registrar o fluxo escolar em Fluxo Escolar.',
    });
  } else if (availability.flow && fluxo.status === 'rascunho') {
    items.push({
      type: 'fluxo_rascunho',
      schoolId,
      message: 'Fluxo escolar está em rascunho — ainda não foi confirmado.',
      period: String(anoLetivo),
      sourceCollection: 'school_flow_results',
      resolutionAction: 'Confirmar o fluxo escolar em Fluxo Escolar.',
    });
  }
  // notas == null já cobre "não solicitada" e "fonte falhou" (o serviço
  // nunca calcula notas quando grade_entry_monitoring falha — ver
  // schoolSituationService.ts); availability.gradeEntryMonitoring reforça o
  // mesmo contrato aqui, para esta função continuar correta mesmo se algum
  // chamador futuro passar um `notas` não-nulo por engano com uma fonte
  // indisponível.
  if (notas != null && availability.gradeEntryMonitoring) {
    if (notas.turmasSemRelatorio > 0) {
      items.push({
        type: 'turmas_sem_relatorio_notas',
        schoolId,
        message: `${notas.turmasSemRelatorio} turma(s) sem relatório de notas informado.`,
        period: null,
        sourceCollection: 'grade_entry_monitoring',
        resolutionAction: 'Registrar o relatório de notas em Notas Bimestrais.',
      });
    }
    // Parcial e sem preenchimento são tratados como a MESMA pendência
    // (relatório informado, mas incompleto) — o tipo disponível
    // (turmas_com_preenchimento_parcial) cobre as duas situações, já que
    // ambas se resolvem da mesma forma: completar o lançamento no SIGE
    // Escola e atualizar o relatório aqui.
    const turmasComPreenchimentoParcial = notas.turmasParciais + notas.turmasSemPreenchimento;
    if (turmasComPreenchimentoParcial > 0) {
      items.push({
        type: 'turmas_com_preenchimento_parcial',
        schoolId,
        message: `${turmasComPreenchimentoParcial} turma(s) com relatório de notas incompleto.`,
        period: null,
        sourceCollection: 'grade_entry_monitoring',
        resolutionAction: 'Completar o lançamento de notas em Notas Bimestrais.',
      });
    }
  }
  if (availability.visitas && visitas.semVisitaNoAno) {
    items.push({
      type: 'escola_sem_visita',
      schoolId,
      message: `Nenhuma visita registrada em ${anoLetivo}.`,
      period: String(anoLetivo),
      sourceCollection: 'visitas',
      resolutionAction: 'Agendar ou registrar uma visita técnica.',
    });
  }

  return items;
}
