// Fase 2A — ImportService: estrutura de importação (imports). Nesta fase
// só a estrutura é preparada — nenhum parser real de SIGE Escola/SIGAE é
// implementado, e nenhum registro nasce confirmado (ver seção 15 do plano:
// "Nenhuma importação deve gravar dados sem confirmação").
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { ImportRecord, SourceSystem } from '../types/import';

const COLLECTION = 'imports';

export interface CreateImportInput {
  sourceSystem: SourceSystem;
  reportType: string;
  reportTitle: string;
  fileName: string;
  fileHash: string;
  schoolId: string;
  codInep: string;
  anoLetivo: number;
  mesReferencia?: string;
  bimestre?: string;
  preview: unknown;
  createdBy: string;
  now: string;
}

// ID determinístico por escola + hash do arquivo — reprocessar o mesmo
// arquivo para a mesma escola atualiza o mesmo registro de import em vez de
// criar duplicatas.
export function buildImportId(schoolId: string, fileHash: string): string {
  return `${schoolId}_${fileHash}`;
}

// Núcleo puro: todo import novo nasce em 'analisando', com os contadores
// zerados — nada é processado nem confirmado na criação.
export function buildImportRecord(input: CreateImportInput): ImportRecord {
  return {
    id: buildImportId(input.schoolId, input.fileHash),
    sourceSystem: input.sourceSystem,
    reportType: input.reportType,
    reportTitle: input.reportTitle,
    fileName: input.fileName,
    fileHash: input.fileHash,
    schoolId: input.schoolId,
    codInep: input.codInep,
    anoLetivo: input.anoLetivo,
    mesReferencia: input.mesReferencia,
    bimestre: input.bimestre,
    recordsRead: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsIgnored: 0,
    inconsistencies: [],
    status: 'analisando',
    preview: input.preview,
    createdAt: input.now,
    createdBy: input.createdBy,
  };
}

// Convite de conveniência da UI (a autorização real é firestore.rules):
// só admin, ou quem tem acesso de escrita à escola do import, confirma.
export function canConfirmImport(actingUserIsAdmin: boolean, actingUserCanWriteSchool: boolean): boolean {
  return actingUserIsAdmin || actingUserCanWriteSchool;
}

export async function createImport(input: CreateImportInput): Promise<ImportRecord> {
  const record = buildImportRecord(input);
  await setDoc(doc(db, COLLECTION, record.id), record);
  return record;
}

export async function listImportsForSchool(schoolId: string): Promise<ImportRecord[]> {
  const snap = await getDocs(query(collection(db, COLLECTION), where('schoolId', '==', schoolId)));
  return snap.docs.map(d => d.data() as ImportRecord);
}
