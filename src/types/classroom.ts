// Fase 2A — modelo estendido da coleção `turmas`. Preserva TODOS os campos
// já usados por NotasView.tsx/CdgView.tsx/ExtraViews.tsx (escolaId,
// escolaNome, nome, ano, periodo, lancamentosBimestre, mediaBimestre,
// alunosSinalizados) e só ADICIONA campos novos, todos opcionais — nenhum
// documento existente em produção deixa de validar contra este tipo.
import type { SourceMetadata } from './import';

export type TurmaModalidade =
  | 'Regular'
  | 'Tempo Integral'
  | 'Educação Profissional'
  | 'EJA'
  | 'Educação Especial'
  | 'Outra';

export interface TurmaBimestreLancamentos {
  b1: string;
  b2: string;
  b3: string;
  b4: string;
}

export interface TurmaBimestreMedias {
  b1: number;
  b2: number;
  b3: number;
  b4: number;
}

export interface Turma extends SourceMetadata {
  id: string;

  // --- Campos legados (Fase 1 e anteriores) — preservados sem alteração ---
  escolaId: string;
  escolaNome: string;
  nome: string;
  ano: string;
  periodo: string;
  lancamentosBimestre?: TurmaBimestreLancamentos;
  mediaBimestre?: TurmaBimestreMedias;
  alunosSinalizados?: number;

  // --- Novos campos (Fase 2A) — todos opcionais ---
  schoolId?: string;
  codInep?: string;
  anoLetivo?: number;
  codigoTurma?: string;
  serie?: string;
  etapa?: string;
  modalidade?: TurmaModalidade;
  turno?: string;
  oferta?: string;
  cargaHoraria?: number;
  matriculaInicial?: number;
  matriculaAtual?: number;
  ativa?: boolean;
  dataInicio?: string;
  dataEncerramento?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}
