// Correção funcional pós-PR #17 — "Registrar relatório do SIGE": permite
// registrar VÁRIAS turmas de um relatório do SIGE Escola de uma vez,
// criando a turma automaticamente (com confirmação humana explícita) quando
// ela ainda não está cadastrada — o usuário não precisa mais sair para
// Gestão de Escolas antes de conseguir registrar o acompanhamento. Núcleo
// puro (resolveSigeReportRows/validateNoInternalDuplicates) separado da
// orquestração assíncrona (saveSigeReport), mesmo padrão de
// schoolFlowService.ts/gradeEntryMonitoringService.ts.
//
// Correções do code review do PR #18:
//   1) duplicidade DENTRO do próprio relatório é bloqueada explicitamente —
//      nunca confia no ID determinístico de grade_entry_monitoring para
//      "resolver" duas linhas da mesma turma por acidente;
//   2) o nome gravado em grade_entry_monitoring.turmaNome é SEMPRE o nome
//      canônico da turma (turma.nome), nunca o texto solto digitado pelo
//      usuário, quando a linha resolve para uma turma já existente;
//   3) uma falha na fase 2 (depois da fase 1 já ter criado turmas) lança
//      SigeReportPartialSaveError, tipado, com os IDs/nomes já criados —
//      nunca um erro genérico que esconde o que já foi gravado;
//   6) "matrícula atual" só tem efeito real ao CRIAR uma turma nova; para
//      turma existente, é ignorada pelo serviço (a interface trata o campo
//      como somente informativo nesse caso — nunca editável sem efeito);
//   7) antes de qualquer escrita, a lista de turmas é revalidada contra o
//      Firestore (nunca confia só na lista que a UI tinha ao abrir o modal)
//      — uma turma criada por outra pessoa nesse meio-tempo nunca é
//      duplicada.
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Turma } from '../types/classroom';
import type { Bimestre, GradeEntryMonitoring, GradeEntryMonitoringStatus } from '../types/gradeEntryMonitoring';
import { buildClassroomPayload, getClassroomsForSchoolYear, listClassroomsForSchool, type CreateClassroomInput } from './classService';
import { buildGradeEntryMonitoringPayload, type SaveGradeEntryMonitoringInput } from './gradeEntryMonitoringService';
import { matchTurmaForReportRow } from './sigeReportMatching';
import { queueAuditLog } from './auditService';
import { normalizeSchoolName } from './schoolIdentity';
import { isNonNegativeInteger } from './enrollmentCalculations';

export class SigeReportValidationError extends Error {}

export interface CreatedTurmaInfo {
  id: string;
  nome: string;
}

// Lançado quando a fase 1 (turmas novas) já foi commitada, mas a fase 2
// (grade_entry_monitoring) falhou — nunca um erro genérico aqui, porque o
// chamador PRECISA saber quais turmas já existem de fato para não tentar
// recriá-las numa nova tentativa (ver SigeReportModal, que usa
// createdTurmas para bloquear um novo clique até a lista de turmas ser
// atualizada).
export class SigeReportPartialSaveError extends Error {
  readonly createdTurmas: readonly CreatedTurmaInfo[];
  readonly originalError: unknown;

  constructor(createdTurmas: readonly CreatedTurmaInfo[], originalError: unknown) {
    super(
      'As turmas novas foram criadas, mas o registro do relatório falhou: ' +
      (originalError instanceof Error ? originalError.message : String(originalError)) +
      ' A lista de turmas será atualizada automaticamente — as turmas já criadas serão reaproveitadas, nunca recriadas.'
    );
    this.name = 'SigeReportPartialSaveError';
    this.createdTurmas = createdTurmas;
    this.originalError = originalError;
  }
}

export interface SigeReportRowInput {
  // Preenchido pela interface quando a turma já foi resolvida (automática
  // ou escolhida manualmente entre candidatos ambíguos). Vazio/ausente só é
  // aceito quando isNovaTurmaConfirmada é true.
  turmaId?: string;
  turmaNome: string;
  turno?: string;
  // Só tem efeito real quando a linha cria uma turma NOVA (vira
  // matriculaInicial/matriculaAtual do novo documento). Para turma
  // existente é ignorado pelo serviço — a interface mostra o campo como
  // somente informativo nesse caso (item 6 do code review do PR #18).
  matriculaAtual?: number;
  // true só quando o usuário confirmou EXPLICITAMENTE, nesta linha, que é
  // uma turma nova — nunca inferido, nunca marcado por padrão (seção 7:
  // "exigir confirmação humana" / "não criar turma automaticamente antes
  // da confirmação final").
  isNovaTurmaConfirmada: boolean;
  totalStudents: number;
  studentsWithCompleteGrades: number;
  studentsWithPartialGrades: number;
  studentsWithoutGrades: number;
  expectedGradeEntries: number;
  completedGradeEntries: number;
  status: GradeEntryMonitoringStatus;
}

