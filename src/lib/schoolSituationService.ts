// Fase 2D — Sala de Situação: orquestração assíncrona (Firestore) em torno
// dos cálculos puros de schoolSituationCalculations.ts/Pendencies.ts/
// Inconsistencies.ts. Nunca consulta student_rosters/student_bimester_grades
// sem schoolId (seção 13 do plano) e nunca processa mais de
// DEFAULT_SITUATION_CONCURRENCY escolas em paralelo — nem na visão global
// de 56 escolas. Uma falha ao carregar uma coleção nunca apaga os
// indicadores das outras coleções já carregadas (seção 16 do plano): cada
// fonte é buscada isoladamente por safeFetch, que registra a falha em
// sourceFailures e segue com um valor padrão em vez de propagar a exceção.
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { Turma } from '../types/classroom';
import type { SchoolYear } from '../types/schoolYear';
import type { EnrollmentSnapshot } from '../types/enrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { StudentRosterEntry } from '../types/studentRoster';
import type { Bimestre, StudentBimesterGrade } from '../types/studentBimesterGrade';
import type { SchoolSituation, SchoolSituationSourceFailure } from '../types/schoolSituation';

import { getSchoolYear } from './schoolYearService';
import { listEnrollmentSnapshotsForSchool } from './enrollmentSnapshotService';
import { getSchoolFlowResult } from './schoolFlowService';
import { listStudentRosterForSchool } from './studentRosterService';
import { listStudentBimesterGradesForSchool } from './studentBimesterGradeService';
import { getClassroomsForSchool } from './classService';
import {
  calculateEnrollmentMovementIndicators,
  calculateFlowIndicators,
  calculateGradeFillIndicators,
  calculateStructureIndicators,
  calculateVisitIndicators,
  combineDataQualityStates,
  filterVisitasForSchool,
  type VisitLike,
} from './schoolSituationCalculations';
import { buildPendingItems } from './schoolSituationPendencies';
import { detectInconsistencies } from './schoolSituationInconsistencies';

export const DEFAULT_SITUATION_CONCURRENCY = 4;

export interface SchoolSituationSchoolInput {
  id: string;
  nome: string;
  codInep: string;
}

export interface FetchSchoolSituationOptions {
  // false na visão global sem escola selecionada (seção 13 do plano: nunca
  // carregar nomes/notas das 56 escolas de uma vez).
  includeGrades: boolean;
  bimestre: Bimestre;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

async function safeFetch<T>(
  source: string,
  fallback: T,
  task: () => Promise<T>,
  failures: SchoolSituationSourceFailure[]
): Promise<T> {
  try {
    return await task();
  } catch (err) {
    failures.push({ source, message: errorMessage(err, `Não foi possível carregar dados de ${source}.`) });
    return fallback;
  }
}

// Uma escola por vez, nunca a coleção completa (mesmo padrão de
// listStudentRosterForSchool/listStudentBimesterGradesForSchool). turmas e
// visitas são recebidas já carregadas (uma única vez por sessão de consulta
// — schools/turmas/visitas têm leitura de coleção inteira liberada por
// firestore.rules, isAuthorized() sozinho, ao contrário das coleções
// escolares que exigem schoolId).
export async function fetchSchoolSituation(
  school: SchoolSituationSchoolInput,
  allTurmas: readonly Turma[],
  allVisitas: readonly VisitLike[],
  anoLetivo: number,
  options: FetchSchoolSituationOptions
): Promise<SchoolSituation> {
  const failures: SchoolSituationSourceFailure[] = [];

  const [schoolYear, snapshots, flowResult] = await Promise.all([
    safeFetch<SchoolYear | null>('school_years', null, () => getSchoolYear(school.id, anoLetivo), failures),
    safeFetch<EnrollmentSnapshot[]>('enrollment_snapshots', [], () => listEnrollmentSnapshotsForSchool(school.id, anoLetivo), failures),
    safeFetch<SchoolFlowResult | null>('school_flow_results', null, () => getSchoolFlowResult(school.id, anoLetivo), failures),
  ]);

  const turmasDaEscola = getClassroomsForSchool(allTurmas, school);
  const turmasDoAno = turmasDaEscola.filter(t => t.anoLetivo === anoLetivo);
  const turmasSemAnoLetivo = turmasDaEscola.filter(t => t.anoLetivo == null).length;

  const estrutura = calculateStructureIndicators(schoolYear, turmasDoAno);
  const matricula = calculateEnrollmentMovementIndicators(schoolYear, snapshots, turmasDoAno, anoLetivo);
  const fluxo = calculateFlowIndicators(flowResult);

  let roster: StudentRosterEntry[] = [];
  let grades: StudentBimesterGrade[] = [];
  let notas = null as ReturnType<typeof calculateGradeFillIndicators> | null;
  if (options.includeGrades) {
    [roster, grades] = await Promise.all([
      safeFetch<StudentRosterEntry[]>('student_rosters', [], () => listStudentRosterForSchool(school.id, anoLetivo), failures),
      safeFetch<StudentBimesterGrade[]>(
        'student_bimester_grades', [],
        () => listStudentBimesterGradesForSchool(school.id, anoLetivo, options.bimestre),
        failures
      ),
    ]);
    notas = calculateGradeFillIndicators(roster, grades);
  }

  const visitasDaEscola = filterVisitasForSchool(allVisitas, school.nome);
  const visitas = calculateVisitIndicators(visitasDaEscola, anoLetivo);

  const turmasById = new Map(allTurmas.map(t => [t.id, t] as const));
  const inconsistencias = detectInconsistencies({
    schoolId: school.id,
    codInep: school.codInep,
    anoLetivo,
    turmasDoAno,
    turmasById,
    snapshots,
    roster,
    grades,
    flowResult,
  });

  const pendencias = buildPendingItems({
    schoolId: school.id,
    anoLetivo,
    estrutura,
    matricula,
    fluxo,
    notas,
    visitas,
    turmasSemAnoLetivo,
  });

  const qualidadeGeral = combineDataQualityStates(
    inconsistencias.length > 0
      ? ['inconsistente']
      : [estrutura.dataQuality, matricula.dataQuality, fluxo.dataQuality, visitas.dataQuality, ...(notas ? [notas.dataQuality] : [])]
  );

  return {
    schoolId: school.id,
    codInep: school.codInep,
    escolaNome: school.nome,
    anoLetivo,
    estrutura,
    matricula,
    fluxo,
    notas,
    visitas,
    pendencias,
    inconsistencias,
    qualidadeGeral,
    sourceFailures: failures,
  };
}

// Pool de workers de tamanho fixo (nunca Promise.all direto sobre todas as
// escolas) — garante que no máximo `limit` escolas tenham consultas em
// andamento ao mesmo tempo, mesmo na visão global de 56 escolas (seção 13
// do plano). A ordem dos resultados é preservada (mapeada de volta por
// índice), não pela ordem de conclusão.
export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, runNext));
  return results;
}

