// Fase 2A — resumo de matrícula por escola para a tabela de Gestão de
// Escolas. Busca school_years/enrollment_snapshots POR ESCOLA (nunca a
// coleção inteira sem filtro): é o único jeito de respeitar a regra de
// leitura restrita por schoolId dessas coleções (ver firestore.rules) e
// funciona igualmente para admin e para superintendente. `turmas` continua
// com leitura ampla (regra inalterada), então essa parte é uma única
// subscrição normal.
import { useCallback, useEffect, useState } from 'react';
import { subscribeToCollection, SEED_TURMAS } from '../lib/firebaseService';
import { getSchoolYear } from '../lib/schoolYearService';
import { listEnrollmentSnapshotsForSchool } from '../lib/enrollmentSnapshotService';
import { getActiveClassroomCount, getClassroomsForSchool } from '../lib/classService';
import {
  calculateAccumulatedTotals,
  calculateAverageStudentsPerClass,
  calculateCurrentSchoolEnrollmentCoverage,
  calculateEnrollmentVariation,
  calculateUltimaAtualizacao,
} from '../lib/enrollmentCalculations';
import { DEMO_SCHOOL_YEARS_2026 } from '../data/demoSchoolYears';
import type { Turma } from '../types/classroom';

const ANO_LETIVO = 2026;

export interface SchoolEnrollmentSummary {
  matriculaInicial: number | null;
  matriculaAtual: number | null;
  variacao: number | null;
  turmasAtivas: number;
  mediaPorTurma: number | null;
  entradasAcumuladas: number;
  saidasAcumuladas: number;
  ultimaAtualizacao: string | null;
  // Cobertura mensal (seção 6 da revisão final PR #8) — ver
  // calculateCurrentSchoolEnrollmentCoverage. `matriculaAtual` só reflete
  // coverageComplete === true; quando false, é sempre null e estes campos
  // servem de informação auxiliar ("Parcial: X em Y de Z turmas").
  coverageComplete: boolean;
  coveredClassCount: number;
  partialMatriculaAtual: number;
}

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

async function loadSummaryForSchool(
  school: SchoolLike,
  turmasDaEscola: Turma[],
  isFirebaseMode: boolean
): Promise<SchoolEnrollmentSummary> {
  const turmasAtivas = getActiveClassroomCount(turmasDaEscola);

  if (!isFirebaseMode) {
    const demo = DEMO_SCHOOL_YEARS_2026[school.id];
    const matriculaInicial = demo?.schoolYear.matriculaInicial ?? null;
    const matriculaAtual = demo?.schoolYear.matriculaAtual ?? null;
    return {
      matriculaInicial,
      matriculaAtual,
      variacao: calculateEnrollmentVariation(matriculaInicial, matriculaAtual),
      turmasAtivas,
      mediaPorTurma: calculateAverageStudentsPerClass(matriculaAtual, turmasAtivas),
      entradasAcumuladas: demo?.totals.entradasAcumuladas ?? 0,
      saidasAcumuladas: demo?.totals.saidasAcumuladas ?? 0,
      ultimaAtualizacao: demo?.schoolYear.ultimaAtualizacao ?? null,
      coverageComplete: matriculaAtual != null,
      coveredClassCount: turmasAtivas,
      partialMatriculaAtual: matriculaAtual ?? 0,
    };
  }

  const [schoolYear, snapshots] = await Promise.all([
    getSchoolYear(school.id, ANO_LETIVO),
    listEnrollmentSnapshotsForSchool(school.id, ANO_LETIVO),
  ]);
  const totals = calculateAccumulatedTotals(snapshots);
  const matriculaInicial = schoolYear?.matriculaInicial ?? null;
  // Cobertura por turma (seção 5 da revisão final PR #8) — nunca apresenta
  // um total PARCIAL como se fosse a matrícula completa da escola.
  // Precedência final: 1) total completo calculado por turma; 2)
  // school_years.matriculaAtual como fallback; 3) null — "Não informado".
  const coverage = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmasDaEscola);
  const matriculaAtual = coverage.total ?? schoolYear?.matriculaAtual ?? null;

  return {
    matriculaInicial,
    matriculaAtual,
    variacao: calculateEnrollmentVariation(matriculaInicial, matriculaAtual),
    turmasAtivas,
    mediaPorTurma: calculateAverageStudentsPerClass(matriculaAtual, turmasAtivas),
    entradasAcumuladas: totals.entradasAcumuladas,
    coverageComplete: coverage.complete,
    coveredClassCount: coverage.coveredClassCount,
    partialMatriculaAtual: coverage.partialTotal,
    saidasAcumuladas: totals.saidasAcumuladas,
    // Data mais recente entre school_year, snapshots e turmas (seção 9 da
    // revisão final PR #8) — nunca prioriza uma data antiga de school_year.
    ultimaAtualizacao: calculateUltimaAtualizacao(schoolYear, snapshots, turmasDaEscola),
  };
}

export function useSchoolEnrollmentSummaries(schools: readonly SchoolLike[], isFirebaseMode: boolean) {
  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [summaries, setSummaries] = useState<Record<string, SchoolEnrollmentSummary>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Incrementado por refresh() para forçar o efeito abaixo a rodar de novo
  // sem depender de uma mudança em `schools`/`turmas` — usado pelo painel
  // da escola para atualizar a tabela principal depois de salvar um
  // registro mensal, configuração anual ou turma, sem exigir reload manual
  // (seção 8 do plano).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  useEffect(() => {
    if (!isFirebaseMode) {
      setTurmas(SEED_TURMAS as unknown as Turma[]);
      return;
    }
    const unsubscribe = subscribeToCollection('turmas', loaded => setTurmas(loaded as Turma[]));
    return () => unsubscribe();
  }, [isFirebaseMode]);

  // Chave estável derivada do conteúdo (não da referência do array, que
  // muda a cada render de EscolasView) — evita refetch em loop.
  const schoolIdsKey = schools.map(s => s.id).join(',');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (schools.length === 0) {
        if (!cancelled) {
          setSummaries({});
          setErrors({});
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      // Cada escola é isolada em seu próprio try/catch: a falha de UMA
      // escola (ex.: permissão negada, rede instável) nunca derruba as
      // demais nem vira uma Promise rejection não tratada (seção 10 do
      // plano).
      const entries = await Promise.all(
        schools.map(async school => {
          const turmasDaEscola = getClassroomsForSchool(turmas, school);
          try {
            const summary = await loadSummaryForSchool(school, turmasDaEscola, isFirebaseMode);
            return { schoolId: school.id, summary, error: null as string | null };
          } catch (err) {
            return {
              schoolId: school.id,
              summary: null as SchoolEnrollmentSummary | null,
              error: err instanceof Error ? err.message : 'Erro ao carregar dados de matrícula desta escola.',
            };
          }
        })
      );
      if (!cancelled) {
        setSummaries(Object.fromEntries(
          entries.filter((e): e is typeof e & { summary: SchoolEnrollmentSummary } => e.summary != null)
            .map(e => [e.schoolId, e.summary])
        ));
        setErrors(Object.fromEntries(
          entries.filter((e): e is typeof e & { error: string } => e.error != null)
            .map(e => [e.schoolId, e.error])
        ));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schoolIdsKey substitui `schools` de propósito (ver comentário acima)
  }, [schoolIdsKey, turmas, isFirebaseMode, refreshTick]);

  return { turmas, summaries, summariesLoading: loading, summaryErrors: errors, refresh };
}
