// Fase 2A — origem dos dados e importações (SIGE Escola, SIGAE, manual etc.).
// Só a estrutura é preparada nesta fase: nenhuma importação real é
// processada, e nenhum dado é gravado sem confirmação explícita do usuário
// (ver ImportStatus — todo registro nasce em 'analisando' ou
// 'aguardando_confirmacao', nunca direto em 'processado').

export type SourceSystem =
  | 'Manual'
  | 'SIGE Escola'
  | 'SIGAE'
  | 'Importação administrativa'
  | 'Migração';

export type ImportStatus =
  | 'analisando'
  | 'aguardando_confirmacao'
  | 'confirmado'
  | 'processado'
  | 'processado_com_alertas'
  | 'cancelado'
  | 'erro';

// Campos de origem compartilhados por turmas e enrollment_snapshots —
// permitem rastrear de onde cada registro veio, sem acoplar essas coleções
// à estrutura de imports.
export interface SourceMetadata {
  sourceSystem?: SourceSystem;
  sourceReportType?: string;
  sourceReportTitle?: string;
  sourceFileName?: string;
  sourceGeneratedAt?: string;
  sourceFileHash?: string;
  importBatchId?: string;
}

export interface ImportRecord {
  id: string;
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
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsIgnored: number;
  inconsistencies: string[];
  status: ImportStatus;
  preview: unknown;
  createdAt: string;
  confirmedAt?: string;
  processedAt?: string;
  createdBy: string;
  confirmedBy?: string;
}
