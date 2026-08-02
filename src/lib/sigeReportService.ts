// Correção funcional pós-PR #17 — "Registrar relatório do SIGE": permite
// registrar VÁRIAS turmas de um relatório do SIGE Escola de uma vez,
// criando a turma automaticamente (com confirmação humana explícita) quando
// ela ainda não está cadastrada — o usuário não precisa mais sair para
// Gestão de Escolas antes de conseguir registrar o acompanhamento. Núcleo
// puro (resolveSigeReportRows) separado da orquestração assíncrona
// (saveSigeReport), mesmo padrão de schoolFlowService.ts/
// gradeEntryMonitoringService.ts.
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { Turma } from '../types/classroom';
import type { Bimestre, GradeEntryMonitoring, GradeEntryMonitoringStatus } from '../types/gradeEntryMonitoring';
import { buildClassroomPayload, type CreateClassroomInput } from './classService';
import { buildGradeEntryMonitoringPayload, type SaveGradeEntryMonitoringInput } from './gradeEntryMonitoringService';
import { matchTurmaForReportRow } from './sigeReportMatching';
import { queueAuditLog } from './auditService';

export class SigeReportValidationError extends Error {}

export interface SigeReportRowInput {
  // Preenchido pela interface quando a turma já foi resolvida (automática
  // ou escolhida manualmente entre candidatos ambíguos). Vazio/ausente só é
  // aceito quando isNovaTurmaConfirmada é true.
  turmaId?: string;
  turmaNome: string;
  turno?: string;
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
  sourceReportTitle?: string;
  sourceFileName?: string;
  observation?: string;
  rows: readonly SigeReportRowInput[];
  actingUserEmail: string;
  now: string;
}

interface ResolvedSigeReportRow {
  readonly input: SigeReportRowInput;
  // Vazio quando isNewTurma — o ID real só existe depois que a fase 1 de
  // saveSigeReport comita (ver createdTurmaIdByIndex).
  readonly turmaId: string;
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
      return { input: row, turmaId: turma.id, isNewTurma: false };
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
    return { input: row, turmaId: '', isNewTurma: true };
  });
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

// Grava o relatório inteiro. existingMonitoringByTurmaId é o MESMO mapa que
// NotasView já monta a partir do useGradeEntryMonitoring em uso (nunca uma
// nova consulta — os dados já estão carregados na tela).
//
// Duas fases, nunca uma só: a regra de segurança de grade_entry_monitoring
// (isCanonicalTurmaOfSchoolYearAndName) faz um get() na turma referenciada,
// e get() dentro de uma regra do Firestore enxerga o estado do banco ANTES
// do batch atual — uma turma criada no MESMO batch ainda não existiria
// para essa checagem, e a escrita do acompanhamento seria rejeitada mesmo
// as duas escritas estando "no mesmo commit" do ponto de vista do cliente.
// Por isso turmas novas são commitadas primeiro (fase 1, atômica entre si),
// e só depois os documentos de grade_entry_monitoring (fase 2, atômica
// entre si) — cada fase é atômica isoladamente, mas não há atomicidade
// completa entre as duas fases (limitação real do modelo de regras do
// Firestore, não uma escolha de implementação). Se a fase 2 falhar depois
// da fase 1 ter sido commitada, as turmas novas continuam existindo e uma
// nova tentativa as reaproveita (elas passam a ser encontradas por ID/nome
// na resolução seguinte) — nunca duplicadas.
export async function saveSigeReport(
  input: SigeReportInput,
  existingTurmas: readonly Turma[],
  existingMonitoringByTurmaId: ReadonlyMap<string, GradeEntryMonitoring>
): Promise<SigeReportSaveResult> {
  const resolved = resolveSigeReportRows(input.rows, existingTurmas);

  // Pré-monta e valida TODOS os documentos de grade_entry_monitoring ANTES
  // de qualquer escrita no Firestore, inclusive antes da fase 1 (criação de
  // turmas) — buildGradeEntryMonitoringPayload já lança
  // GradeEntryMonitoringValidationError para qualquer linha
  // matematicamente inconsistente (mesma checagem de isMathematicallyConsistent
  // em gradeEntryMonitoringCalculations.ts). Uma linha inconsistente nunca
  // pode deixar uma turma nova órfã sem o próprio acompanhamento que a
  // motivou. `resolved`/cada linha nunca é mutado (imutabilidade) — o
  // turmaId real de uma turma nova é resolvido por índice, num Map à parte
  // (createdTurmaIdByIndex), preenchido só depois que a fase 1 comita.
  const prepared = resolved.map((row, index) => {
    const existingMonitoring = row.isNewTurma ? undefined : existingMonitoringByTurmaId.get(row.turmaId);
    const saveInput: SaveGradeEntryMonitoringInput = {
      schoolId: input.schoolId,
      codInep: input.codInep,
      escolaNome: input.escolaNome,
      turmaId: row.turmaId || '(nova)',
      turmaNome: row.input.turmaNome,
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
      sourceReportTitle: input.sourceReportTitle ?? null,
      sourceFileName: input.sourceFileName ?? null,
      observation: input.observation ?? null,
      actingUserEmail: input.actingUserEmail,
      now: input.now,
    };
    // Valida antecipadamente (o turmaId real ainda pode não existir para
    // turma nova — a validação em si não depende do turmaId, só dos
    // totais/data/tamanhos). O payload FINAL (com o turmaId real) é
    // remontado na fase 2, depois que toda turma nova já existe.
    buildGradeEntryMonitoringPayload(saveInput, existingMonitoring);
    return { index, row, existingMonitoring, saveInput };
  });

  // --- Fase 1: turmas novas ---
  const newRows = prepared.filter(p => p.row.isNewTurma);
  const createdTurmaIdByIndex = new Map<number, string>();
  if (newRows.length > 0) {
    const turmaBatch = writeBatch(db);
    for (const { index, row } of newRows) {
      const ref = doc(collection(db, 'turmas'));
      const createInput: CreateClassroomInput = {
        schoolId: input.schoolId,
        codInep: input.codInep,
        escolaNome: input.escolaNome,
        anoLetivo: input.anoLetivo,
        nome: row.input.turmaNome,
        // serie/etapa/oferta ficam vazios de propósito — o relatório do
        // SIGE não informa esses campos; Gestão de Escolas continua sendo
        // o lugar para completá-los depois (item 9 do plano: ela não é
        // mais PRÉ-REQUISITO, mas continua disponível para manutenção).
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
    }
    await turmaBatch.commit();
  }

  // --- Fase 2: grade_entry_monitoring (turmas novas já existem de fato) ---
  const monitoringBatch = writeBatch(db);
  const results: SigeReportRowResult[] = [];
  for (const { index, row, existingMonitoring, saveInput } of prepared) {
    const turmaId = row.isNewTurma ? createdTurmaIdByIndex.get(index)! : row.turmaId;
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
      turmaId, turmaNome: row.input.turmaNome,
      wasTurmaCreated: row.isNewTurma, monitoring: payload,
    });
  }

  try {
    await monitoringBatch.commit();
  } catch (err) {
    if (newRows.length > 0) {
      throw new SigeReportValidationError(
        'As turmas novas foram criadas, mas o registro do relatório falhou: ' +
        (err instanceof Error ? err.message : String(err)) +
        ' As turmas já criadas serão reaproveitadas ao tentar novamente.'
      );
    }
    throw err;
  }

  return { rows: results, turmasCreated: newRows.length };
}