export interface FetchPortfolioSituationsOptions extends FetchSchoolSituationOptions {
  concurrency?: number;
}

// Uma falha inesperada ao processar UMA escola (fora do que safeFetch já
// isola por coleção dentro de fetchSchoolSituation) nunca derruba o lote
// inteiro — as demais escolas do conjunto mantêm seus indicadores normais.
export async function fetchPortfolioSituations(
  schools: readonly SchoolSituationSchoolInput[],
  allTurmas: readonly Turma[],
  allVisitas: readonly VisitLike[],
  anoLetivo: number,
  options: FetchPortfolioSituationsOptions
): Promise<Record<string, SchoolSituation>> {
  const concurrency = options.concurrency ?? DEFAULT_SITUATION_CONCURRENCY;
  const results = await mapWithConcurrencyLimit(schools, concurrency, async school => {
    try {
      return await fetchSchoolSituation(school, allTurmas, allVisitas, anoLetivo, options);
    } catch (err) {
      return buildFailedSchoolSituation(school, anoLetivo, errorMessage(err, 'Não foi possível carregar a situação desta escola.'));
    }
  });
  return Object.fromEntries(schools.map((school, i) => [school.id, results[i]] as const));
}

function buildFailedSchoolSituation(
  school: SchoolSituationSchoolInput,
  anoLetivo: number,
  message: string
): SchoolSituation {
  return {
    schoolId: school.id,
    codInep: school.codInep,
    escolaNome: school.nome,
    anoLetivo,
    estrutura: {
      turmasCadastradas: 0, turmasAtivas: 0, matriculaInicial: null, matriculaAtual: null,
      mediaAlunosPorTurma: null, anoLetivoConfigurado: false, dataQuality: 'sem_dados',
    },
    matricula: {
      matriculaInicial: null, novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0,
      abandono: 0, outrasSaidas: 0, matriculaFinalCalculada: null, ultimoMesPreenchido: null,
      quantidadeMesesRegistrados: 0, quantidadeMesesPendentes: 0, dataQuality: 'sem_dados',
    },
    fluxo: {
      aprovados: 0, reprovados: 0, abandono: 0, totalInformado: 0, percentualAprovacao: 0,
      percentualReprovacao: 0, percentualAbandono: 0, status: 'nao_informado', dataQuality: 'sem_dados',
    },
    notas: null,
    visitas: { quantidadeVisitasNoAno: 0, dataUltimaVisita: null, semVisitaNoAno: true, dataQuality: 'sem_dados' },
    pendencias: [],
    inconsistencias: [],
    qualidadeGeral: 'sem_dados',
    sourceFailures: [{ source: 'schoolSituation', message }],
  };
}

// Fetch único (não uma subscrição em tempo real): a Sala de Situação é um
// painel de leitura/análise, atualizado por um botão "Atualizar" explícito
// (seção 5 do plano — módulo de leitura, não escrita). `schools`/`turmas`/
// `visitas` têm leitura de coleção inteira liberada por firestore.rules
// (isAuthorized() sozinho, sem exigir schoolId) — mesmo padrão já usado por
// VisitasView.tsx/FluxoView.tsx via subscribeToCollection.
export async function fetchAllTurmas(): Promise<Turma[]> {
  const snap = await getDocs(collection(db, 'turmas'));
  return snap.docs.map(d => d.data() as Turma);
}

export async function fetchAllVisitas(): Promise<VisitLike[]> {
  const snap = await getDocs(collection(db, 'visitas'));
  return snap.docs.map(d => d.data() as VisitLike);
}
