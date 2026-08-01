// Fase 2D — Sala de Situação: dados fictícios do modo demonstração (seção
// 17 do plano). Usado SÓ quando não há usuário Firebase autenticado (ver
// useSchoolSituation.ts) — nunca gravado no Firestore, nunca usado como
// fallback depois de autenticado, nunca misturado a um SchoolSituation real.
// Chaveado pelos MESMOS IDs/nomes de SEED_SCHOOLS (mesma convenção de
// demoSchoolFlow.ts/demoStudentRoster.ts): a lista de escolas visível antes
// do login vem sempre de SEED_SCHOOLS (getSchoolsForCurrentScope com o
// registro de demonstração pré-login de superintendentService.ts), então um
// ID fictício aqui nunca apareceria na tabela. Números claramente
// diferentes dos reais (nunca coincidem com o que a mesma escola mostra
// depois de autenticado) deixam óbvio que é amostra, sem precisar de nomes
// de escola fictícios. Constrói os objetos diretamente (não passa pelo
// pipeline de cálculo real) porque é só uma amostra ilustrativa da forma
// dos dados, não um cenário a validar.
import type { SchoolSituation } from '../types/schoolSituation';
import { combineDataQualityStates } from '../lib/schoolSituationCalculations';

export const DEMO_SITUATION_ANO_LETIVO = 2026;

function buildDemoSituation(
  schoolId: string,
  codInep: string,
  escolaNome: string,
  variant: 'atualizado' | 'incompleto'
): SchoolSituation {
  const isComplete = variant === 'atualizado';

  const estrutura: SchoolSituation['estrutura'] = {
    turmasCadastradas: isComplete ? 6 : 2,
    turmasAtivas: isComplete ? 6 : 1,
    matriculaInicial: isComplete ? 480 : null,
    matriculaAtual: isComplete ? 472 : null,
    mediaAlunosPorTurma: isComplete ? 78.7 : null,
    anoLetivoConfigurado: isComplete,
    dataQuality: isComplete ? 'atualizado' : 'incompleto',
  };

  const matricula: SchoolSituation['matricula'] = {
    matriculaInicial: isComplete ? 480 : null,
    novasMatriculas: isComplete ? 12 : 0,
    transferenciasEntrada: isComplete ? 3 : 0,
    transferenciasSaida: isComplete ? 5 : 0,
    abandono: isComplete ? 8 : 0,
    outrasSaidas: isComplete ? 2 : 0,
    matriculaFinalCalculada: isComplete ? 472 : null,
    ultimoMesPreenchido: isComplete ? `${DEMO_SITUATION_ANO_LETIVO}-05` : null,
    quantidadeMesesRegistrados: isComplete ? 5 : 0,
    quantidadeMesesPendentes: isComplete ? 0 : 5,
    dataQuality: isComplete ? 'atualizado' : 'sem_dados',
  };

  const fluxo: SchoolSituation['fluxo'] = isComplete
    ? {
        aprovados: 410, reprovados: 45, abandono: 8, totalInformado: 463,
        percentualAprovacao: 88.55, percentualReprovacao: 9.72, percentualAbandono: 1.73,
        status: 'confirmado', dataQuality: 'atualizado',
      }
    : {
        aprovados: 0, reprovados: 0, abandono: 0, totalInformado: 0,
        percentualAprovacao: 0, percentualReprovacao: 0, percentualAbandono: 0,
        status: 'nao_informado', dataQuality: 'sem_dados',
      };

  const notas: SchoolSituation['notas'] = isComplete
    ? {
        turmasCadastradas: 6, turmasComRelatorio: 4, turmasSemRelatorio: 2,
        turmasCompletas: 2, turmasParciais: 2, turmasSemPreenchimento: 0,
        percentualPreenchimentoGeral: 91.2,
        dataQuality: 'incompleto',
      }
    : null;

  const visitas: SchoolSituation['visitas'] = {
    quantidadeVisitasNoAno: isComplete ? 2 : 0,
    dataUltimaVisita: isComplete ? `${DEMO_SITUATION_ANO_LETIVO}-04-10` : null,
    semVisitaNoAno: !isComplete,
    dataQuality: isComplete ? 'atualizado' : 'sem_dados',
  };

  const pendencias: SchoolSituation['pendencias'] = isComplete
    ? [{
        type: 'turmas_com_preenchimento_parcial', schoolId,
        message: '2 turma(s) com relatório de notas incompleto.',
        period: null, sourceCollection: 'grade_entry_monitoring',
        resolutionAction: 'Completar o lançamento de notas em Notas Bimestrais.',
      }]
    : [{
        type: 'ano_letivo_nao_configurado', schoolId,
        message: `Ano letivo ${DEMO_SITUATION_ANO_LETIVO} ainda não foi configurado para esta escola.`,
        period: String(DEMO_SITUATION_ANO_LETIVO), sourceCollection: 'school_years',
        resolutionAction: 'Configurar o ano letivo em Gestão de Escolas.',
      }];

  return {
    schoolId,
    codInep,
    escolaNome,
    anoLetivo: DEMO_SITUATION_ANO_LETIVO,
    estrutura,
    matricula,
    fluxo,
    notas,
    visitas,
    pendencias,
    inconsistencias: [],
    qualidadeGeral: combineDataQualityStates(
      [estrutura.dataQuality, matricula.dataQuality, fluxo.dataQuality, visitas.dataQuality, ...(notas ? [notas.dataQuality] : [])]
    ),
    sourceFailures: [],
  };
}

export const DEMO_SCHOOL_SITUATIONS: Record<string, SchoolSituation> = {
  'diva-cabral': buildDemoSituation('diva-cabral', '23067918', 'EEM Diva Cabral', 'atualizado'),
  'figueiredo-correia': buildDemoSituation('figueiredo-correia', '23070242', 'EEM Figueiredo Correia', 'incompleto'),
};
