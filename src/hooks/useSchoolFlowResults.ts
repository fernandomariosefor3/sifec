// Fase 2B — carrega o resultado de fluxo escolar (school_flow_results) das
// escolas visíveis para o ano letivo selecionado. Busca POR ESCOLA (nunca a
// coleção inteira sem filtro — mesmo motivo de useSchoolEnrollmentSummaries),
// e usa um único estado de erro consolidado (mesmo padrão de
// SchoolEnrollmentPanel — seção B: erro real visível + "Tentar novamente",
// nunca escondido atrás de "nenhum resultado").
import { useCallback, useEffect, useState } from 'react';
import { listSchoolFlowResultsForSchools } from '../lib/schoolFlowService';
import { DEMO_SCHOOL_FLOW_RESULTS } from '../data/demoSchoolFlow';
import type { SchoolFlowResult } from '../types/schoolFlow';

interface SchoolLike {
  id: string;
}

export function useSchoolFlowResults(
  schools: readonly SchoolLike[],
  anoLetivo: number,
  isFirebaseMode: boolean
) {
  const [results, setResults] = useState<Record<string, SchoolFlowResult>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Incrementado pelo botão "Tentar novamente" para reexecutar a carga sem
  // depender de uma mudança em `schools` (mesmo padrão de refreshTick em
  // useSchoolEnrollmentSummaries).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  // Chave estável derivada do conteúdo (não da referência do array, que
  // muda a cada render do chamador) — evita refetch em loop.
  const schoolIdsKey = schools.map(s => s.id).join(',');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');

      if (!isFirebaseMode) {
        if (!cancelled) {
          const demo = Object.fromEntries(
            schools
              .map(s => [s.id, DEMO_SCHOOL_FLOW_RESULTS[s.id]] as const)
              .filter((entry): entry is [string, SchoolFlowResult] =>
                entry[1] != null && entry[1].anoLetivo === anoLetivo
              )
          );
          setResults(demo);
          setLoading(false);
        }
        return;
      }

      if (schools.length === 0) {
        if (!cancelled) {
          setResults({});
          setLoading(false);
        }
        return;
      }

      try {
        const loaded = await listSchoolFlowResultsForSchools(schools.map(s => s.id), anoLetivo);
        if (!cancelled) setResults(loaded);
      } catch (err) {
        if (!cancelled) {
          setResults({});
          setLoadError(
            err instanceof Error ? err.message : 'Não foi possível carregar os resultados de fluxo escolar.'
          );
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
  }, [schoolIdsKey, anoLetivo, isFirebaseMode, refreshTick]);

  return { results, loading, loadError, refresh };
}
