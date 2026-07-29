// Fase 2C — cadastro mínimo de estudante por turma (coleção
// `student_rosters`). Único dado nominal permitido nesta fase:
// `studentName`. Nunca CPF, RG, data de nascimento, endereço, telefone,
// e-mail pessoal, nome de responsáveis, informações de saúde ou
// socioeconômicas, número oficial de matrícula, matrícula SIGE ou
// credenciais do SIGE (ver docs/fase-2c-inventario-notas-legadas.md).

export type StudentRosterSourceSystem = 'Manual' | 'SIGE Escola' | 'Importação administrativa';

export interface StudentRosterEntry {
  id: string; // `${schoolId}_${anoLetivo}_${turmaId}_${studentKey}`
  studentKey: string; // identificador interno opaco — nunca derivado do nome

  schoolId: string;
  codInep: string;
  escolaNome: string;

  turmaId: string;
  turmaNome: string;
  anoLetivo: number;

  studentName: string;
  active: boolean;

  // Metadados de origem — preparados para uma futura importação, nunca
  // preenchidos pelo cadastro manual desta fase.
  sourceSystem?: StudentRosterSourceSystem;
  sourceStudentHash?: string;
  sourceFileHash?: string;
  importBatchId?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
