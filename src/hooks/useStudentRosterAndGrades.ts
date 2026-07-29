// Fase 2C — carrega o cadastro (roster) e as notas de UMA escola
// selecionada para um ano letivo/bimestre. Nunca carrega mais de uma
// escola por vez (seção 12 do plano: "não carregar simultaneamente
// estudantes das 56 escolas") — quando `schoolId` é null, não busca nada.
// Modo demonstração usa só DEMO_STUDENT_ROSTER/DEMO_STUDENT_BIMESTER_GRADES
// (nunca SEED_GRADES/grades legado).
import { useCallback, useEffect, useState } from 'react';
import { listStudentRosterForSchool } from '../lib/studentRosterService';
import { listStudentBimesterGradesForSchool } from '../lib/studentBimesterGradeService';
import {
  DEMO_ANO_LETIVO,
  DEMO_BIMESTRE,
  DEMO_SCHOOL_ID,
  DEMO_STUDENT_BIMESTER_GRADES,
  DEMO_STUDENT_ROSTER,
} from '../data/demoStudentRoster';
import type { StudentRosterEntry } from '../types/studentRoster';
import type { Bimestre, StudentBimesterGrade } from '../types/studentBimesterGrade';

export function useStudentRosterAndGrades(
  schoolId: string | null,
  anoLetivo: number,
  bimestre: Bimestre,
  isFirebaseMode: boolean
) {
  const [roster, setRoster] = useState<StudentRosterEntry[]>([]);
  const [grades, setGrades] = useState<StudentBimesterGrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Incrementado por refresh() para forçar o efeito abaixo a rodar de novo
  // (mesmo padrão de refreshTick em useSchoolEnrollmentSummaries/
  // useSchoolFlowResults).
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Seção 12 do plano: nenhuma escola selecionada não carrega nomes.
      if (!schoolId) {
        if (!cancelled) {
          setRoster([]);
          setGrades([]);
          setLoading(false);
          setLoadError('');
        }
        return;
      }

      setLoading(true);
      setLoadError('');

      if (!isFirebaseMode) {
        if (!cancelled) {
          const isDemoMatch = schoolId === DEMO_SCHOOL_ID && anoLetivo === DEMO_ANO_LETIVO;
          setRoster(isDemoMatch ? DEMO_STUDENT_ROSTER : []);
          setGrades(isDemoMatch && bimestre === DEMO_BIMESTRE ? DEMO_STUDENT_BIMESTER_GRADES : []);
          setLoading(false);
        }
        return;
      }

      try {
        const [loadedRoster, loadedGrades] = await Promise.all([
          listStudentRosterForSchool(schoolId, anoLetivo),
          listStudentBimesterGradesForSchool(schoolId, anoLetivo, bimestre),
        ]);
        if (!cancelled) {
          setRoster(loadedRoster);
          setGrades(loadedGrades);
        }
      } catch (err) {
        if (!cancelled) {
          setRoster([]);
          setGrades([]);
          setLoadError(
            err instanceof Error ? err.message : 'Não foi possível carregar os dados de notas desta escola.'
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

  return { roster, grades, loading, loadError, refresh };
}
