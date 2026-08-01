// Fase 2D — Sala de Situação: orquestração assíncrona (Firestore) em torno
// dos cálculos puros de schoolSituationCalculations.ts/Pendencies.ts/
// Inconsistencies.ts. Nunca consulta grade_entry_monitoring sem schoolId
// (seção 13 do plano) e nunca processa mais de DEFAULT_SITUATION_CONCURRENCY
// escolas em paralelo — nem na visão global de 56 escolas. Uma falha ao
// carregar uma coleção nunca apaga os indicadores das outras coleções já
// carregadas (seção 16 do plano): cada fonte é buscada isoladamente por
// loadSource, que devolve um SourceLoadResult (success/failure/
// not_requested) em vez de um fallback silencioso — o chamador decide o que
// fazer com uma falha em vez de um valor vazio se disfarçar de "sem_dados"
// (revisão do code review do PR #16, seção 3).
//
// Fase 2C.1 — correção de escopo: notas passa a vir de
// `grade_entry_monitoring` (agregado por turma), nunca mais de
// `student_rosters`/`student_bimester_grades` (protótipo nominal
// descontinuado, agora bloqueado em firestore.rules — ver
// docs/descontinuacao-prototipo-notas-nominais.md).
//
// Revisão do code review do PR #16, seção 5: turmas/visitas NUNCA leem a
// coleção inteira — turmas é consultado só pelas escolas do escopo visível
// (query chunked por escolaId, nunca mais de TURMA_QUERY_CHUNK_SIZE IDs por
// consulta), e visitas é consultado uma escola de cada vez, com um pool de
// concorrência (nunca where-in com todas as escolas de uma visão global).
// O resultado de visitas é sanitizado para {escola, data} imediatamente ao
// sair do Firestore — nenhum outro campo do documento (tecnico/foco/status)
// chega a existir fora desta função.
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Turma } from '../types/classroom';
import type { SchoolYear } from '../types/schoolYear';
import type { EnrollmentSnapshot } from '../types/enrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { Bimestre, GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import type {
  DataQualityState,
  SchoolSituation,
  SchoolSituationSourceAvailability,
  SchoolSituationSourceFailure,
  SourceLoadResult,
} from '../types/schoolSituation';

import { listSchoolYearsForSchool } from './schoolYearService';
import { listEnrollmentSnapshotsForSchool } from './enrollmentSnapshotService';
import { listSchoolFlowResultsForSchoolYear } from './schoolFlowService';
import { listGradeEntryMonitoringForSchool } from './gradeEntryMonitoringService';
import { getClassroomsForSchool } from './classService';
import {
  calculateEnrollmentMovementIndicators,
  calculateFlowIndicators,
  calculateGradeEntryMonitoringIndicators,
  calculateStructureIndicators,
  calculateVisitIndicators,
  combineDataQualityStates,
  filterVisitasForSchool,
  type VisitLike,
} from './schoolSituationCalculations';
import { buildPendingItems } from './schoolSituationPendencies';
import { detectInconsistencies } from './schoolSituationInconsistencies';

export const DEFAULT_SITUATION_CONCURRENCY = 4;
// Pool de concorrência para consultas de visitas (uma escola por vez, nunca
// where-in com 56 escolas — seção 5 do code review). Mantido entre 3 e 5,
// como o plano pede.
export const VISIT_QUERY_CONCURRENCY = 4;
// Limite de valores por consulta `in` do Firestore.
export const TURMA_QUERY_CHUNK_SIZE = 30;

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

async function loadSource<T>(source: string, task: () => Promise<T>): Promise<SourceLoadResult<T>> {
  try {
    return { status: 'success', data: await task() };
  } catch (err) {
    return { status: 'failure', error: { source, message: errorMessage(err, `Não foi possível carregar dados de ${source}.`) } };
  }
}

function isAvailable(result: SourceLoadResult<unknown>): boolean {
  return result.status !== 'failure';
}

function dataOr<T>(result: SourceLoadResult<T>, fallback: T): T {
  return result.status === 'success' ? result.data : fallback;
}

function failureOf(result: SourceLoadResult<unknown>): SchoolSituationSourceFailure | null {
  return result.status === 'failure' ? result.error : null;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sanitizeVisitaDoc(raw: unknown): VisitLike {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    escola: typeof record.escola === 'string' ? record.escola : '',
    data: typeof record.data === 'string' ? record.data : '',
  };
}

