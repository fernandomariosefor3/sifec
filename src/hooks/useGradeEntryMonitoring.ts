// Fase 2C.1 — carrega o acompanhamento agregado (grade_entry_monitoring) de
// UMA escola selecionada, para um ano letivo/bimestre. Nunca carrega mais
// de uma escola por vez, e nunca lê student_rosters/student_bimester_grades
// (seção 12 do plano). Modo demonstração usa só DEMO_GRADE_ENTRY_MONITORING.
import { useCallback, useEffect, useState } from 'react';
import { listGradeEntryMonitoringForSchool } from '../lib/gradeEntryMonitoringService';
import {
  DEMO_ANO_LETIVO,
  DEMO_BIMESTRE,
  DEMO_GRADE_ENTRY_MONITORING,
  DEMO_SCHOOL_ID,
} from '../data/demoGradeEntryMonitoring';
import type { Bimestre, GradeEntryMonitoring } from '../types/gradeEntryMonitoring';

export function useGradeEntryMonitoring(
  schoolId: string | null,
  anoLetivo: number,
  bimestre: Bimestre,
  isFirebaseMode: boolean
) {
  const [monitoring, setMonitoring] = useState<GradeEntryMonitoring[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Incrementado por refresh() para forçar o efeito abaixo a rodar de novo
  // (mesmo padrão de refreshTick em useSchoolFlowResults/useSchoolSituation).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!schoolId) {
        if (!cancelled) {
          setMonitoring([]);
          setLoading(false);
          setLoadError('');
        }
        return;
      }

      setLoading(true);
      setLoadError('');

      if (!isFirebaseMode) {
        if (!cancelled) {
          const isDemoMatch = schoolId === DEMO_SCHOOL_ID && anoLetivo === DEMO_ANO_LETIVO && bimestre === DEMO_BIMESTRE;
          setMonitoring(isDemoMatch ? DEMO_GRADE_ENTRY_MONITORING : []);
          setLoading(false);
        }
        return;
      }

      try {
        const loaded = await listGradeEntryMonitoringForSchool(schoolId, anoLetivo, bimestre);
        if (!cancelled) setMonitoring(loaded);
      } catch (err) {
        if (!cancelled) {
          setMonitoring([]);
          setLoadError(
            err instanceof Error ? err.message : 'Não foi possível carregar o acompanhamento de notas desta escola.'
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
  }, [schoolId, anoLetivo, bimestre, isFirebaseMode, refreshTick]);

  return { monitoring, loading, loadError, refresh };
}
