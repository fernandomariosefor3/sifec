// Fase 2D — Sala de Situação: cálculos puros, sem nenhum import do Firebase
// (mesmo padrão de enrollmentCalculations.ts/schoolFlowCalculations.ts/
// studentGradeCalculations.ts — testável sem emulador). Reaproveita ao
// máximo os cálculos já existentes das fases anteriores em vez de duplicar
// lógica: matrícula/cobertura mensal vem de enrollmentCalculations.ts,
// fluxo de schoolFlowCalculations.ts, preenchimento de notas de
// studentGradeCalculations.ts. Nada aqui persiste resultado algum — tudo é
// recalculado a partir dos dados já gravados nas coleções existentes (ver
// seção 6 do plano da Fase 2D).
import type { SchoolYear } from '../types/schoolYear';
import type { Turma } from '../types/classroom';
import type { EnrollmentSnapshot } from '../types/enrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { StudentRosterEntry } from '../types/studentRoster';
import type { StudentBimesterGrade } from '../types/studentBimesterGrade';
import type {
  DataQualityState,
  EnrollmentMovementIndicators,
  GradeFillIndicators,
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
import { consolidateStudentFill, determineFillState, EMPTY_SCORES, type StudentFillEntry } from './studentGradeCalculations';
import { schoolNamesMatch } from './schoolIdentity';

// --- Qualidade dos dados (seção 10 do plano) ---

// inconsistente sempre vence (qualquer inconsistência real importa mais que
// "incompleto"); só "sem_dados" em todos os domínios permanece sem_dados; só
// "atualizado" em todos os domínios permanece atualizado; qualquer mistura
// vira incompleto. Nunca persistido — recalculado sempre que os indicadores
// mudam.
export function combineDataQualityStates(states: readonly DataQualityState[]): DataQualityState {
  if (states.length === 0) return 'sem_dados';
  if (states.some(s => s === 'inconsistente')) return 'inconsistente';
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

// Meses "esperados" até agora dentro do ano letivo — nunca um mês FUTURO
// (seção 8.2 do plano: "não tratar um mês futuro como pendência"). Ano
// letivo já encerrado (anterior ao ano corrente): os 12 meses contam. Ano
// letivo ainda não iniciado (posterior ao ano corrente): nenhum mês conta.
// Ano letivo em curso: janeiro até o mês corrente (inclusive — o mês em
// andamento já é "esperado", mesmo que ainda não tenha terminado).
export function getExpectedMonthReferences(anoLetivo: number, now: Date = new Date()): string[] {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  let lastMonth: number;
  if (anoLetivo < currentYear) {
    lastMonth = 12;
  } else if (anoLetivo > currentYear) {
    return [];
  } else {
    lastMonth = currentMonth;
  }

  const months: string[] = [];
  for (let m = 1; m <= lastMonth; m += 1) {
    months.push(`${anoLetivo}-${String(m).padStart(2, '0')}`);
  }
  return months;
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

  const expectedMonths = getExpectedMonthReferences(anoLetivo, now);
  const quantidadeMesesRegistrados = expectedMonths.filter(month =>
    isMonthFullyCovered(month, snapshots, turmasAtivas)
  ).length;
  const quantidadeMesesPendentes = expectedMonths.length - quantidadeMesesRegistrados;

  const coverage = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmasAtivas);

  let dataQuality: DataQualityState;
  if (matriculaInicial == null && snapshots.length === 0) {
    dataQuality = 'sem_dados';
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

// --- Notas bimestrais agregadas (seção 8.4) — NUNCA nome de estudante. ---

export function calculateGradeFillIndicators(
  roster: readonly StudentRosterEntry[],
  grades: readonly StudentBimesterGrade[],
  referenceAverage?: number
): GradeFillIndicators {
  const gradeByRosterId = new Map(grades.map(g => [g.rosterId, g] as const));
  const entries: StudentFillEntry[] = roster.map(r => ({
    studentKey: r.studentKey,
    active: r.active,
    scores: gradeByRosterId.get(r.id)?.scores ?? null,
  }));
  const consolidated = consolidateStudentFill(entries, referenceAverage);

  const turmaIds = Array.from(new Set(roster.filter(r => r.active).map(r => r.turmaId)));
  let turmasComPreenchimentoCompleto = 0;
  let turmasComPendencia = 0;
  for (const turmaId of turmaIds) {
    const ativosDaTurma = roster.filter(r => r.active && r.turmaId === turmaId);
    const todosCompletos = ativosDaTurma.every(r => {
      const scores = gradeByRosterId.get(r.id)?.scores ?? EMPTY_SCORES;
      return determineFillState(scores) === 'completo';
    });
    if (todosCompletos) turmasComPreenchimentoCompleto += 1;
    else turmasComPendencia += 1;
  }

  const dataQuality: DataQualityState = consolidated.estudantesAtivos === 0
    ? 'sem_dados'
    : (consolidated.percentualPreenchimento === 100 ? 'atualizado' : 'incompleto');

  return {
    estudantesAtivos: consolidated.estudantesAtivos,
    completos: consolidated.completos,
    parciais: consolidated.parciais,
    semNotas: consolidated.semNotas,
    abaixoReferencia: consolidated.abaixoReferencia,
    percentualPreenchimento: consolidated.percentualPreenchimento,
    turmasComPreenchimentoCompleto,
    turmasComPendencia,
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

// percentualPreenchimentoNotas é a média simples do percentual de cada
// escola que já teve notas carregadas (nunca uma média ponderada por
// matrícula, que exigiria carregar notas de todas as escolas mesmo na
// visão global — ver seção 13 do plano) — null quando nenhuma escola do
// conjunto teve notas carregadas ainda (nunca 0, que seria um resultado
// real e diferente de "ainda não carregado").
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

  const comNotasCarregadas = situations.filter((s): s is SchoolSituation & { notas: NonNullable<SchoolSituation['notas']> } => s.notas != null);
  const percentualPreenchimentoNotas = comNotasCarregadas.length === 0
    ? null
    : comNotasCarregadas.reduce((sum, s) => sum + s.notas.percentualPreenchimento, 0) / comNotasCarregadas.length;

  const escolasComFluxoInformado = situations.filter(s => s.fluxo.status !== 'nao_informado').length;
  const escolasComPendencias = situations.filter(s => s.pendencias.length > 0).length;

  return {
    escolasAcompanhadas,
    escolasComAnoConfigurado,
    turmasAtivas,
    matriculaAtual,
    escolasComRegistroMensalEmDia,
    percentualPreenchimentoNotas,
    escolasComFluxoInformado,
    escolasComPendencias,
  };
}
