// Fase 2C.1 — revisão do code review do PR #17, seção 2: carrega as turmas
// de UMA escola selecionada (nunca a coleção inteira — NotasView.tsx antes
// assinava subscribeToCollection('turmas') completo, mesmo autenticado).
// Modo demonstração usa só SEED_TURMAS, e nunca sobrevive a uma sessão
// autenticada nem a uma falha de leitura real (seção 2: "falha no Firestore
// nunca pode restaurar seeds"). Mesmo padrão de status explícito de
// useGradeEntryMonitoring.ts (seção 1) — falha de leitura nunca vira
// silenciosamente "nenhuma turma cadastrada".
import { useCallback, useEffect, useState } from 'react';
import { listClassroomsForSchool } from '../lib/classService';
import { SEED_TURMAS } from '../lib/firebaseService';
import type { Turma } from '../types/classroom';

export type ClassroomsLoadStatus = 'idle' | 'loading' | 'success' | 'failure';

export interface UseSchoolClassroomsResult {
  turmas: Turma[];
  status: ClassroomsLoadStatus;
  loading: boolean;
  loadError: string;
  refresh: () => void;
}

// Identifica de forma única a combinação escola+modo que `turmas`/`status`
// abaixo foram carregados para — ver comentário de `resolvedKey`.
function buildContextKey(schoolId: string | null, isFirebaseMode: boolean): string {
  return `${schoolId}_${isFirebaseMode}`;
}

export function useSchoolClassrooms(schoolId: string | null, isFirebaseMode: boolean): UseSchoolClassroomsResult {
  const contextKey = buildContextKey(schoolId, isFirebaseMode);

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [status, setStatus] = useState<ClassroomsLoadStatus>('idle');
  const [loadError, setLoadError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  // Mesmo padrão de resolvedKey de useGradeEntryMonitoring.ts (revisão do
  // code review do PR #17, seção 4): sem esta correção durante o render, a
  // primeira renderização depois de trocar de escola ainda devolveria as
  // turmas da escola ANTERIOR por um frame — o useEffect abaixo só roda
  // DEPOIS do commit. Comparar a chave durante o próprio render e ajustar
  // o estado diretamente no corpo da função é o padrão oficial do React
  // para isto (https://react.dev/learn/you-might-not-need-an-effect#
  // adjusting-some-state-when-a-prop-changes); `contextKey !== resolvedKey`
  // só é verdadeiro no primeiro render depois de uma mudança real, então
  // isto nunca entra em loop.
  const [resolvedKey, setResolvedKey] = useState(contextKey);
  if (contextKey !== resolvedKey) {
    setResolvedKey(contextKey);
    setTurmas([]);
    setStatus(isFirebaseMode && schoolId ? 'loading' : 'idle');
    setLoadError('');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Modo demonstração: SEED_TURMAS. Nunca usado depois de autenticado
      // (o ramo abaixo limpa imediatamente qualquer seed remanescente assim
      // que isFirebaseMode vira true, mesmo antes da consulta real
      // resolver).
      if (!isFirebaseMode) {
        if (!cancelled) {
          setTurmas(SEED_TURMAS as unknown as Turma[]);
          setStatus('idle');
          setLoadError('');
        }
        return;
      }

      if (!schoolId) {
        if (!cancelled) {
          setTurmas([]);
          setStatus('idle');
          setLoadError('');
        }
        return;
      }

      setStatus('loading');
      setLoadError('');
      // Limpa imediatamente qualquer dado anterior (seed ou de outra
      // escola) — nunca deixa turma de outra escola/sessão visível enquanto
      // a consulta real está em andamento.
      setTurmas([]);

      try {
        const loaded = await listClassroomsForSchool(schoolId);
        if (!cancelled) {
          setTurmas(loaded);
          setStatus('success');
        }
      } catch (err) {
        if (!cancelled) {
          // Falha real nunca restaura SEED_TURMAS nem deixa a turma de uma
          // escola anterior visível — turmas fica vazio, e o chamador deve
          // tratar `status === 'failure'` como "não sabemos", nunca como
          // "esta escola não tem turma".
          setTurmas([]);
          setStatus('failure');
          setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar as turmas desta escola.');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [schoolId, isFirebaseMode, refreshTick]);

  return { turmas, status, loading: status === 'loading', loadError, refresh };
}