export interface SigeReportInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  referenceDate: string;
  // undefined = preservar os metadados já existentes de CADA turma
  // (nunca apagar um título/arquivo/observação anterior só porque o
  // relatório coletivo não repetiu o campo — item 5 do code review do PR
  // #18). Este fluxo não oferece remoção explícita destes metadados;
  // quando isso for necessário, use o formulário de uma única turma
  // (GradeEntryMonitoringFormModal), que já suporta null = remover.
  sourceReportTitle?: string;
  sourceFileName?: string;
  observation?: string;
  rows: readonly SigeReportRowInput[];
  actingUserEmail: string;
  now: string;
}

interface ResolvedSigeReportRow {
  readonly input: SigeReportRowInput;
  // Objeto Turma CANÔNICO (não só o ID) quando a linha resolve para uma
  // turma já existente — item 2 do code review do PR #18: o payload de
  // grade_entry_monitoring precisa do nome REAL cadastrado em `turmas`,
  // nunca do texto solto que o usuário digitou (que pode ter batido só
  // depois de normalizado — caixa/espaço/acento diferentes).
  readonly turma: Turma | null;
  readonly isNewTurma: boolean;
}

// Núcleo puro: resolve cada linha para uma turma real (existente ou
// marcada para criação) e valida as invariantes que NUNCA podem ser
// violadas, mesmo que a interface já tenha barrado isso — defesa em
// profundidade, mesmo princípio de validateGradeEntryMonitoringInput/
// validateCreateClassroomInput (sempre revalidados na camada de serviço,
// nunca só na UI). Não toca o Firestore.
export function resolveSigeReportRows(
  rows: readonly SigeReportRowInput[],
  existingTurmas: readonly Turma[]
): ResolvedSigeReportRow[] {
  if (rows.length === 0) {
    throw new SigeReportValidationError('Adicione ao menos uma turma ao relatório.');
  }
  return rows.map(row => {
    if (row.turmaId) {
      const turma = existingTurmas.find(t => t.id === row.turmaId);
      if (!turma) {
        throw new SigeReportValidationError(
          `A turma "${row.turmaNome}" não foi encontrada nesta escola/ano — atualize a página e tente novamente.`
        );
      }
      return { input: row, turma, isNewTurma: false };
    }

    if (!row.isNovaTurmaConfirmada) {
      throw new SigeReportValidationError(
        `Confirme a correspondência da turma "${row.turmaNome}" antes de salvar — nenhuma turma é criada sem confirmação explícita.`
      );
    }
    // Revalida o próprio match do lado do serviço: nunca confia só na
    // resolução feita pela UI. Se por qualquer motivo a turma já existir
    // (ex.: dado carregado pela UI ficou desatualizado), a criação é
    // bloqueada — nunca duplica.
    const match = matchTurmaForReportRow({ turmaNome: row.turmaNome, turno: row.turno }, existingTurmas);
    if (match.status === 'encontrada') {
      throw new SigeReportValidationError(
        `A turma "${row.turmaNome}" já está cadastrada — não é possível confirmá-la como nova.`
      );
    }
    if (match.status === 'possivel_correspondencia') {
      throw new SigeReportValidationError(
        `A turma "${row.turmaNome}" tem correspondência ambígua — escolha uma das turmas existentes ou confirme explicitamente que é uma turma nova.`
      );
    }
    return { input: row, turma: null, isNewTurma: true };
  });
}

function normalizeTurnoKey(turno: string | undefined): string {
  // normalizeSchoolName é, apesar do nome, um normalizador genérico de
  // string (trim + minúsculas + colapso de espaço + remoção de acentos) —
  // reaproveitado aqui pelo mesmo motivo de sigeReportMatching.ts.
  return normalizeSchoolName(turno ?? '');
}

