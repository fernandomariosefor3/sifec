// Cálculo do Relatório da Carteira — camada pura, sem Firebase e sem React,
// para poder ser testada sem subir emulador nem renderizar componente.
//
// Substitui a "Central de Relatórios" anterior, que era uma simulação: ela
// exibia mensagens de progresso fabricadas com setTimeout ("compressão JPEG
// 0.75", "chunks assíncronos") e não lia nenhum dado nem gerava arquivo algum.
// Aqui todo número sai dos documentos reais da coleção `schools`.
//
// Princípio que rege este módulo: nunca inventar valor. Campo ausente vira
// pendência explícita no relatório, jamais zero, média ou estimativa.

export interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
  cidade: string;
  regiao?: '4ª' | '5ª';
  matriculas: number;
  /**
   * Atenção: no formulário e na tabela este campo aparece rotulado como
   * "Meta SPAECE 2026" (data-sifec-field="metaSpaece"), mas é persistido no
   * Firestore com o nome `idebMedio`. Não existe campo `metaSpaece` no banco.
   * O nome aqui acompanha o banco; os rótulos de tela acompanham a interface.
   */
  idebMedio: number;
  metaIdeb: number;
  status: 'Ativo' | 'Pendente' | 'Inativo';
}

export interface PendenciaRelatorio {
  codInep: string;
  escola: string;
  campo: string;
  descricao: string;
}

export interface LinhaRelatorio {
  codInep: string;
  nome: string;
  cidade: string;
  regiao: string;
  matriculas: number;
  turmas: number | null;
  metaSpaece: number;
  metaIdeb: number;
  status: string;
  /** Média de estudantes por turma; null quando não há turma cadastrada. */
  mediaPorTurma: number | null;
}

export interface ResumoRelatorio {
  totalUnidades: number;
  totalMatriculas: number;
  totalTurmas: number;
  unidadesPorRegiao: { quarta: number; quinta: number; naoInformada: number };
  cidades: string[];
  unidadesAtivas: number;
  /** Média de estudantes por turma da carteira; null se não há turma alguma. */
  mediaPorTurmaCarteira: number | null;
  maiorUnidade: { nome: string; matriculas: number } | null;
  menorUnidade: { nome: string; matriculas: number } | null;
}

export interface RelatorioCarteira {
  geradoEm: string;
  resumo: ResumoRelatorio;
  linhas: LinhaRelatorio[];
  pendencias: PendenciaRelatorio[];
}

function arredonda1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Monta o relatório da carteira a partir das escolas visíveis ao usuário.
 *
 * @param schools escolas já filtradas pelo escopo do superintendente — este
 *   módulo não conhece regras de permissão e não deve conhecê-las; quem chama
 *   é responsável por passar apenas o que o usuário pode ver.
 * @param turmasPorEscola contagem de turmas ativas por id de escola. Ausência
 *   de chave significa "não cadastrado" (null na saída), diferente de 0, que
 *   significa "cadastrado e sem turma ativa".
 */
export function montarRelatorioCarteira(
  schools: readonly SchoolLike[],
  turmasPorEscola: Readonly<Record<string, number>> = {},
  agora: Date = new Date()
): RelatorioCarteira {
  const ordenadas = [...schools].sort((a, b) => b.matriculas - a.matriculas);

  const linhas: LinhaRelatorio[] = ordenadas.map((s) => {
    const turmas = Object.prototype.hasOwnProperty.call(turmasPorEscola, s.id)
      ? turmasPorEscola[s.id]
      : null;
    return {
      codInep: s.codInep,
      nome: s.nome,
      cidade: s.cidade,
      regiao: s.regiao ?? 'Não informada',
      matriculas: s.matriculas,
      turmas,
      metaSpaece: s.idebMedio,
      metaIdeb: s.metaIdeb,
      status: s.status,
      mediaPorTurma: turmas && turmas > 0 ? arredonda1(s.matriculas / turmas) : null,
    };
  });

  const totalMatriculas = ordenadas.reduce((soma, s) => soma + s.matriculas, 0);
  const totalTurmas = linhas.reduce((soma, l) => soma + (l.turmas ?? 0), 0);

  const resumo: ResumoRelatorio = {
    totalUnidades: ordenadas.length,
    totalMatriculas,
    totalTurmas,
    unidadesPorRegiao: {
      quarta: ordenadas.filter((s) => s.regiao === '4ª').length,
      quinta: ordenadas.filter((s) => s.regiao === '5ª').length,
      naoInformada: ordenadas.filter((s) => !s.regiao).length,
    },
    cidades: [...new Set(ordenadas.map((s) => s.cidade))].sort(),
    unidadesAtivas: ordenadas.filter((s) => s.status === 'Ativo').length,
    mediaPorTurmaCarteira: totalTurmas > 0 ? arredonda1(totalMatriculas / totalTurmas) : null,
    maiorUnidade: ordenadas.length
      ? { nome: ordenadas[0].nome, matriculas: ordenadas[0].matriculas }
      : null,
    menorUnidade: ordenadas.length
      ? {
          nome: ordenadas[ordenadas.length - 1].nome,
          matriculas: ordenadas[ordenadas.length - 1].matriculas,
        }
      : null,
  };

  const pendencias: PendenciaRelatorio[] = [];
  for (const s of ordenadas) {
    const base = { codInep: s.codInep, escola: s.nome };
    if (!s.regiao) {
      pendencias.push({
        ...base,
        campo: 'Região',
        descricao: 'Região (4ª ou 5ª) não informada no cadastro.',
      });
    }
    if (!Object.prototype.hasOwnProperty.call(turmasPorEscola, s.id) || turmasPorEscola[s.id] === 0) {
      pendencias.push({
        ...base,
        campo: 'Turmas',
        descricao: 'Nenhuma turma ativa cadastrada — a média por turma não pode ser calculada.',
      });
    }
    if (!s.matriculas || s.matriculas <= 0) {
      pendencias.push({
        ...base,
        campo: 'Matrícula',
        descricao: 'Matrícula inicial ausente ou igual a zero.',
      });
    }
    if (s.status !== 'Ativo') {
      pendencias.push({
        ...base,
        campo: 'Situação',
        descricao: `Unidade com status "${s.status}".`,
      });
    }
  }

  return {
    geradoEm: agora.toISOString(),
    resumo,
    linhas,
    pendencias,
  };
}

/**
 * Detecta metas que aparentam ser valor padrão em vez de meta pactuada por
 * unidade: quando a mesma meta se repete na maioria das escolas da carteira.
 * Não afirma que está errado — sinaliza para conferência humana.
 */
export function detectarMetaSuspeita(
  linhas: readonly LinhaRelatorio[],
  campo: 'metaSpaece' | 'metaIdeb'
): { valor: number; ocorrencias: number } | null {
  if (linhas.length < 3) return null;
  const contagem = new Map<number, number>();
  for (const l of linhas) {
    const v = l[campo];
    contagem.set(v, (contagem.get(v) ?? 0) + 1);
  }
  let maisComum: { valor: number; ocorrencias: number } | null = null;
  for (const [valor, ocorrencias] of contagem) {
    if (!maisComum || ocorrencias > maisComum.ocorrencias) maisComum = { valor, ocorrencias };
  }
  if (!maisComum) return null;
  // Só sinaliza quando o mesmo valor cobre mais de dois terços da carteira.
  return maisComum.ocorrencias / linhas.length > 2 / 3 ? maisComum : null;
}

export function formatarDataRelatorio(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}
