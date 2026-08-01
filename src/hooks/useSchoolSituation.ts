// Fase 2D — carrega a Sala de Situação para o conjunto de escolas visível
// (carteira ou visão global, já resolvido pelo chamador via
// getSchoolsForCurrentScope — este hook não decide escopo). Modo
// demonstração usa só DEMO_SCHOOL_SITUATIONS (nunca dado real), e nunca é
// usado depois de autenticado.
//
// Revisão do code review do PR #17, seção 4: grade_entry_monitoring é uma
// fonte AGREGADA (nunca nominal — nunca nome/matrícula/CPF/nota individual
// de estudante, ver docs/descontinuacao-prototipo-notas-nominais.md), então
// deixou de existir motivo para restringi-la à carteira ou à escola
// selecionada. Notas são carregadas para TODAS as escolas do conjunto
// visível, carteira OU visão global, com o mesmo pool de concorrência já
// usado para as demais fontes (fetchPortfolioSituations, uma escola por vez
// com schoolId, nunca where-in com as 56 escolas). `scopeMode`/
// `selectedSchoolId` não entram mais nas dependências deste hook — o
// primeiro só influenciava esta decisão (agora removida), e o segundo
// serve só à UI para abrir/fechar o painel de detalhe (ver
// SalaDeSituacaoView.tsx), nunca para decidir o que buscar.
//
// Revisão do code review do PR #16: turmas/visitas são buscadas uma única
// vez por ciclo de carregamento, já escopadas às escolas visíveis
// (fetchTurmasForSchools/fetchVisitasForSchools — nunca a coleção inteira),
// e cada uma delas é isolada da outra e do resto do carregamento: uma falha
// em turmas ou visitas nunca apaga estrutura/matrícula/fluxo/notas (seção 4
// do code review) nem impede o restante do carregamento de continuar.
import { useCallback, useEffect, useState } from 'react';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import type { SchoolSituation } from '../types/schoolSituation';
import {
  fetchPortfolioSituations,
  fetchTurmasForSchools,
  fetchVisitasForSchools,
  type SchoolSituationSchoolInput,
} from '../lib/schoolSituationService';
import { DEMO_SCHOOL_SITUATIONS } from '../data/demoSchoolSituation';

export interface UseSchoolSituationInput {
  schools: readonly SchoolSituationSchoolInput[];
  anoLetivo: number;
  bimestre: Bimestre;
  isFirebaseMode: boolean;
}

export interface UseSchoolSituationResult {
  situations: Record<string, SchoolSituation>;
  loading: boolean;
  loadError: string;
  refresh: () => void;
}

export function useSchoolSituation(input: UseSchoolSituationInput): UseSchoolSituationResult {
  const { schools, anoLetivo, bimestre, isFirebaseMode } = input;

  const [situations, setSituations] = useState<Record<string, SchoolSituation>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Incrementado por refresh() para forçar o efeito abaixo a rodar de novo
  // (mesmo padrão de refreshTick em useSchoolFlowResults/
  // useGradeEntryMonitoring).
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

        // grade_entry_monitoring é agregada (nunca nominal) — carregada
        // para TODAS as escolas do conjunto visível de uma vez só, carteira
        // ou visão global, com o mesmo pool de concorrência das demais
        // fontes (seção 4 do code review do PR #17).
        const situationsResult = await fetchPortfolioSituations(schools, turmasResult, visitasResults, anoLetivo, {
          includeGrades: true,
          bimestre,
        });
        if (cancelled) return;

        if (!cancelled) setSituations(situationsResult);
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
  }, [schoolIdsKey, anoLetivo, bimestre, isFirebaseMode, refreshTick]);

  return { situations, loading, loadError, refresh };
}