// Item 1 do code review do PR #18: duplicidade DENTRO do próprio
// relatório — nunca confia no ID determinístico de grade_entry_monitoring
// para "resolver" isso (duas linhas para a mesma turma existente
// silenciosamente sobrescreveriam o mesmo documento, e duas turmas NOVAS
// com o mesmo nome criariam dois documentos diferentes em `turmas`).
// Validado ANTES de qualquer escrita.
export function validateNoInternalDuplicates(resolved: readonly ResolvedSigeReportRow[]): void {
  // --- Turmas existentes: o mesmo turmaId não pode aparecer duas vezes ---
  const existingLinesByTurmaId = new Map<string, number[]>();
  resolved.forEach((row, index) => {
    if (row.isNewTurma || !row.turma) return;
    const lines = existingLinesByTurmaId.get(row.turma.id) ?? [];
    lines.push(index + 1);
    existingLinesByTurmaId.set(row.turma.id, lines);
  });
  for (const lines of existingLinesByTurmaId.values()) {
    if (lines.length > 1) {
      throw new SigeReportValidationError(
        `A mesma turma aparece mais de uma vez no relatório (linhas ${lines.join(', ')}) — remova a linha repetida.`
      );
    }
  }

  // --- Turmas novas: mesmo nome normalizado (+ turno) não pode se repetir ---
  const newRowsByName = new Map<string, { line: number; turnoKey: string }[]>();
  resolved.forEach((row, index) => {
    if (!row.isNewTurma) return;
    const nameKey = normalizeSchoolName(row.input.turmaNome);
    const list = newRowsByName.get(nameKey) ?? [];
    list.push({ line: index + 1, turnoKey: normalizeTurnoKey(row.input.turno) });
    newRowsByName.set(nameKey, list);
  });
  for (const entries of newRowsByName.values()) {
    if (entries.length < 2) continue;
    const lines = entries.map(e => e.line).join(', ');
    // Turno ausente em ao menos uma das linhas do grupo: não há como
    // confirmar que são turmas DIFERENTES — trata como possível
    // duplicidade e exige correção humana, nunca decide sozinho.
    if (entries.some(e => e.turnoKey === '')) {
      throw new SigeReportValidationError(
        `Possível duplicidade: as linhas ${lines} têm o mesmo nome de turma e o turno não foi informado em todas — informe o turno para diferenciar ou remova a linha repetida.`
      );
    }
    const turnoKeys = new Set(entries.map(e => e.turnoKey));
    if (turnoKeys.size !== entries.length) {
      throw new SigeReportValidationError(
        `As linhas ${lines} representam a mesma turma nova (mesmo nome e turno) — não é possível confirmá-la duas vezes.`
      );
    }
    // Turnos todos informados e realmente diferentes entre si: podem
    // coexistir (são turmas distintas, ex.: mesma série em turnos diferentes).
  }
}

export interface SigeReportRowResult {
  turmaId: string;
  turmaNome: string;
  wasTurmaCreated: boolean;
  monitoring: GradeEntryMonitoring;
}

export interface SigeReportSaveResult {
  rows: readonly SigeReportRowResult[];
  turmasCreated: number;
}

