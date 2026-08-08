// Reestruturação SIFEC — "Alunos com Baixo Desempenho (Farol do Estudante)":
// substitui a antiga Busca Ativa (frequência) por uma listagem NOMINAL, por
// turma e disciplina, de estudantes com percentual de acerto < 25% no SISEDU
// Analytics. Não há integração automática com o SISEDU neste repositório —
// o percentual é lançado manualmente pela equipe a partir do relatório
// externo, mesmo padrão de entrada manual já usado no restante do SIFEC.
//
// Dado nominal (nome do estudante) por natureza — mesma categoria de
// informação administrativa sensível que a antiga Busca Ativa já tratava.
// Nunca exportado publicamente; a interface exibe um selo de aviso
// permanente (ver FarolEstudanteView.tsx).
import type { Bimestre } from './gradeEntryMonitoring';

export const FAROL_ACERTO_LIMITE = 25;

// Fonte fixa — este fluxo nunca afirma sincronização automática com o
// SISEDU Analytics (auditoria da reestruturação, seção 8): todo registro é
// transcrito manualmente pela equipe a partir do relatório externo.
export const FAROL_SOURCE_SYSTEM = 'SISEDU Analytics' as const;

export const FAROL_STATUS_ACOMPANHAMENTO = ['Identificado', 'Em acompanhamento', 'Superado'] as const;
export type FarolStatusAcompanhamento = (typeof FAROL_STATUS_ACOMPANHAMENTO)[number];

// Correção final da auditoria da reestruturação — seção 2: exclusão física
// nunca é permitida para o superintendente comum (só isPlatformAdmin() em
// manutenção excepcional). O caminho normal de "remover da lista de
// trabalho" passa a ser arquivar (update, nunca delete) — statusRegistro é
// um campo NOVO e distinto de `status` (que é o status de acompanhamento
// pedagógico do estudante, ex.: "Superado"); reaproveitar `status` para
// arquivamento confundiria duas semânticas diferentes (o estudante pode ter
// sido "Superado" e o registro continuar ativo na lista, ou vice-versa).
export const FAROL_STATUS_REGISTRO = ['ativo', 'arquivado'] as const;
export type FarolStatusRegistro = (typeof FAROL_STATUS_REGISTRO)[number];

export interface FarolEstudanteItem {
  id: string;
  schoolId: string;
  codInep: string;
  escolaNome: string;
  // turmaId real (nunca texto solto) — mesmo princípio de identidade
  // canônica já aplicado em grade_entry_monitoring/sigeReportService.
  turmaId: string;
  turmaNome: string;
  disciplina: string;
  anoLetivo: number;
  bimestre: Bimestre;
  estudanteNome: string;
  percentualAcerto: number; // 0 a 24 — sempre < FAROL_ACERTO_LIMITE (validado antes de gravar)
  // Sempre 'SISEDU Analytics' — nunca outra origem (auditoria da
  // reestruturação, seção 8: "informar claramente que os dados foram
  // transcritos do SISEDU Analytics; nunca afirmar sincronização
  // automática").
  sourceSystem: typeof FAROL_SOURCE_SYSTEM;
  // Data do relatório do SISEDU Analytics transcrito — YYYY-MM-DD, mesmo
  // formato de referenceDate em grade_entry_monitoring.
  referenceDate: string;
  status: FarolStatusAcompanhamento;
  // 'ativo' (padrão) ou 'arquivado' — nunca excluído fisicamente pelo
  // superintendente comum. Interface nunca mostra 'arquivado' por padrão;
  // exige filtro explícito (ver FarolEstudanteView.tsx).
  statusRegistro: FarolStatusRegistro;
  observacao?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
