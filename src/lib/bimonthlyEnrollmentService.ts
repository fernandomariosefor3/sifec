// Reestruturação SIFEC — Gestão de Escolas simplificada: matrícula por
// bimestre (1º ao 4º), por escola. Núcleo puro (validação + montagem do
// payload) separado da orquestração assíncrona — mesmo padrão de
// gradeEntryMonitoringService.ts/enrollmentSnapshotService.ts.
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import type { BimonthlyEnrollment } from '../types/bimonthlyEnrollment';
import { buildBimonthlyEnrollmentId } from './deterministicIds';
import { isNonNegativeInteger } from './enrollmentCalculations';

const COLLECTION = 'bimonthly_enrollments';

export class BimonthlyEnrollmentValidationError extends Error {}

export interface SaveBimonthlyEnrollmentInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  matricula: number;
  actingUserEmail: string;
  now: string;
}

export function validateBimonthlyEnrollmentInput(input: SaveBimonthlyEnrollmentInput): void {
  if (!Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2100) {
    throw new BimonthlyEnrollmentValidationError('Ano letivo inválido — use um ano entre 2000 e 2100.');
  }
  if (![1, 2, 3, 4].includes(input.bimestre)) {
    throw new BimonthlyEnrollmentValidationError('Bimestre inválido — use um valor entre 1 e 4.');
  }
  if (!isNonNegativeInteger(input.matricula)) {
    throw new BimonthlyEnrollmentValidationError('A matrícula deve ser um número inteiro maior ou igual a zero.');
  }
}

// Núcleo puro: monta o documento exato que será gravado. Preserva
// createdAt/createdBy do registro existente (mesmo bimestre já lançado antes
// — uma correção, não uma criação nova).
export function buildBimonthlyEnrollmentPayload(
  input: SaveBimonthlyEnrollmentInput,
  existing?: BimonthlyEnrollment
): BimonthlyEnrollment {
  validateBimonthlyEnrollmentInput(input);
  return {
    id: buildBimonthlyEnrollmentId(input.schoolId, input.anoLetivo, input.bimestre),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    matricula: input.matricula,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

// ID determinístico por escola+ano+bimestre — sempre corrige o mesmo
// documento, nunca cria um segundo registro para o mesmo bimestre.
export async function saveBimonthlyEnrollment(
  input: SaveBimonthlyEnrollmentInput,
  existing?: BimonthlyEnrollment
): Promise<BimonthlyEnrollment> {
  const payload = buildBimonthlyEnrollmentPayload(input, existing);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
  return payload;
}

// Sempre escopado por schoolId — nunca a coleção inteira.
export async function listBimonthlyEnrollmentsForSchool(
  schoolId: string,
  anoLetivo: number
): Promise<BimonthlyEnrollment[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo))
  );
  return snap.docs
    .map(d => d.data() as BimonthlyEnrollment)
    .sort((a, b) => a.bimestre - b.bimestre);
}
