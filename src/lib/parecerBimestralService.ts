// Reestruturação SIFEC — Parecer Bimestral: núcleo puro (validação +
// montagem) separado da orquestração assíncrona, mesmo padrão dos demais
// serviços novos desta reestruturação.
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import type { ParecerBimestralNote } from '../types/parecerBimestral';
import { buildBimonthlyEnrollmentId as buildParecerId } from './deterministicIds';

const COLLECTION = 'parecer_bimestral_notas';
const MAX_LENGTH = 4000;

export class ParecerBimestralValidationError extends Error {}

export interface SaveParecerBimestralNoteInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  encaminhamentos: string;
  actingUserEmail: string;
  now: string;
}

export function validateParecerBimestralNoteInput(input: SaveParecerBimestralNoteInput): void {
  if (input.encaminhamentos.length > MAX_LENGTH) {
    throw new ParecerBimestralValidationError(`Os encaminhamentos estão limitados a ${MAX_LENGTH} caracteres.`);
  }
}

export function buildParecerBimestralNotePayload(
  input: SaveParecerBimestralNoteInput,
  existing?: ParecerBimestralNote
): ParecerBimestralNote {
  validateParecerBimestralNoteInput(input);
  return {
    // Mesmo formato de ID de bimonthly_enrollments (schoolId_ano_bBimestre)
    // — reaproveitado de propósito, já que a chave composta é idêntica.
    id: buildParecerId(input.schoolId, input.anoLetivo, input.bimestre),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    bimestre: input.bimestre,
    encaminhamentos: input.encaminhamentos.trim(),
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

export async function saveParecerBimestralNote(
  input: SaveParecerBimestralNoteInput,
  existing?: ParecerBimestralNote
): Promise<ParecerBimestralNote> {
  const payload = buildParecerBimestralNotePayload(input, existing);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
  return payload;
}

export async function getParecerBimestralNote(
  schoolId: string,
  anoLetivo: number,
  bimestre: Bimestre
): Promise<ParecerBimestralNote | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('anoLetivo', '==', anoLetivo),
      where('bimestre', '==', bimestre)
    )
  );
  return snap.empty ? null : (snap.docs[0].data() as ParecerBimestralNote);
}