// Sobrescreve dataQuality para 'indisponivel' quando alguma das fontes de
// que o indicador depende falhou — nunca deixa o resultado do cálculo puro
// (que não distingue "vazio de verdade" de "não conseguimos ler") se passar
// por um "sem_dados"/"incompleto" real (seção 3 do code review do PR #16).
function withUnavailableOverride<T extends { dataQuality: DataQualityState }>(
  indicator: T,
  sourcesAvailable: boolean
): T {
  return sourcesAvailable ? indicator : { ...indicator, dataQuality: 'indisponivel' };
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

// Turmas do escopo visível — nunca a coleção inteira (seção 5 do code
// review). Consulta por `escolaId in chunk`: escolaId é obrigatório em
// todo documento de `turmas` (inclusive os legados anteriores à Fase 2A) e,
// para documentos novos, firestore.rules já exige escolaId === schoolId na
// criação — então uma única consulta por escolaId já cobre tanto os
// documentos com schoolId quanto os legados sem ele, sem precisar de uma
// segunda consulta por schoolId. Turmas identificáveis SÓ pelo nome (sem
// escolaId reconhecível nesta lista de escolas) não são cobertas por esta
// consulta — tradeoff aceito e documentado: o objetivo desta seção é parar
// de baixar a coleção inteira, e esse caso residual é tratado como dado
// legado incompleto demais para ser localizado sem uma leitura ampla.
export async function fetchTurmasForSchools(schoolIds: readonly string[]): Promise<SourceLoadResult<Turma[]>> {
  if (schoolIds.length === 0) return { status: 'success', data: [] };

  const chunks = chunkArray(schoolIds, TURMA_QUERY_CHUNK_SIZE);
  const byId = new Map<string, Turma>();
  try {
    const chunkResults = await Promise.all(
      chunks.map(chunk => getDocs(query(collection(db, 'turmas'), where('escolaId', 'in', chunk))))
    );
    for (const snap of chunkResults) {
      for (const d of snap.docs) {
        const turma = d.data() as Turma;
        byId.set(turma.id, turma);
      }
    }
    return { status: 'success', data: Array.from(byId.values()) };
  } catch (err) {
    return { status: 'failure', error: { source: 'turmas', message: errorMessage(err, 'Não foi possível carregar turmas do escopo atual.') } };
  }
}

// Visitas do escopo visível — uma escola por vez, com um pool de
// concorrência (nunca where-in com todas as escolas — seção 5 do code
// review). Falha isolada por escola: a visita de uma escola nunca some por
// causa de outra. O resultado já sai SANITIZADO para {escola, data} — a
// função nunca retorna (nem mantém em memória além deste escopo)
// observação, pauta, participantes, anexos ou qualquer outro campo do
// documento de visita, mesmo que o Firestore devolva o documento completo.
export async function fetchVisitasForSchools(
  schools: readonly SchoolSituationSchoolInput[]
): Promise<Record<string, SourceLoadResult<VisitLike[]>>> {
  const results = await mapWithConcurrencyLimit(schools, VISIT_QUERY_CONCURRENCY, async school => {
    try {
      const snap = await getDocs(query(collection(db, 'visitas'), where('escola', '==', school.nome)));
      const visitas: VisitLike[] = snap.docs.map(d => sanitizeVisitaDoc(d.data()));
      return [school.id, { status: 'success', data: visitas } as SourceLoadResult<VisitLike[]>] as const;
    } catch (err) {
      return [school.id, {
        status: 'failure',
        error: { source: 'visitas', message: errorMessage(err, `Não foi possível carregar visitas de ${school.nome}.`) },
      } as SourceLoadResult<VisitLike[]>] as const;
    }
  });
  return Object.fromEntries(results);
}

interface CoreSourcesLoadResult {
  schoolYearDocs: SchoolYear[];
  snapshots: EnrollmentSnapshot[];
  flowResultDocs: SchoolFlowResult[];
  schoolYearAvailable: boolean;
  snapshotsAvailable: boolean;
  flowAvailable: boolean;
  failures: SchoolSituationSourceFailure[];
}

// As três fontes escolares que TODA escola desta fase consulta,
// independentemente de includeGrades — school_years/enrollment_snapshots/
// school_flow_results. listSchoolYearsForSchool/listSchoolFlowResultsForSchoolYear
// (sem limit(1)) em vez de getSchoolYear/getSchoolFlowResult: a duplicidade
// pela chave natural só é detectável enxergando mais de um documento (ver
// schoolSituationInconsistencies.ts).
async function loadCoreSources(school: SchoolSituationSchoolInput, anoLetivo: number): Promise<CoreSourcesLoadResult> {
  const [schoolYearsResult, snapshotsResult, flowResultsResult] = await Promise.all([
    loadSource<SchoolYear[]>('school_years', () => listSchoolYearsForSchool(school.id, anoLetivo)),
    loadSource<EnrollmentSnapshot[]>('enrollment_snapshots', () => listEnrollmentSnapshotsForSchool(school.id, anoLetivo)),
    loadSource<SchoolFlowResult[]>('school_flow_results', () => listSchoolFlowResultsForSchoolYear(school.id, anoLetivo)),
  ]);
  const failures: SchoolSituationSourceFailure[] = [];
  for (const result of [schoolYearsResult, snapshotsResult, flowResultsResult]) {
    const failure = failureOf(result);
    if (failure) failures.push(failure);
  }
  return {
    schoolYearDocs: dataOr(schoolYearsResult, []),
    snapshots: dataOr(snapshotsResult, []),
    flowResultDocs: dataOr(flowResultsResult, []),
    schoolYearAvailable: isAvailable(schoolYearsResult),
    snapshotsAvailable: isAvailable(snapshotsResult),
    flowAvailable: isAvailable(flowResultsResult),
    failures,
  };
}

interface GradeEntryMonitoringLoadResult {
  monitoring: GradeEntryMonitoring[];
  notas: ReturnType<typeof calculateGradeEntryMonitoringIndicators> | null;
  monitoringAvailable: boolean;
  failures: SchoolSituationSourceFailure[];
}

// Só chamada quando includeGrades é true (seção 13 do plano — nunca carrega
// notas das 56 escolas de uma vez na visão global sem escola selecionada).
// Se grade_entry_monitoring falhou, notas fica indisponível — nunca
// calculado a partir de dado parcial (seção 3 do code review). turmasDoAno
// já vem resolvido pelo chamador (mesmo conjunto usado por
// calculateStructureIndicators) — o indicador de notas precisa saber de
// TODA turma cadastrada, mesmo as que ainda não têm relatório informado.
// Diferente do protótipo nominal anterior (onde roster/grades carregavam a
// identidade da turma denormalizada em cada documento), este indicador
// agora DEPENDE da lista de turmas para enumerar "turmas sem relatório" —
// então uma falha em turmas também precisa marcar notas como
// 'indisponivel' (withUnavailableOverride), senão turmasDoAno cai no
// fallback vazio de fetchSchoolSituation e o indicador mostraria
// "sem_dados" mesmo com grade_entry_monitoring tendo carregado com sucesso
// (mesmo cuidado de estrutura/matricula, seção 3 do code review do PR #16).
async function loadGradeEntryMonitoringData(
  school: SchoolSituationSchoolInput,
  anoLetivo: number,
  bimestre: Bimestre,
  turmasDoAno: readonly Turma[],
  turmasAvailable: boolean
): Promise<GradeEntryMonitoringLoadResult> {
  const monitoringResult = await loadSource<GradeEntryMonitoring[]>('grade_entry_monitoring', () =>
    listGradeEntryMonitoringForSchool(school.id, anoLetivo, bimestre));

  const failures: SchoolSituationSourceFailure[] = [];
  const monitoringFailure = failureOf(monitoringResult);
  if (monitoringFailure) failures.push(monitoringFailure);

  const monitoringAvailable = isAvailable(monitoringResult);
  const monitoring = dataOr(monitoringResult, []);
  const notas = monitoringAvailable
    ? withUnavailableOverride(calculateGradeEntryMonitoringIndicators(turmasDoAno, monitoring), turmasAvailable)
    : null;

  return { monitoring, notas, monitoringAvailable, failures };
}

// Uma escola por vez, nunca a coleção completa (mesmo padrão de
// listGradeEntryMonitoringForSchool). turmas e visitas chegam já resolvidas
// pelo chamador (fetchTurmasForSchools/
// fetchVisitasForSchools, uma única vez por sessão de consulta) como
// SourceLoadResult — uma falha em qualquer uma das duas nunca impede o
// cálculo dos outros indicadores desta escola (seção 4 do code review).
export async function fetchSchoolSituation(
  school: SchoolSituationSchoolInput,
  turmasResult: SourceLoadResult<readonly Turma[]>,
  visitasResult: SourceLoadResult<readonly VisitLike[]>,
  anoLetivo: number,
  options: FetchSchoolSituationOptions
): Promise<SchoolSituation> {
  const failures: SchoolSituationSourceFailure[] = [];
  const turmasFailure = failureOf(turmasResult);
  if (turmasFailure) failures.push(turmasFailure);
  const visitasFailure = failureOf(visitasResult);
  if (visitasFailure) failures.push(visitasFailure);

  const core = await loadCoreSources(school, anoLetivo);
  failures.push(...core.failures);
  const { schoolYearDocs, snapshots, flowResultDocs } = core;
  const schoolYear = schoolYearDocs[0] ?? null;
  const flowResult = flowResultDocs[0] ?? null;

  const turmasAvailable = isAvailable(turmasResult);
  const turmasDoEscopo = dataOr(turmasResult, []);
  const turmasDaEscola = turmasAvailable ? getClassroomsForSchool(turmasDoEscopo, school) : [];
  const turmasDoAno = turmasDaEscola.filter(t => t.anoLetivo === anoLetivo);
  const turmasSemAnoLetivo = turmasAvailable ? turmasDaEscola.filter(t => t.anoLetivo == null).length : 0;

  let monitoring: GradeEntryMonitoring[] = [];
  let notas: ReturnType<typeof calculateGradeEntryMonitoringIndicators> | null = null;
  let monitoringAvailable = false;
  if (options.includeGrades) {
    const gradesData = await loadGradeEntryMonitoringData(school, anoLetivo, options.bimestre, turmasDoAno, turmasAvailable);
    monitoring = gradesData.monitoring;
    notas = gradesData.notas;
    monitoringAvailable = gradesData.monitoringAvailable;
    failures.push(...gradesData.failures);
  }

  const availability: SchoolSituationSourceAvailability = {
    schoolYear: core.schoolYearAvailable,
    turmas: turmasAvailable,
    snapshots: core.snapshotsAvailable,
    flow: core.flowAvailable,
    gradeEntryMonitoring: monitoringAvailable,
    visitas: isAvailable(visitasResult),
  };

  // estrutura mistura school_years (matrícula/ano configurado) e turmas
  // (contagens); matrícula mensal depende ADEMAIS de enrollment_snapshots e
  // da cobertura por turma ativa — qualquer falha entre as fontes de que um
  // indicador depende vira 'indisponivel' nele, nunca o resultado calculado
  // a partir do fallback vazio como se fosse um "sem_dados"/"incompleto"
  // real (seção 3 do code review do PR #16).
  const estrutura = withUnavailableOverride(
    calculateStructureIndicators(schoolYear, turmasDoAno),
    availability.schoolYear && availability.turmas
  );
  const matricula = withUnavailableOverride(
    calculateEnrollmentMovementIndicators(schoolYear, snapshots, turmasDoAno, anoLetivo),
    availability.schoolYear && availability.snapshots && availability.turmas
  );
  const fluxo = withUnavailableOverride(calculateFlowIndicators(flowResult), availability.flow);

  const visitasDaEscola = isAvailable(visitasResult) ? filterVisitasForSchool(dataOr(visitasResult, []), school.nome) : [];
  const visitas = withUnavailableOverride(calculateVisitIndicators(visitasDaEscola, anoLetivo), availability.visitas);

  const turmasById = new Map((availability.turmas ? turmasDoEscopo : []).map(t => [t.id, t] as const));
  const inconsistencias = detectInconsistencies({
    schoolId: school.id,
    codInep: school.codInep,
    anoLetivo,
    turmasDoAno,
    turmasById,
    snapshots,
    monitoring,
    flowResult,
    availability,
    schoolYearDocs,
    flowResultDocs,
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
    availability,
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

export interface FetchPortfolioSituationsOptions extends FetchSchoolSituationOptions {
  concurrency?: number;
}

// Uma falha inesperada ao processar UMA escola (fora do que loadSource já
// isola por coleção dentro de fetchSchoolSituation) nunca derruba o lote
// inteiro — as demais escolas do conjunto mantêm seus indicadores normais.
export async function fetchPortfolioSituations(
  schools: readonly SchoolSituationSchoolInput[],
  turmasResult: SourceLoadResult<readonly Turma[]>,
  visitasResults: Readonly<Record<string, SourceLoadResult<readonly VisitLike[]>>>,
  anoLetivo: number,
  options: FetchPortfolioSituationsOptions
): Promise<Record<string, SchoolSituation>> {
  const concurrency = options.concurrency ?? DEFAULT_SITUATION_CONCURRENCY;
  const results = await mapWithConcurrencyLimit(schools, concurrency, async school => {
    const visitasResult: SourceLoadResult<readonly VisitLike[]> = visitasResults[school.id] ?? { status: 'not_requested' };
    try {
      return await fetchSchoolSituation(school, turmasResult, visitasResult, anoLetivo, options);
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
      mediaAlunosPorTurma: null, anoLetivoConfigurado: false, dataQuality: 'indisponivel',
    },
    matricula: {
      matriculaInicial: null, novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0,
      abandono: 0, outrasSaidas: 0, matriculaFinalCalculada: null, ultimoMesPreenchido: null,
      quantidadeMesesRegistrados: 0, quantidadeMesesPendentes: 0, dataQuality: 'indisponivel',
    },
    fluxo: {
      aprovados: 0, reprovados: 0, abandono: 0, totalInformado: 0, percentualAprovacao: 0,
      percentualReprovacao: 0, percentualAbandono: 0, status: 'nao_informado', dataQuality: 'indisponivel',
    },
    notas: null,
    visitas: { quantidadeVisitasNoAno: 0, dataUltimaVisita: null, semVisitaNoAno: true, dataQuality: 'indisponivel' },
    pendencias: [],
    inconsistencias: [],
    qualidadeGeral: 'indisponivel',
    sourceFailures: [{ source: 'schoolSituation', message }],
  };
}
