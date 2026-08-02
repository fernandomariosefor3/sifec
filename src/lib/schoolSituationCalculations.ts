// Fase 2D — Sala de Situação: cálculos puros, sem nenhum import do Firebase
// (mesmo padrão de enrollmentCalculations.ts/schoolFlowCalculations.ts/
// gradeEntryMonitoringCalculations.ts — testável sem emulador). Reaproveita
// ao máximo os cálculos já existentes das fases anteriores em vez de
// duplicar lógica: matrícula/cobertura mensal vem de
// enrollmentCalculations.ts, fluxo de schoolFlowCalculations.ts,
// preenchimento de notas (agregado por turma, Fase 2C.1) de
// gradeEntryMonitoringCalculations.ts. Nada aqui persiste resultado algum —
// tudo é recalculado a partir dos dados já gravados nas coleções existentes
// (ver seção 6 do plano da Fase 2D).
import type { SchoolYear } from '../types/schoolYear';
import type { Turma } from '../types/classroom';
import type { EnrollmentSnapshot } from '../types/enrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import type {
  DataQualityState,
  EnrollmentMovementIndicators,
  GradeEntryMonitoringIndicators,
  PortfolioSituationSummary,
  SchoolFlowIndicators,
  SchoolSituation,
  SchoolStructureIndicators,
  VisitIndicators,
} from '../types/schoolSituation';
import {
  calculateAverageStudentsPerClass,
  calculateCurrentSchoolEnrollmentCoverage,
  countActiveTurmas,
  type TurmaAtivaIdLike,
  type TurmaMatriculaLike,
} from './enrollmentCalculations';
import { calculateSchoolFlowPercentuais, calculateTotalResultados, type SchoolFlowCounts } from './schoolFlowCalculations';
import { consolidateGradeEntryMonitoring, type TurmaGradeEntryRow } from './gradeEntryMonitoringCalculations';
import { schoolNamesMatch } from './schoolIdentity';

// --- Qualidade dos dados (seção 10 do plano) ---

// inconsistente sempre vence (qualquer inconsistência real importa mais que
// "incompleto"); em seguida indisponivel (revisão do code review do PR #16
// — uma fonte que falhou ao ler é mais grave que um domínio simplesmente
// incompleto, precisa aparecer antes); só "sem_dados" em todos os domínios
// permanece sem_dados; só "atualizado" em todos os domínios permanece
// atualizado; qualquer mistura vira incompleto. Nunca persistido —
// recalculado sempre que os indicadores mudam.
export function combineDataQualityStates(states: readonly DataQualityState[]): DataQualityState {
  if (states.length === 0) return 'sem_dados';
  if (states.some(s => s === 'inconsistente')) return 'inconsistente';
  if (states.some(s => s === 'indisponivel')) return 'indisponivel';
  if (states.every(s => s === 'sem_dados')) return 'sem_dados';
  if (states.every(s => s === 'atualizado')) return 'atualizado';
  return 'incompleto';
}

// --- Estrutura escolar (seção 8.1) ---

export function calculateStructureIndicators(
  schoolYear: SchoolYear | null,
  turmasDoAno: readonly Turma[]
): SchoolStructureIndicators {
  const turmasAtivas = countActiveTurmas(turmasDoAno);
  const turmasCadastradas = turmasDoAno.length;
  const matriculaInicial = schoolYear?.matriculaInicial ?? null;
  const matriculaAtual = schoolYear?.matriculaAtual ?? null;
  const mediaAlunosPorTurma = calculateAverageStudentsPerClass(matriculaAtual, turmasAtivas);
  const anoLetivoConfigurado = schoolYear != null;

  let dataQuality: DataQualityState;
  if (!anoLetivoConfigurado && turmasCadastradas === 0) {
    dataQuality = 'sem_dados';
  } else if (anoLetivoConfigurado && turmasAtivas > 0 && matriculaInicial != null) {
    dataQuality = 'atualizado';
  } else {
    dataQuality = 'incompleto';
  }

  return { turmasCadastradas, turmasAtivas, matriculaInicial, matriculaAtual, mediaAlunosPorTurma, anoLetivoConfigurado, dataQuality };
}

// --- Movimentação de matrícula (seção 8.2) ---

