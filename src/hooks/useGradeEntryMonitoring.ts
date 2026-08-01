// Fase 2C.1 — carrega o acompanhamento agregado (grade_entry_monitoring) de
// UMA escola selecionada, para um ano letivo/bimestre. Nunca carrega mais
// de uma escola por vez, e nunca lê student_rosters/student_bimester_grades
// (seção 12 do plano). Modo demonstração usa só DEMO_GRADE_ENTRY_MONITORING.
//
// Revisão do code review do PR #17, seção 1: `status` explícito
// (idle/loading/success/failure) — antes, qualquer falha de leitura
// esvaziava `monitoring` do mesmo jeito que uma consulta bem-sucedida sem
// documentos, e o chamador não tinha como distinguir "esta turma realmente
// não tem relatório" de "não conseguimos nem consultar" (o que fazia
// NotasView classificar toda turma como "Relatório não informado" mesmo
// numa falha de permissão). `loading` continua exposto (== status ===
// 'loading') para não quebrar os chamadores existentes.
import { useCallback, useEffect, useState } from 'react';
import { listGradeEntryMonitoringForSchool } from '../lib/gradeEntryMonitoringService';
import {
  DEMO_ANO_LETIVO,
  DEMO_BIMESTRE,
  DEMO_GRADE_ENTRY_MONITORING,
  DEMO_SCHOOL_ID,
} from '../data/demoGradeEntryMonitoring';
import type { Bimestre, GradeEntryMonitoring } from '../types/gradeEntryMonitoring';

export type MonitoringLoadStatus = 'idle' | 'loading' | 'success' | 'failure';

export interface UseGradeEntryMonitoringResult {
  monitoring: GradeEntryMonitoring[];
  status: MonitoringLoadStatus;
  loading: boolean;
  loadError: string;
  refresh: () => void;
}

export function useGradeEntryMonitoring(
  schoolId: string | null,
  anoLetivo: number,
  bimestre: Bimestre,
  isFirebaseMode: boolean
): UseGradeEntryMonitoringResult {
  const [monitoring, setMonitoring] = useState<GradeEntryMonitoring[]>([]);
  const [status, setStatus] = useState<MonitoringLoadStatus>('idle');
  const [loadError, setLoadError] = useState('');
  // Incrementado por refresh() para forçar o efeito abaixo a rodar de novo
  // (mesmo padrão de refreshTick em useSchoolFlowResults/
  // useSchoolClassrooms).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!schoolId) {
        if (!cancelled) {
          setMonitoring([]);
          setStatus('idle');
          setLoadError('');
        }
        return;
      }

      setStatus('loading');
      setLoadError('');
      // Limpa imediatamente o resultado da escola/ano/bimestre anteriores —
      // nunca deixa dado de um contexto anterior visível enquanto a nova
      // consulta está em andamento (seção 1 do code review do PR #17).
      setMonitoring([]);

      if (!isFirebaseMode) {
        if (!cancelled) {
          const isDemoMatch = schoolId === DEMO_SCHOOL_ID && anoLetivo === DEMO_ANO_LETIVO && bimestre === DEMO_BIMESTRE;
          setMonitoring(isDemoMatch ? DEMO_GRADE_ENTRY_MONITORING : []);
          setStatus('success');
        }
        return;
      }

      try {
        const loaded = await listGradeEntryMonitoringForSchool(schoolId, anoLetivo, bimestre);
        if (!cancelled) {
          setMonitoring(loaded);
          setStatus('success');
        }
      } catch (err) {
        if (!cancelled) {
          // Falha real: `monitoring` fica vazio, mas `status === 'failure'`
          // é o sinal que o chamador deve usar — nunca trata este vazio
          // como "nenhum relatório informado" (ver NotasView.tsx).
          setMonitoring([]);
          setStatus('failure');
          setLoadError(
            err instanceof Error ? err.message : 'Não foi possível carregar o acompanhamento de notas desta escola.'
          );
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [schoolId, anoLetivo, bimestre, isFirebaseMode, refreshTick]);

  return { monitoring, status, loading: status === 'loading', loadError, refresh };
}
