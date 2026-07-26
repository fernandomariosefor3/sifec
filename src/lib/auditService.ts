// Fase 2A — AuditService: trilha de auditoria (audit_logs). Nunca registrar
// senha, token ou credencial (seção 16 do plano) — assertNoSensitiveKeys
// bloqueia isso antes de qualquer gravação, na função pura, para o erro
// aparecer em teste unitário e não só em produção.
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { AuditLogEntry, AuditOperation } from '../types/audit';
import type { SourceSystem } from '../types/import';

const COLLECTION = 'audit_logs';

const FORBIDDEN_KEY_FRAGMENTS = ['password', 'senha', 'token', 'credential', 'credencial', 'secret'];

export class AuditPayloadError extends Error {}

function assertNoSensitiveKeys(value: unknown, label: string): void {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_KEY_FRAGMENTS.some(fragment => lowerKey.includes(fragment))) {
      throw new AuditPayloadError(`Campo sensível "${key}" não pode ser registrado em ${label}.`);
    }
  }
}

export interface RecordAuditLogInput {
  collectionName: string;
  documentId: string;
  schoolId?: string;
  codInep?: string;
  anoLetivo?: number;
  operation: AuditOperation;
  previousValue: unknown;
  newValue: unknown;
  source: SourceSystem;
  importBatchId?: string;
  userId: string;
  userEmail: string;
  now: string;
}

// Núcleo puro: valida e monta o registro exato a gravar, dado um ID já
// alocado (o caller real usa um ID de documento auto-gerado do Firestore;
// os testes passam qualquer string fixa).
export function buildAuditLogEntry(input: RecordAuditLogInput, id: string): AuditLogEntry {
  assertNoSensitiveKeys(input.previousValue, 'previousValue');
  assertNoSensitiveKeys(input.newValue, 'newValue');
  return {
    id,
    collectionName: input.collectionName,
    documentId: input.documentId,
    schoolId: input.schoolId,
    codInep: input.codInep,
    anoLetivo: input.anoLetivo,
    operation: input.operation,
    previousValue: input.previousValue,
    newValue: input.newValue,
    source: input.source,
    importBatchId: input.importBatchId,
    userId: input.userId,
    userEmail: input.userEmail,
    timestamp: input.now,
  };
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<AuditLogEntry> {
  const ref = doc(collection(db, COLLECTION));
  const entry = buildAuditLogEntry(input, ref.id);
  await setDoc(ref, entry);
  return entry;
}