// Grava o relatório inteiro.
//
// Item 7 do code review do PR #18 — revalidação de concorrência: a lista
// de turmas que a UI tinha ao abrir o modal pode estar desatualizada (outra
// pessoa pode ter criado a MESMA turma nesse meio-tempo). Por isso a
// primeira coisa que esta função faz é buscar de novo as turmas reais da
// escola/ano — sempre escopadas por schoolId (listClassroomsForSchool,
// nunca a coleção inteira) e por anoLetivo (getClassroomsForSchoolYear,
// mesma cascata usada por NotasView) — e resolve/valida contra ESSE estado,
// nunca contra o snapshot antigo que o chamador tinha.
//
// existingMonitoringByTurmaId continua vindo do chamador (não revalidado
// contra o Firestore): um acompanhamento já existente sendo corrigido por
// duas pessoas ao mesmo tempo é um conflito de EDIÇÃO comum (mesma
// categoria de "last write wins" que qualquer outro formulário desta base
// já aceita), diferente do risco de DUPLICAR uma turma inteira, que é
// irreversível sem intervenção manual — por isso só a lista de turmas é
// revalidada aqui.
//
// Duas fases, nunca uma só: a regra de segurança de grade_entry_monitoring
// (isCanonicalTurmaOfSchoolYearAndName) faz um get() na turma referenciada,
// e get() dentro de uma regra do Firestore enxerga o estado do banco ANTES
// do batch atual — uma turma criada no MESMO batch ainda não existiria
// para essa checagem, e a escrita do acompanhamento seria rejeitada mesmo
// as duas escritas estando "no mesmo commit" do ponto de vista do cliente.
// Por isso turmas novas são commitadas primeiro (fase 1, atômica entre si),
// e só depois os documentos de grade_entry_monitoring (fase 2, atômica
// entre si) — cada fase é atômica isoladamente, mas NÃO há atomicidade
// completa entre as duas fases (limitação real do modelo de regras do
// Firestore, não uma escolha de implementação). Se a fase 2 falhar depois
// da fase 1 ter sido commitada, esta função lança SigeReportPartialSaveError
// (nunca um erro genérico) com os IDs/nomes das turmas já criadas, para o
// chamador poder se recuperar sem duplicar nada numa nova tentativa.
export async function saveSigeReport(
  input: SigeReportInput,
  existingMonitoringByTurmaId: ReadonlyMap<string, GradeEntryMonitoring>
): Promise<SigeReportSaveResult> {
  const freshTurmasForSchool = await listClassroomsForSchool(input.schoolId);
  const existingTurmas = getClassroomsForSchoolYear(
    freshTurmasForSchool,
    { id: input.schoolId, nome: input.escolaNome, codInep: input.codInep },
    input.anoLetivo
  );

  const resolved = resolveSigeReportRows(input.rows, existingTurmas);
  validateNoInternalDuplicates(resolved);

  // Matrícula atual só é validada para turma NOVA (único caso em que tem
  // efeito real — item 6 do code review do PR #18). Nunca aceita NaN,
  // Infinity, decimal ou texto; validado ANTES de qualquer escrita.
  for (const row of resolved) {
    if (row.isNewTurma && row.input.matriculaAtual !== undefined && !isNonNegativeInteger(row.input.matriculaAtual)) {
      throw new SigeReportValidationError(
        `Matrícula atual inválida para a turma "${row.input.turmaNome}" — use um número inteiro maior ou igual a zero.`
      );
    }
  }

  // Pré-monta e valida TODOS os documentos de grade_entry_monitoring ANTES
  // de qualquer escrita no Firestore, inclusive antes da fase 1 (criação de
  // turmas) — buildGradeEntryMonitoringPayload já lança
  // GradeEntryMonitoringValidationError para qualquer linha
  // matematicamente inconsistente. Uma linha inconsistente nunca pode
  // deixar uma turma nova órfã sem o próprio acompanhamento que a
  // motivou. `resolved`/cada linha nunca é mutado (imutabilidade) — o
  // turmaId real de uma turma nova é resolvido por índice, num Map à parte
  // (createdTurmaIdByIndex), preenchido só depois que a fase 1 comita.
  const prepared = resolved.map((row, index) => {
    const existingMonitoring = row.turma ? existingMonitoringByTurmaId.get(row.turma.id) : undefined;
    // turmaNome CANÔNICO (item 2): turma.nome quando a linha resolve para
    // uma turma existente — nunca o texto digitado, que só precisou BATER
    // depois de normalizado (caixa/espaço/acento podem divergir do
    // documento real). Para turma nova, o nome confirmado é o que será
    // gravado no próprio documento novo, então coincide com o texto.
    const turmaNomeCanonico = row.turma ? row.turma.nome : row.input.turmaNome.trim();
    const saveInput: SaveGradeEntryMonitoringInput = {
      schoolId: input.schoolId,
      codInep: input.codInep,
      escolaNome: input.escolaNome,
      turmaId: row.turma ? row.turma.id : '(nova)',
      turmaNome: turmaNomeCanonico,
      anoLetivo: input.anoLetivo,
      bimestre: input.bimestre,
      totalStudents: row.input.totalStudents,
      studentsWithCompleteGrades: row.input.studentsWithCompleteGrades,
      studentsWithPartialGrades: row.input.studentsWithPartialGrades,
      studentsWithoutGrades: row.input.studentsWithoutGrades,
      expectedGradeEntries: row.input.expectedGradeEntries,
      completedGradeEntries: row.input.completedGradeEntries,
      status: row.input.status,
      referenceDate: input.referenceDate,
      // undefined = preserva os metadados já existentes de CADA
      // acompanhamento — NUNCA convertido para null aqui (item 5 do code
      // review do PR #18; null só significa remoção explícita, que este
      // fluxo coletivo não oferece).
      sourceReportTitle: input.sourceReportTitle,
      sourceFileName: input.sourceFileName,
      observation: input.observation,
      actingUserEmail: input.actingUserEmail,
      now: input.now,
    };
    // Valida antecipadamente (o turmaId real ainda pode não existir para
    // turma nova — a validação em si não depende do turmaId, só dos
    // totais/data/tamanhos). O payload FINAL (com o turmaId real) é
    // remontado na fase 2, depois que toda turma nova já existe.
    buildGradeEntryMonitoringPayload(saveInput, existingMonitoring);
    return { index, row, existingMonitoring, saveInput, turmaNomeCanonico };
  });

  // --- Fase 1: turmas novas ---
  const newRows = prepared.filter(p => p.row.isNewTurma);
  const createdTurmaIdByIndex = new Map<number, string>();
  const createdTurmas: CreatedTurmaInfo[] = [];
  if (newRows.length > 0) {
    const turmaBatch = writeBatch(db);
    for (const { index, row, turmaNomeCanonico } of newRows) {
      const ref = doc(collection(db, 'turmas'));
      const createInput: CreateClassroomInput = {
        schoolId: input.schoolId,
        codInep: input.codInep,
        escolaNome: input.escolaNome,
        anoLetivo: input.anoLetivo,
        nome: turmaNomeCanonico,
        // serie/etapa/oferta ficam vazios de propósito — o relatório do
        // SIGE não informa esses campos; Gestão de Escolas continua sendo
        // o lugar para completá-los depois (item 9 do plano original: ela
        // não é mais PRÉ-REQUISITO, mas continua disponível para
        // manutenção).
        serie: '',
        etapa: '',
        modalidade: 'Regular',
        turno: row.input.turno ?? '',
        oferta: '',
        matriculaInicial: row.input.matriculaAtual ?? 0,
        ativa: true,
        actingUserEmail: input.actingUserEmail,
        now: input.now,
      };
      const payload = buildClassroomPayload(createInput, ref.id);
      turmaBatch.set(ref, payload);
      queueAuditLog(turmaBatch, {
        collectionName: 'turmas',
        documentId: ref.id,
        schoolId: input.schoolId,
        codInep: input.codInep,
        anoLetivo: input.anoLetivo,
        operation: 'create',
        previousValue: null,
        // Nunca dado nominal — só identidade/contagem agregada da turma
        // recém-criada (mesmo princípio de summary() na fase 2 abaixo).
        newValue: {
          nome: payload.nome, turno: payload.turno || null,
          matriculaInicial: payload.matriculaInicial, origem: 'relatorio_sige',
        },
        source: 'SIGE Escola',
        userId: input.actingUserEmail,
        userEmail: input.actingUserEmail,
        now: input.now,
      });
      createdTurmaIdByIndex.set(index, ref.id);
      createdTurmas.push({ id: ref.id, nome: turmaNomeCanonico });
    }
    await turmaBatch.commit();
  }

  // --- Fase 2: grade_entry_monitoring (turmas novas já existem de fato) ---
  const monitoringBatch = writeBatch(db);
  const results: SigeReportRowResult[] = [];
  for (const { index, row, existingMonitoring, saveInput } of prepared) {
    const turmaId = row.isNewTurma ? createdTurmaIdByIndex.get(index)! : row.turma!.id;
    const payload = buildGradeEntryMonitoringPayload({ ...saveInput, turmaId }, existingMonitoring);
    monitoringBatch.set(doc(db, 'grade_entry_monitoring', payload.id), payload);

    const summary = (m: GradeEntryMonitoring) => ({
      action: existingMonitoring ? 'update' : 'create',
      monitoringId: m.id, turmaId: m.turmaId, anoLetivo: m.anoLetivo, bimestre: m.bimestre,
      totalStudents: m.totalStudents, expectedGradeEntries: m.expectedGradeEntries,
      completedGradeEntries: m.completedGradeEntries, status: m.status,
    });
    queueAuditLog(monitoringBatch, {
      collectionName: 'grade_entry_monitoring',
      documentId: payload.id,
      schoolId: payload.schoolId,
      codInep: payload.codInep,
      anoLetivo: payload.anoLetivo,
      operation: existingMonitoring ? 'update' : 'create',
      previousValue: existingMonitoring ? summary(existingMonitoring) : null,
      newValue: summary(payload),
      source: 'SIGE Escola',
      userId: input.actingUserEmail,
      userEmail: input.actingUserEmail,
      now: input.now,
    });

    results.push({
      turmaId, turmaNome: payload.turmaNome,
      wasTurmaCreated: row.isNewTurma, monitoring: payload,
    });
  }

  try {
    await monitoringBatch.commit();
  } catch (err) {
    if (createdTurmas.length > 0) {
      throw new SigeReportPartialSaveError(createdTurmas, err);
    }
    throw err;
  }

  return { rows: results, turmasCreated: newRows.length };
}