export interface ExpectedMonthReferencesInput {
  anoLetivo: number;
  // dataInicio/dataFim vêm de SchoolYear.dataInicio/dataFim (formato
  // YYYY-MM-DD) — nunca um valor inventado pelo chamador.
  dataInicio?: string | null;
  dataFim?: string | null;
}

export interface ExpectedMonthsResult {
  months: string[];
  // false quando o período letivo não é conhecido o bastante para montar a
  // lista de meses esperados: dataInicio ausente (nunca inventamos janeiro
  // como início), ou dataFim ausente num ano JÁ ENCERRADO (nunca presumimos
  // dezembro). Nesses dois casos `months` vem vazio de propósito — o
  // chamador deve tratar a cobertura mensal como incompleta/período não
  // configurado, nunca como "nenhum mês pendente" (revisão do code review
  // do PR #16, seção 2).
  periodoConhecido: boolean;
}

function parseMonthFromIsoDate(dateStr: string): number | null {
  const match = /^\d{4}-(\d{2})-\d{2}/.exec(dateStr);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? month : null;
}

// Meses "esperados" dentro do ano letivo REALMENTE configurado — nunca um
// mês FUTURO (seção 8.2 do plano: "não tratar um mês futuro como
// pendência"), e agora (revisão do code review do PR #16, seção 2) nunca um
// mês anterior a dataInicio nem posterior a dataFim. Regras:
//   - ano letivo futuro (posterior ao corrente): nenhum mês é esperado
//     ainda, período sempre "conhecido" (o resultado vazio É a resposta
//     certa, não uma lacuna de dado).
//   - dataInicio ausente: nunca inventa janeiro — período desconhecido.
//   - ano letivo em curso: começa em dataInicio, vai até dataFim (se já
//     definido e não estiver no futuro) ou até o mês corrente (inclusive) —
//     dataFim ausente num ano corrente é permitido, o plano autoriza
//     limitar ao mês atual.
//   - ano letivo já encerrado (anterior ao corrente): começa em dataInicio,
//     vai até dataFim — SEM dataFim aqui o período fica desconhecido (nunca
//     presume dezembro), diferente do ano corrente.
export function getExpectedMonthReferences(
  input: ExpectedMonthReferencesInput,
  now: Date = new Date()
): ExpectedMonthsResult {
  const { anoLetivo, dataInicio, dataFim } = input;
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  if (anoLetivo > currentYear) {
    return { months: [], periodoConhecido: true };
  }

  const startMonth = dataInicio != null ? parseMonthFromIsoDate(dataInicio) : null;
  if (startMonth == null) {
    return { months: [], periodoConhecido: false };
  }

  let endMonth: number;
  if (anoLetivo === currentYear) {
    const dataFimMonth = dataFim != null ? parseMonthFromIsoDate(dataFim) : null;
    endMonth = dataFimMonth != null ? Math.min(dataFimMonth, currentMonth) : currentMonth;
  } else {
    const dataFimMonth = dataFim != null ? parseMonthFromIsoDate(dataFim) : null;
    if (dataFimMonth == null) {
      return { months: [], periodoConhecido: false };
    }
    endMonth = dataFimMonth;
  }

  if (endMonth < startMonth) {
    return { months: [], periodoConhecido: true };
  }

  const months: string[] = [];
  for (let m = startMonth; m <= endMonth; m += 1) {
    months.push(`${anoLetivo}-${String(m).padStart(2, '0')}`);
  }
  return { months, periodoConhecido: true };
}

function isMonthFullyCovered(
  month: string,
  snapshots: readonly EnrollmentSnapshot[],
  turmasAtivas: readonly TurmaAtivaIdLike[]
): boolean {
  if (turmasAtivas.length === 0) return false;
  return turmasAtivas.every(turma =>
    snapshots.some(s => s.turmaId === turma.id && s.mesReferencia === month)
  );
}

interface EnrollmentFieldSums {
  novasMatriculas: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  abandono: number;
  outrasSaidas: number;
}

function sumEnrollmentMovementFields(snapshots: readonly EnrollmentSnapshot[]): EnrollmentFieldSums {
  return snapshots.reduce<EnrollmentFieldSums>(
    (acc, s) => ({
      novasMatriculas: acc.novasMatriculas + s.novasMatriculas,
      transferenciasEntrada: acc.transferenciasEntrada + s.transferenciasEntrada,
      transferenciasSaida: acc.transferenciasSaida + s.transferenciasSaida,
      abandono: acc.abandono + s.abandono,
      outrasSaidas: acc.outrasSaidas + s.outrasSaidas,
    }),
    { novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0, abandono: 0, outrasSaidas: 0 }
  );
}

