// Fase 2A — estrutura anual da escola (SchoolYear / EscolaAnoLetivo).
// Os dados pertencem à escola e ao ano letivo, não ao superintendente: se a
// escola mudar de responsável, este documento (e tudo que referencia o
// mesmo schoolId/anoLetivo) permanece intacto — só o vínculo de
// acompanhamento em `superintendentes.escolas` muda.
//
// matriculaInicial/matriculaAtual usam null explicitamente para "não
// informado" — nunca 0, que é um valor real e diferente de "sem dado"
// (ver seção 10 do plano: nunca mostrar zero como se fosse confirmado).

export type SchoolYearStatus = 'planejamento' | 'ativo' | 'encerrado' | 'arquivado';

export interface SchoolYear {
  id: string; // `${schoolId}_${anoLetivo}`, ex.: "diva-cabral_2026"
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  matriculaInicial: number | null;
  matriculaAtual: number | null;
  quantidadeTurmasAtivas: number;
  status: SchoolYearStatus;
  dataInicio: string | null;
  dataFim?: string | null;
  ultimaAtualizacao: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
