// Fase 2A — auditoria (coleção `audit_logs`). Nunca registrar senha, token
// ou credencial em previousValue/newValue — quem grava o log é responsável
// por só passar os campos de negócio que mudaram.
import type { SourceSystem } from './import';

export type AuditOperation = 'create' | 'update' | 'archive' | 'import' | 'correction';

export interface AuditLogEntry {
  id: string;
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
  timestamp: string;
}