export function calculateEnrollmentMovementIndicators(
  schoolYear: SchoolYear | null,
  snapshots: readonly EnrollmentSnapshot[],
  turmasAtivas: readonly (TurmaAtivaIdLike & TurmaMatriculaLike)[],
  anoLetivo: number,
  now: Date = new Date()
): EnrollmentMovementIndicators {
  const sums = sumEnrollmentMovementFields(snapshots);
  const matriculaInicial = schoolYear?.matriculaInicial ?? null;

  const mesesComSnapshot = snapshots.map(s => s.mesReferencia);
  const ultimoMesPreenchido = mesesComSnapshot.length === 0
    ? null
    : mesesComSnapshot.reduce((latest, m) => (m > latest ? m : latest));

  const { months: expectedMonths, periodoConhecido } = getExpectedMonthReferences(
    { anoLetivo, dataInicio: schoolYear?.dataInicio, dataFim: schoolYear?.dataFim },
    now
  );
  const quantidadeMesesRegistrados = expectedMonths.filter(month =>
    isMonthFullyCovered(month, snapshots, turmasAtivas)
  ).length;
  // Sem período letivo conhecido (dataInicio ausente, ou dataFim ausente
  // num ano já encerrado), os meses pendentes usam SÓ o período
  // efetivamente conhecido — aqui, nenhum (revisão do code review do PR
  // #16, seção 2) — nunca inventa uma contagem de pendência a partir de um
  // início/fim presumido.
  const quantidadeMesesPendentes = periodoConhecido ? expectedMonths.length - quantidadeMesesRegistrados : 0;

  const coverage = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmasAtivas);

  let dataQuality: DataQualityState;
  if (matriculaInicial == null && snapshots.length === 0) {
    dataQuality = 'sem_dados';
  } else if (!periodoConhecido) {
    dataQuality = 'incompleto';
  } else if (matriculaInicial != null && expectedMonths.length > 0 && quantidadeMesesPendentes === 0) {
    dataQuality = 'atualizado';
  } else {
    dataQuality = 'incompleto';
  }

  return {
    matriculaInicial,
    novasMatriculas: sums.novasMatriculas,
    transferenciasEntrada: sums.transferenciasEntrada,
    transferenciasSaida: sums.transferenciasSaida,
    abandono: sums.abandono,
    outrasSaidas: sums.outrasSaidas,
    matriculaFinalCalculada: coverage.total,
    ultimoMesPreenchido,
    quantidadeMesesRegistrados,
    quantidadeMesesPendentes,
    dataQuality,
  };
}

// --- Fluxo escolar (seção 8.3) — NUNCA estimado a partir dos dados
// mensais, só do documento anual já confirmado/rascunho. ---

export function calculateFlowIndicators(flowResult: SchoolFlowResult | null): SchoolFlowIndicators {
  if (!flowResult) {
    return {
      aprovados: 0,
      reprovados: 0,
      abandono: 0,
      totalInformado: 0,
      percentualAprovacao: 0,
      percentualReprovacao: 0,
      percentualAbandono: 0,
      status: 'nao_informado',
      dataQuality: 'sem_dados',
    };
  }

  const counts: SchoolFlowCounts = {
    aprovados: flowResult.aprovados,
    reprovados: flowResult.reprovados,
    abandono: flowResult.abandono,
  };
  const percentuais = calculateSchoolFlowPercentuais(counts);
  const totalInformado = calculateTotalResultados(counts);

  const dataQuality: DataQualityState = flowResult.status === 'confirmado'
    ? (totalInformado > 0 ? 'atualizado' : 'inconsistente')
    : 'incompleto';

  return {
    ...counts,
    totalInformado,
    ...percentuais,
    status: flowResult.status,
    dataQuality,
  };
}

// --- Notas bimestrais agregadas (seção 8.4, revisão Fase 2C.1) — agregado
// por TURMA, nunca por estudante. `grade_entry_monitoring` só transcreve o
// relatório de preenchimento já feito pela escola no SIGE Escola. ---

