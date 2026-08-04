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
  observacao?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
