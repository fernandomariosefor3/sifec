// Fase 2B — resultado anual agregado de fluxo escolar (coleção
// `school_flow_results`). Só dados agregados por escola+ano letivo — nunca
// nomes, IDs de estudantes, datas de nascimento ou qualquer dado nominal
// (ver seção "Objetivo" do plano). Percentuais NUNCA são persistidos: são
// sempre calculados a partir de aprovados/reprovados/abandono (ver
// src/lib/schoolFlowCalculations.ts).

export type SchoolFlowStatus = 'rascunho' | 'confirmado';

// Subconjunto de SourceSystem (types/import.ts) — só as origens já
// suportadas por este schema; leitura automatizada do SIGE e importação
// real de arquivos ficam fora desta fase (ver seção 14 do plano).
export type SchoolFlowSourceSystem = 'Manual' | 'SIGE Escola' | 'Importação administrativa';

export interface SchoolFlowResult {
  id: string; // `${schoolId}_${anoLetivo}`, ex.: "diva-cabral_2025"
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;

  aprovados: number;
  reprovados: number;
  abandono: number;

  status: SchoolFlowStatus;
  observacao?: string;

  // Metadados de origem — preparados para uma futura importação, mas nunca
  // preenchidos pelo formulário manual desta fase.
  sourceSystem?: SchoolFlowSourceSystem;
  sourceReportTitle?: string;
  sourceFileName?: string;
  sourceFileHash?: string;
  importBatchId?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