export function calculateGradeEntryMonitoringIndicators(
  turmasDoAno: readonly Turma[],
  monitoring: readonly GradeEntryMonitoring[]
): GradeEntryMonitoringIndicators {
  const monitoringByTurmaId = new Map(monitoring.map(m => [m.turmaId, m] as const));
  const rows: TurmaGradeEntryRow[] = turmasDoAno.map(turma => ({
    turmaId: turma.id,
    turmaNome: turma.nome,
    monitoring: monitoringByTurmaId.get(turma.id) ?? null,
  }));
  const consolidated = consolidateGradeEntryMonitoring(rows);

  let dataQuality: DataQualityState;
  if (consolidated.turmasCadastradas === 0) {
    dataQuality = 'sem_dados';
  } else if (consolidated.turmasInconsistentes > 0) {
    dataQuality = 'inconsistente';
  } else if (consolidated.turmasComRelatorio === 0) {
    dataQuality = 'sem_dados';
  } else if (consolidated.turmasSemRelatorio === 0 && consolidated.turmasParciais === 0 && consolidated.turmasSemPreenchimento === 0) {
    dataQuality = 'atualizado';
  } else {
    dataQuality = 'incompleto';
  }

  // Revisão do code review do PR #17, seção 1: com ao menos uma turma
  // inconsistente, o percentual desta escola vira null — mesmo que
  // consolidateGradeEntryMonitoring já exclua a turma inconsistente da
  // soma (nunca contamina o número), apresentar um percentual calculado só
  // com as turmas restantes ainda passaria a falsa impressão de que TODO o
  // conjunto da escola é confiável. dataQuality 'inconsistente' já sinaliza
  // isso na interface; o percentual precisa concordar (null), não um
  // número parcial "escondido" atrás do badge.
  const percentualPreenchimentoGeral = consolidated.turmasInconsistentes > 0
    ? null
    : consolidated.percentualPreenchimentoGeral;

  return {
    turmasCadastradas: consolidated.turmasCadastradas,
    turmasComRelatorio: consolidated.turmasComRelatorio,
    turmasSemRelatorio: consolidated.turmasSemRelatorio,
    turmasCompletas: consolidated.turmasCompletas,
    turmasParciais: consolidated.turmasParciais,
    turmasSemPreenchimento: consolidated.turmasSemPreenchimento,
    expectedGradeEntries: consolidated.expectedGradeEntries,
    completedGradeEntries: consolidated.completedGradeEntries,
    percentualPreenchimentoGeral,
    dataQuality,
  };
}

// --- Visitas (seção 8.5) ---

export interface VisitLike {
  escola: string;
  data: string;
}

// Filtra pelo nome normalizado da escola — visitas não tem schoolId no
// schema atual (ver VisitasView.tsx), então nome normalizado é aqui a única
// identidade disponível, não um atalho de conveniência (seção 6 do plano:
// "usar nome normalizado somente para compatibilidade legada").
export function filterVisitasForSchool<T extends VisitLike>(
  visitas: readonly T[],
  escolaNome: string
): T[] {
  return visitas.filter(v => schoolNamesMatch(v.escola, escolaNome));
}

export function calculateVisitIndicators(
  visitasDaEscola: readonly VisitLike[],
  anoLetivo: number
): VisitIndicators {
  const doAno = visitasDaEscola.filter(v => v.data.startsWith(`${anoLetivo}-`));
  const quantidadeVisitasNoAno = doAno.length;
  const dataUltimaVisita = doAno.length === 0
    ? null
    : doAno.reduce((latest, v) => (v.data > latest ? v.data : latest), doAno[0].data);
  const semVisitaNoAno = quantidadeVisitasNoAno === 0;

  return {
    quantidadeVisitasNoAno,
    dataUltimaVisita,
    semVisitaNoAno,
    dataQuality: semVisitaNoAno ? 'sem_dados' : 'atualizado',
  };
}

// --- Resumo consolidado da carteira/visão global (seção 14 do plano) ---

