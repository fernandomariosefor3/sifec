// Fase 2D — Sala de Situação: inconsistências (seção 11 do plano).
// Extraído de schoolSituationCalculations.ts para manter os arquivos desta
// fase pequenos e focados. Só SINALIZA — nunca corrige nada automaticamente
// (o plano é explícito: "apenas sinalizar", ver seção 11).
import type { EnrollmentSnapshot } from '../types/enrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { StudentBimesterGrade } from '../types/studentBimesterGrade';
import type { StudentRosterEntry } from '../types/studentRoster';
import type { SchoolSituationInconsistency } from '../types/schoolSituation';
import { calculateTotalResultados } from './schoolFlowCalculations';
import { normalizeSchoolName } from './schoolIdentity';

interface TurmaRefLike {
  id: string;
  schoolId?: string;
  escolaId?: string;
  anoLetivo?: number;
  nome: string;
}

export interface InconsistencyDetectionInput {
  schoolId: string;
  codInep: string;
  anoLetivo: number;
  turmasDoAno: readonly TurmaRefLike[];
  turmasById: ReadonlyMap<string, TurmaRefLike>;
  snapshots: readonly EnrollmentSnapshot[];
  roster: readonly StudentRosterEntry[];
  grades: readonly StudentBimesterGrade[];
  flowResult: SchoolFlowResult | null;
}

export function detectInconsistencies(input: InconsistencyDetectionInput): SchoolSituationInconsistency[] {
  const { schoolId, codInep, anoLetivo, turmasDoAno, turmasById, snapshots, roster, grades, flowResult } = input;
  const inconsistencies: SchoolSituationInconsistency[] = [];

  if (!codInep) {
    inconsistencies.push({
      type: 'cod_inep_ausente',
      schoolId,
      message: 'Escola sem código INEP cadastrado.',
    });
  }

  // Turma referenciada pelo snapshot pertence a OUTRA escola, ou a um ano
  // letivo diferente do snapshot — turmasById é passado com a coleção
  // INTEIRA de turmas (não só as da escola em análise) para que essa
  // verificação cruzada realmente consiga detectar o caso de referência
  // errada, em vez de simplesmente não encontrar a turma.
  for (const snap of snapshots) {
    const turma = turmasById.get(snap.turmaId);
    if (!turma) continue;
    const turmaSchoolId = turma.schoolId ?? turma.escolaId;
    if (turmaSchoolId != null && turmaSchoolId !== snap.schoolId) {
      inconsistencies.push({
        type: 'snapshot_turma_outra_escola',
        schoolId,
        message: `Registro mensal ${snap.id} referencia uma turma de outra escola.`,
        details: snap.id,
      });
    }
    if (turma.anoLetivo != null && turma.anoLetivo !== snap.anoLetivo) {
      inconsistencies.push({
        type: 'snapshot_ano_diferente',
        schoolId,
        message: `Registro mensal ${snap.id} referencia uma turma de ano letivo diferente (${turma.anoLetivo}).`,
        details: snap.id,
      });
    }
  }

  // Cadastro de estudante vinculado a uma turma de ano letivo diferente do
  // próprio cadastro (mesma lacuna já fechada em firestore.rules via
  // isCanonicalTurmaOfSchoolYear — aqui só sinaliza para quem já existir).
  for (const entry of roster) {
    const turma = turmasById.get(entry.turmaId);
    if (turma?.anoLetivo != null && turma.anoLetivo !== entry.anoLetivo) {
      inconsistencies.push({
        type: 'roster_turma_ano_diferente',
        schoolId,
        message: `Cadastro de estudante ${entry.id} vinculado a uma turma de ano letivo diferente (${turma.anoLetivo}).`,
        details: entry.id,
      });
    }
  }

  // Nota sem roster correspondente, ou de estudante inativo — nunca exposto
  // com nome (details usa só o ID do documento).
  const rosterById = new Map(roster.map(r => [r.id, r] as const));
  for (const grade of grades) {
    const rosterEntry = rosterById.get(grade.rosterId);
    if (!rosterEntry) {
      inconsistencies.push({
        type: 'nota_sem_roster',
        schoolId,
        message: `Nota ${grade.id} não corresponde a nenhum cadastro de estudante encontrado.`,
        details: grade.id,
      });
    } else if (!rosterEntry.active) {
      inconsistencies.push({
        type: 'nota_estudante_inativo',
        schoolId,
        message: `Nota ${grade.id} registrada para um estudante inativo.`,
        details: grade.id,
      });
    }
  }

  if (flowResult && flowResult.status === 'confirmado' && calculateTotalResultados(flowResult) === 0) {
    inconsistencies.push({
      type: 'fluxo_confirmado_total_zero',
      schoolId,
      message: 'Fluxo escolar confirmado com total de resultados igual a zero.',
      details: flowResult.id,
    });
  }

  // Duas turmas ativas com o mesmo nome normalizado no mesmo ano letivo —
  // único ponto deste app onde duplicidade real é estruturalmente possível
  // (turmas tem ID auto-gerado; as demais coleções desta fase usam ID
  // determinístico, que o próprio Firestore já impede de duplicar).
  const countByName = new Map<string, number>();
  for (const turma of turmasDoAno) {
    const key = normalizeSchoolName(turma.nome);
    countByName.set(key, (countByName.get(key) ?? 0) + 1);
  }
  for (const [key, count] of countByName) {
    if (count > 1) {
      inconsistencies.push({
        type: 'registro_duplicado',
        schoolId,
        message: `${count} turmas cadastradas com o mesmo nome ("${key}") no ano letivo ${anoLetivo}.`,
      });
    }
  }

  return inconsistencies;
}
