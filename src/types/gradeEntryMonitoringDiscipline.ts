// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": o modelo anterior só tinha um total geral por TURMA
// (grade_entry_monitoring, preservado intacto — nunca migrado nem excluído,
// continua servindo o fluxo de registro do SIGE do PR #18 e a Sala de
// Situação). Esta coleção NOVA e SEPARADA acrescenta a dimensão
// disciplina/área, exigida explicitamente pelo plano: escola + ano letivo +
// bimestre + turma + disciplina. Nunca duplica nome de estudante nem nota
// individual — só lançamentos esperados/realizados agregados por turma e
// disciplina (percentual sempre calculado, nunca persistido).
//
// Correção final da auditoria — seção 3: a primeira versão restringia
// disciplina a só quatro ÁREAS fixas (linguaPortuguesa/matematica/
// cienciasNatureza/cienciasHumanas), reaproveitando a taxonomia do
// protótipo nominal descontinuado. Isso não é "disciplina" de verdade — o
// relatório do SIGE Escola traz disciplinas reais (Língua Portuguesa,
// Matemática, História, Geografia, Física, Química, Biologia, Filosofia,
// Sociologia, Língua Inglesa, Arte, Educação Física etc.), e o sistema
// nunca pode ficar limitado a quatro. O modelo agora separa dois conceitos:
// - disciplinaNome: nome real da disciplina, texto livre (nunca uma lista
//   fechada de 4 valores) — é o que o usuário vê e confirma.
// - disciplinaId: chave estável e seguraa derivada de disciplinaNome
//   (normalizeDisciplinaId, abaixo) — nunca texto arbitrário direto no ID
//   do documento.
// - areaConhecimento: OPCIONAL, só para permitir consolidação/agrupamento
//   por área quando fizer sentido (ver
//   consolidateGradeEntryMonitoringDisciplineByArea em
//   gradeEntryMonitoringCalculations.ts) — nunca obrigatório, nunca decide
//   sozinho a identidade do registro.
import type { Bimestre } from './gradeEntryMonitoring';

// Lista fechada só para a ÁREA (agrupamento opcional) — nunca para a
// disciplina em si. "Outra" cobre qualquer área não prevista sem bloquear o
// cadastro da disciplina.
export const AREA_CONHECIMENTO = [
  'Linguagens', 'Matemática', 'Ciências da Natureza', 'Ciências Humanas', 'Formação Técnica', 'Outra',
] as const;
export type AreaConhecimento = (typeof AREA_CONHECIMENTO)[number];

// Lista de conveniência para a interface (dropdown com busca + opção
// "Outra" para texto livre) — NUNCA uma lista de validação. O serviço
// aceita qualquer disciplinaNome não vazio; esta lista só evita digitação
// repetida das disciplinas mais comuns do relatório do SIGE Escola. Não é
// um catálogo por escola (nenhuma das 56 escolas tem disciplina alguma
// pré-atribuída aqui) — é só um vocabulário comum sugerido.
export const DISCIPLINAS_CONHECIDAS: ReadonlyArray<{ nome: string; areaConhecimento: AreaConhecimento }> = [
  { nome: 'Língua Portuguesa', areaConhecimento: 'Linguagens' },
  { nome: 'Língua Inglesa', areaConhecimento: 'Linguagens' },
  { nome: 'Arte', areaConhecimento: 'Linguagens' },
  { nome: 'Educação Física', areaConhecimento: 'Linguagens' },
  { nome: 'Matemática', areaConhecimento: 'Matemática' },
  { nome: 'Física', areaConhecimento: 'Ciências da Natureza' },
  { nome: 'Química', areaConhecimento: 'Ciências da Natureza' },
  { nome: 'Biologia', areaConhecimento: 'Ciências da Natureza' },
  { nome: 'História', areaConhecimento: 'Ciências Humanas' },
  { nome: 'Geografia', areaConhecimento: 'Ciências Humanas' },
  { nome: 'Filosofia', areaConhecimento: 'Ciências Humanas' },
  { nome: 'Sociologia', areaConhecimento: 'Ciências Humanas' },
];

// Mesmo algoritmo de slug já usado em EscolasView.tsx para gerar o ID de
// uma escola nova a partir do nome (NFD + remoção de diacríticos +
// minúsculas + não-alfanumérico vira hífen) — reaproveitado aqui de
// propósito, para não inventar uma segunda convenção de normalização no
// mesmo repositório. "Evitar colisão entre nomes normalizados" (auditoria,
// seção 3): nomes iguais a menos de acentuação/espaçamento/maiúsculas
// DEVEM colidir no mesmo disciplinaId (é o comportamento desejado — é a
// mesma disciplina, e permite upsert/consolidação corretos); disciplinas
// genuinamente diferentes do vocabulário real do SIGE Escola não colidem
// nesse esquema. Tradeoff aceito e documentado, mesmo espírito de
// schoolNamesMatch em classService.ts.
export function normalizeDisciplinaId(disciplinaNome: string): string {
  return disciplinaNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type GradeEntryMonitoringDisciplineStatus = 'rascunho' | 'confirmado';

export interface GradeEntryMonitoringByDiscipline {
  id: string; // `${schoolId}_${anoLetivo}_b${bimestre}_${turmaId}_${disciplinaId}`
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  // Chave estável e segura (normalizeDisciplinaId(disciplinaNome)) — nunca
  // o texto livre bruto direto no ID do documento.
  disciplinaId: string;
  // Nome de exibição confirmado pelo usuário — preservado exatamente como
  // digitado/selecionado (nunca substituído pela versão normalizada).
  disciplinaNome: string;
  // Opcional — só para consolidação por área quando fizer sentido.
  areaConhecimento?: AreaConhecimento;
  // Só o necessário ao cálculo do percentual (soma realizados / soma
  // esperados) — nunca duplica totalStudents/breakdown por situação do
  // estudante, que continua sendo um conceito por TURMA (grade_entry_monitoring),
  // não por disciplina.
  expectedGradeEntries: number;
  completedGradeEntries: number;
  status: GradeEntryMonitoringDisciplineStatus;
  referenceDate: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