// percentualPreenchimentoNotas é a soma de completedGradeEntries / soma de
// expectedGradeEntries de todas as escolas com notas disponíveis (revisão
// do code review do PR #17, seção 5) — NUNCA a média simples do percentual
// de cada escola, que pesaria uma escola pequena (poucos lançamentos
// esperados) exatamente igual a uma grande. Exemplo: escola A com 10
// lançamentos esperados e 100% preenchido, escola B com 1000 lançamentos
// esperados e 50% preenchido — a média simples diria 75%, mas o preenchimento
// real da carteira é (10 + 500) / (10 + 1000) ≈ 50.5%. null só quando a soma
// de expectedGradeEntries do conjunto considerado é zero (nunca 0%
// automático).
export function calculatePortfolioSituationSummary(
  situations: readonly SchoolSituation[]
): PortfolioSituationSummary {
  const escolasAcompanhadas = situations.length;
  const escolasComAnoConfigurado = situations.filter(s => s.estrutura.anoLetivoConfigurado).length;
  const turmasAtivas = situations.reduce((sum, s) => sum + s.estrutura.turmasAtivas, 0);
  const matriculaAtual = situations.reduce((sum, s) => sum + (s.estrutura.matriculaAtual ?? 0), 0);
  const escolasComRegistroMensalEmDia = situations.filter(
    s => s.estrutura.anoLetivoConfigurado && s.matricula.quantidadeMesesPendentes === 0
  ).length;

  // Revisão do code review do PR #17, seções 1 e 2: uma escola só entra na
  // soma ponderada (e no contador escolasComNotasConsideradas — o MESMO
  // conjunto filtrado alimenta os dois, nunca dois filtros divergentes)
  // quando:
  //   - notas != null (fonte grade_entry_monitoring carregou);
  //   - dataQuality !== 'indisponivel' (grade_entry_monitoring OK, mas
  //     turmas falhou — ver schoolSituationService.ts — nunca soma dado
  //     calculado a partir de fonte parcial, seção 9 do code review do PR
  //     #16, agora também aplicado à soma ponderada);
  //   - dataQuality !== 'inconsistente' (ao menos uma turma da escola tem
  //     contadores que não fecham matematicamente — mesmo com
  //     consolidateGradeEntryMonitoring já excluindo a turma inconsistente
  //     da soma da própria escola, a escola inteira fica de fora da
  //     carteira/visão global até a inconsistência ser corrigida, nunca
  //     silenciosamente incluída com um número parcial);
  //   - expectedGradeEntries > 0 (uma escola sem nenhum lançamento
  //     esperado — sem turma, ou nenhuma turma com relatório — não
  //     "contribui" com nada real à soma; contá-la como considerada
  //     sugeriria um dado que não existe).
  const comNotasDisponiveis = situations.filter(
    (s): s is SchoolSituation & { notas: NonNullable<SchoolSituation['notas']> } =>
      s.notas != null &&
      s.notas.dataQuality !== 'indisponivel' &&
      s.notas.dataQuality !== 'inconsistente' &&
      s.notas.expectedGradeEntries > 0
  );
  const totalExpectedGradeEntries = comNotasDisponiveis.reduce((sum, s) => sum + s.notas.expectedGradeEntries, 0);
  const totalCompletedGradeEntries = comNotasDisponiveis.reduce((sum, s) => sum + s.notas.completedGradeEntries, 0);
  const percentualPreenchimentoNotas = totalExpectedGradeEntries === 0
    ? null
    : (totalCompletedGradeEntries / totalExpectedGradeEntries) * 100;
  const escolasComNotasConsideradas = comNotasDisponiveis.length;

  // Revisão do code review do PR #16, seção 9: uma falha de leitura do
  // fluxo nunca conta como "fluxo não informado" — dataQuality
  // 'indisponivel' exclui a escola deste contador (nem soma como informado
  // nem contamina a leitura de quem realmente não informou nada).
  const escolasComFluxoInformado = situations.filter(
    s => s.fluxo.dataQuality !== 'indisponivel' && s.fluxo.status !== 'nao_informado'
  ).length;
  const escolasComPendencias = situations.filter(s => s.pendencias.length > 0).length;
  const escolasComFontesIndisponiveis = situations.filter(s => s.sourceFailures.length > 0).length;

  return {
    escolasAcompanhadas,
    escolasComAnoConfigurado,
    turmasAtivas,
    matriculaAtual,
    escolasComRegistroMensalEmDia,
    percentualPreenchimentoNotas,
    escolasComNotasConsideradas,
    escolasComFluxoInformado,
    escolasComPendencias,
    escolasComFontesIndisponiveis,
  };
}
