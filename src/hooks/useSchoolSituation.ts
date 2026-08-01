// Fase 2D — carrega a Sala de Situação para o conjunto de escolas visível
// (carteira ou visão global, já resolvido pelo chamador via
// getSchoolsForCurrentScope — este hook não decide escopo). Notas
// bimestrais (a única fonte com dado quase-nominal) só são carregadas para
// TODAS as escolas do conjunto quando o escopo é 'carteira' (poucas
// escolas, deliberadamente acompanhadas); na visão 'global' só a escola
// selecionada tem notas carregadas (seção 13 do plano) — as demais ficam
// com `notas: null`, nunca com nomes/turmas de estudantes de 56 escolas de
// uma vez. Modo demonstração usa só DEMO_SCHOOL_SITUATIONS (nunca dado
// real), e nunca é usado depois de autenticado.
//
// Revisão do code review do PR #16: turmas/visitas são buscadas uma única
// vez por ciclo de carregamento, já escopadas às escolas visíveis
// (fetchTurmasForSchools/fetchVisitasForSchools — nunca a coleção inteira),
// e cada uma delas é isolada da outra e do resto do carregamento: uma falha
// em turmas ou visitas nunca apaga estrutura/matrícula/fluxo/notas (seção 4
// do code review) nem impede o restante do carregamento de continuar.
import { useCallback, useEffect, useState } from 'react';
import type { Bimestre } from '../types/studentBimesterGrade';
import type { SchoolScopeMode, SchoolSituation } from '../types/schoolSituation';
import {
  fetchPortfolioSituations,
  fetchSchoolSituation,
  fetchTurmasForSchools,
  fetchVisitasForSchools,
  type SchoolSituationSchoolInput,
} from '../lib/schoolSituationService';
import { DEMO_SCHOOL_SITUATIONS } from '../data/demoSchoolSituation';

export interface UseSchoolSituationInput {
  schools: readonly SchoolSituationSchoolInput[];
  anoLetivo: number;
  bimestre: Bimestre;
  scopeMode: SchoolScopeMode;
  selectedSchoolId: string | null;
  isFirebaseMode: boolean;
}

export interface UseSchoolSituationResult {
  situations: Record<string, SchoolSituation>;
  loading: boolean;
  loadError: string;
  refresh: () => void;
}

export function useSchoolSituation(input: UseSchoolSituationInput): UseSchoolSituationResult {
  const { schools, anoLetivo, bimestre, scopeMode, selectedSchoolId, isFirebaseMode } = input;

  const [situations, setSituations] = useState<Record<string, SchoolSituation>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Incrementado por refresh() para forçar o efeito abaixo a rodar de novo
  // (mesmo padrão de refreshTick em useSchoolFlowResults/
  // useStudentRosterAndGrades).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  // Chave estável derivada do conteúdo (não da referência do array, que
  // muda a cada render do chamador) — mesmo padrão de schoolIdsKey em
  // useSchoolFlowResults.
  const schoolIdsKey = schools.map(s => s.id).join(',');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');

      if (!isFirebaseMode) {
        if (!cancelled) {
          setSituations(DEMO_SCHOOL_SITUATIONS);
          setLoading(false);
        }
        return;
      }

      if (schools.length === 0) {
        if (!cancelled) {
          setSituations({});
          setLoading(false);
        }
        return;
      }

      try {
        // Turmas e visitas são buscadas UMA vez por ciclo, já escopadas às
        // escolas visíveis (nunca a coleção inteira — seção 5 do code
        // review), e de forma independente uma da outra: cada uma delas
        // devolve um SourceLoadResult próprio, então uma falha em turmas
        // nunca impede visitas de carregar (e vice-versa) — o isolamento
        // por fonte continua dentro de fetchSchoolSituation.
        const schoolIds = schools.map(s => s.id);
        const [turmasResult, visitasResults] = await Promise.all([
          fetchTurmasForSchools(schoolIds),
          fetchVisitasForSchools(schools),
        ]);
        if (cancelled) return;

        // Carteira: poucas escolas deliberadamente acompanhadas, notas
        // carregadas para todas de uma vez (concorrência já limitada por
        // fetchPortfolioSituations). Visão global: notas nunca carregadas
        // para o conjunto inteiro — só a escola selecionada, abaixo.
        const includeGradesForAll = scopeMode === 'carteira';
        const baseline = await fetchPortfolioSituations(schools, turmasResult, visitasResults, anoLetivo, {
          includeGrades: includeGradesForAll,
          bimestre,
        });
        if (cancelled) return;

        let merged = baseline;
        if (!includeGradesForAll && selectedSchoolId) {
          const selectedSchool = schools.find(s => s.id === selectedSchoolId);
          if (selectedSchool) {
            const visitasResult = visitasResults[selectedSchoolId] ?? { status: 'not_requested' as const };
            const withGrades = await fetchSchoolSituation(selectedSchool, turmasResult, visitasResult, anoLetivo, {
              includeGrades: true,
              bimestre,
            });
            if (cancelled) return;
            merged = { ...baseline, [selectedSchoolId]: withGrades };
          }
        }

        if (!cancelled) setSituations(merged);
      } catch (err) {
        if (!cancelled) {
          setSituations({});
          setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar a Sala de Situação.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schoolIdsKey substitui `schools` de propósito (ver comentário acima)
  }, [schoolIdsKey, anoLetivo, bimestre, scopeMode, selectedSchoolId, isFirebaseMode, refreshTick]);

  return { situations, loading, loadError, refresh };
}
