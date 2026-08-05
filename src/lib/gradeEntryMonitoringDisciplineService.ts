// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": dimensão turma+disciplina, numa coleção nova e separada de
// grade_entry_monitoring (preservada intacta). Núcleo puro (validação +
// montagem do payload) separado da orquestração assíncrona, mesmo padrão de
// gradeEntryMonitoringService.ts.
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import {
  DISCIPLINA_AREAS,
  type DisciplinaArea,
  type GradeEntryMonitoringByDiscipline,
  type GradeEntryMonitoringDisciplineStatus,
} from '../types/gradeEntryMonitoringDiscipline';
import { buildGradeEntryMonitoringByDisciplineId } from './deterministicIds';
import { isNonNegativeInteger } from './enrollmentCalculations';

const COLLECTION = 'grade_entry_monitoring_disciplina';
const REFERENCE_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

export class GradeEntryMonitoringDisciplineValidationError extends Error {}

export interface SaveGradeEntryMonitoringByDisciplineInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  disciplina: DisciplinaArea;
  expectedGradeEntries: number;
  completedGradeEntries: number;
  status: GradeEntryMonitoringDisciplineStatus;
  referenceDate: string;
  actingUserEmail: string;
  now: string;
}

export function validateGradeEntryMonitoringByDisciplineInput(input: SaveGradeEntryMonitoringByDisciplineInput): void {
  if (!Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2100) {
    throw new GradeEntryMonitoringDisciplineValidationError('Ano letivo inválido — use um ano entre 2000 e 2100.');
  }
  if (![1, 2, 3, 4].includes(input.bimestre)) {
    throw new GradeEntryMonitoringDisciplineValidationError('Bimestre inválido — use um valor entre 1 e 4.');
  }
  if (!DISCIPLINA_AREAS.includes(input.disciplina)) {
    throw new GradeEntryMonitoringDisciplineValidationError('Disciplina/área inválida.');
  }
  if (!isNonNegativeInteger(input.expectedGradeEntries) || !isNonNegativeInteger(input.completedGradeEntries)) {
    throw new GradeEntryMonitoringDisciplineValidationError('Lançamentos esperados/realizados devem ser inteiros maiores ou iguais a zero.');
  }
  if (input.completedGradeEntries > input.expectedGradeEntries) {
    throw new GradeEntryMonitoringDisciplineValidationError('Lançamentos realizados não podem ser maiores que os esperados.');
  }
  if (!['rascunho', 'confirmado'].includes(input.status)) {
    throw new GradeEntryMonitoringDisciplineValidationError('Status inválido.');
  }
  if (!REFERENCE_DATE_PATTERN.test(input.referenceDate)) {
    throw new GradeEntryMonitoringDisciplineValidationError('Data de referência inválida — use o formato AAAA-MM-DD.');
  }
}

export function buildGradeEntryMonitoringByDisciplinePayload(
  input: SaveGradeEntryMonitoringByDisciplineInput,
  existing?: GradeEntryMonitoringByDiscipline
): GradeEntryMonitoringByDiscipline {
  validateGradeEntryMonitoringByDisciplineInput(input);
  return {
    id: buildGradeEntryMonitoringByDisciplineId(input.schoolId, input.anoLetivo, input.bimestre, input.turmaId, input.disciplina),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    turmaId: input.turmaId,
    turmaNome: input.turmaNome,
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    disciplina: input.disciplina,
    expectedGradeEntries: input.expectedGradeEntries,
    completedGradeEntries: input.completedGradeEntries,
    status: input.status,
    referenceDate: input.referenceDate,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

export async function saveGradeEntryMonitoringByDiscipline(
  input: SaveGradeEntryMonitoringByDisciplineInput,
  existing?: GradeEntryMonitoringByDiscipline
): Promise<GradeEntryMonitoringByDiscipline> {
  const payload = buildGradeEntryMonitoringByDisciplinePayload(input, existing);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
  return payload;
}

// Sempre escopado por schoolId — nunca a coleção inteira.
export async function listGradeEntryMonitoringByDisciplineForSchool(
  schoolId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<GradeEntryMonitoringByDiscipline[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre)
    )
  );
  return snap.docs.map(d => d.data() as GradeEntryMonitoringByDiscipline);
}
