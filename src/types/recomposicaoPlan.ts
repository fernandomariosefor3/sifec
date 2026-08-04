// Reestruturação SIFEC — Recomposição: formulário livre para a escola
// registrar o próprio plano de recomposição de aprendizagens (nunca mais um
// plano padrão gerado automaticamente pelo sistema — a escola descreve o que
// está fazendo de fato).
import type { Bimestre } from './gradeEntryMonitoring';

export const RECOMPOSICAO_TURNOS = ['Matutino', 'Vespertino', 'Noturno', 'Integral'] as const;
export type RecomposicaoTurno = (typeof RECOMPOSICAO_TURNOS)[number];

export interface RecomposicaoPlan {
  id: string;
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  prazo: string; // texto livre — ex.: "até o fim do 2º bimestre"
  areaDisciplina: string; // texto livre — ex.: "Língua Portuguesa e Matemática"
  turno: RecomposicaoTurno;
  descricao: string; // texto livre — o plano em si
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
