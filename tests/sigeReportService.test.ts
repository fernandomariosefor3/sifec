// Correção funcional pós-PR #17 — testes de sigeReportService.ts:
// resolução pura das linhas (resolveSigeReportRows), bloqueio de
// duplicidade interna (validateNoInternalDuplicates) e orquestração
// assíncrona (saveSigeReport) contra um Firestore mockado, mesmo padrão de
// tests/schoolFlowServiceFirestore.test.ts. queueAuditLog é mockado
// diretamente (seu próprio comportamento já é coberto por
// tests/auditService.test.ts) para verificar só QUE cada auditoria foi
// enfileirada no batch certo, sem duplicar a checagem de sanitização aqui.
//
// Correções do code review do PR #18: saveSigeReport agora busca as turmas
// da escola/ano DIRETO do Firestore (item 7 — revalidação de concorrência),
// em vez de receber a lista como parâmetro — por isso getDocs também
// precisa ser mockado aqui, configurável por teste via setFreshTurmas().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turma } from '../src/types/classroom';
import type { GradeEntryMonitoring } from '../src/types/gradeEntryMonitoring';

const {
  mockCollection, mockDoc, mockWriteBatch, mockQueueAuditLog, mockGetDocs, batchInstances,
} = vi.hoisted(() => {
  const batches: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[] = [];
  let autoIdCounter = 0;
  return {
    batchInstances: batches,
    mockGetDocs: vi.fn(),
    mockCollection: vi.fn((_db: unknown, name: string) => ({ __collection: name })),
    mockDoc: vi.fn((...args: unknown[]) => {
      if (args.length === 1) {
        // doc(collectionRef) — ID automático.
        autoIdCounter += 1;
        const collRef = args[0] as { __collection: string };
        return { id: `auto-${collRef.__collection}-${autoIdCounter}` };
      }
      // doc(db, collectionName, id) — caminho explícito.
      return { id: args[2] as string };
    }),
    mockWriteBatch: vi.fn(() => {
      const set = vi.fn();
      const commit = vi.fn().mockResolvedValue(undefined);
      const instance = { set, commit };
      batches.push(instance);
      return instance;
    }),
    mockQueueAuditLog: vi.fn(),
  };
});

vi.mock('../src/lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc: mockDoc,
  writeBatch: mockWriteBatch,
  getDocs: mockGetDocs,
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
  limit: vi.fn((n: number) => ({ __limit: n })),
  setDoc: vi.fn(),
}));

vi.mock('../src/lib/auditService', () => ({
  queueAuditLog: mockQueueAuditLog,
}));

function turma(overrides: Partial<Turma> = {}): Turma {
  return {
    id: 't1', escolaId: 'diva-cabral', escolaNome: 'EEM Diva Cabral',
    nome: '3º Ano A', ano: '3º Ano', periodo: 'Matutino', schoolId: 'diva-cabral', anoLetivo: 2026,
    ...overrides,
  };
}

// Configura getDocs para devolver estas turmas tanto para a consulta por
// escolaId quanto para a consulta por schoolId (listClassroomsForSchool as
// dedupe por ID de qualquer forma) — simula o estado ATUAL no Firestore no
// momento em que saveSigeReport revalida (item 7 do code review do PR #18).
function setFreshTurmas(turmas: readonly Turma[]) {
  mockGetDocs.mockResolvedValue({ docs: turmas.map(t => ({ id: t.id, data: () => t })) });
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    bimestre: 1 as const,
    referenceDate: '2026-03-10',
    sourceReportTitle: 'Relatório março',
    rows: [],
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

function rowExisting(overrides: Record<string, unknown> = {}) {
  return {
    turmaId: 't1',
    turmaNome: '3º Ano A',
    turno: 'Matutino',
    matriculaAtual: 30,
    isNovaTurmaConfirmada: false,
    totalStudents: 30, studentsWithCompleteGrades: 30, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
    expectedGradeEntries: 120, completedGradeEntries: 120,
    status: 'confirmado' as const,
    ...overrides,
  };
}

function rowNova(overrides: Record<string, unknown> = {}) {
  return {
    turmaNome: '3º Ano C',
    turno: 'Matutino',
    matriculaAtual: 25,
    isNovaTurmaConfirmada: true,
    totalStudents: 25, studentsWithCompleteGrades: 25, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
    expectedGradeEntries: 100, completedGradeEntries: 100,
    status: 'confirmado' as const,
    ...overrides,
  };
}

describe('sigeReportService', () => {
  beforeEach(() => {
    mockCollection.mockClear();
    mockDoc.mockClear();
    mockWriteBatch.mockClear();
    mockQueueAuditLog.mockClear();
    mockGetDocs.mockReset();
    batchInstances.length = 0;
    setFreshTurmas([]);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('resolveSigeReportRows (núcleo puro)', () => {
    it('rejeita relatório sem nenhuma linha', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      expect(() => resolveSigeReportRows([], [])).toThrow('Adicione ao menos uma turma');
    });

    it('linha com turmaId existente resolve para a turma canônica (turma existente é associada)', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const resolved = resolveSigeReportRows([rowExisting()], existentes);
      expect(resolved[0].turma?.id).toBe('t1');
      expect(resolved[0].turma?.nome).toBe('3º Ano A');
      expect(resolved[0].isNewTurma).toBe(false);
    });

    it('linha sem turmaId e sem confirmação de turma nova é rejeitada (nenhuma turma é criada antes da confirmação)', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      const result = () => resolveSigeReportRows([rowNova({ isNovaTurmaConfirmada: false })], []);
      expect(result).toThrow(/Confirme a correspondência/);
    });

    it('linha confirmada como nova, mas que na verdade já existe (nome bate sem ambiguidade), é bloqueada — duplicidade nunca é permitida', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1', nome: '3º Ano C', turno: 'Matutino' })];
      const result = () => resolveSigeReportRows([rowNova()], existentes);
      expect(result).toThrow(/já está cadastrada/);
    });

    it('linha confirmada como nova, mas ambígua (duas turmas com o mesmo nome), é bloqueada — ambiguidade nunca é resolvida automaticamente', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      const existentes = [
        turma({ id: 't1', nome: '3º Ano C', turno: 'Matutino' }),
        turma({ id: 't2', nome: '3º Ano C', turno: 'Vespertino' }),
      ];
      const result = () => resolveSigeReportRows([rowNova({ turno: undefined })], existentes);
      expect(result).toThrow(/correspondência ambígua/);
    });

    it('linha confirmada como nova, sem correspondência real, resolve como turma nova', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      const resolved = resolveSigeReportRows([rowNova()], []);
      expect(resolved[0].isNewTurma).toBe(true);
      expect(resolved[0].turma).toBeNull();
    });
  });

  // Item 1 do code review do PR #18.
  describe('validateNoInternalDuplicates', () => {
    it('mesma turma existente repetida duas vezes é bloqueada', async () => {
      const { resolveSigeReportRows, validateNoInternalDuplicates } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const resolved = resolveSigeReportRows([rowExisting(), rowExisting()], existentes);
      expect(() => validateNoInternalDuplicates(resolved)).toThrow(/mesma turma aparece mais de uma vez.*linhas 1, 2/);
    });

    it('mesma turma nova com diferença de caixa é bloqueada', async () => {
      const { resolveSigeReportRows, validateNoInternalDuplicates } = await import('../src/lib/sigeReportService');
      const resolved = resolveSigeReportRows(
        [rowNova({ turmaNome: '3º Ano C' }), rowNova({ turmaNome: '3º ANO C' })],
        []
      );
      expect(() => validateNoInternalDuplicates(resolved)).toThrow(/representam a mesma turma nova/);
    });

    it('mesma turma nova com diferença de acento/espaço é bloqueada', async () => {
      const { resolveSigeReportRows, validateNoInternalDuplicates } = await import('../src/lib/sigeReportService');
      const resolved = resolveSigeReportRows(
        [rowNova({ turmaNome: '3º Ano Único' }), rowNova({ turmaNome: '3º ano unico ' })],
        []
      );
      expect(() => validateNoInternalDuplicates(resolved)).toThrow(/representam a mesma turma nova/);
    });

    it('duas novas com mesmo nome e mesmo turno são bloqueadas', async () => {
      const { resolveSigeReportRows, validateNoInternalDuplicates } = await import('../src/lib/sigeReportService');
      const resolved = resolveSigeReportRows(
        [rowNova({ turmaNome: '3º Ano C', turno: 'Matutino' }), rowNova({ turmaNome: '3º Ano C', turno: 'matutino' })],
        []
      );
      expect(() => validateNoInternalDuplicates(resolved)).toThrow(/representam a mesma turma nova/);
    });

    it('mesmo nome com turno ausente em uma das linhas é tratado como possível duplicidade', async () => {
      const { resolveSigeReportRows, validateNoInternalDuplicates } = await import('../src/lib/sigeReportService');
      const resolved = resolveSigeReportRows(
        [rowNova({ turmaNome: '3º Ano C', turno: 'Matutino' }), rowNova({ turmaNome: '3º Ano C', turno: undefined })],
        []
      );
      expect(() => validateNoInternalDuplicates(resolved)).toThrow(/turno não foi informado em todas/);
    });

    it('nomes iguais com turnos realmente diferentes podem coexistir — nenhum erro', async () => {
      const { resolveSigeReportRows, validateNoInternalDuplicates } = await import('../src/lib/sigeReportService');
      const resolved = resolveSigeReportRows(
        [rowNova({ turmaNome: '3º Ano C', turno: 'Matutino' }), rowNova({ turmaNome: '3º Ano C', turno: 'Vespertino' })],
        []
      );
      expect(() => validateNoInternalDuplicates(resolved)).not.toThrow();
    });

    it('nenhuma escrita ocorre quando existir duplicidade dentro do relatório', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({
        rows: [rowNova({ turmaNome: '3º Ano C', turno: 'Matutino' }), rowNova({ turmaNome: '3º ano c', turno: 'matutino' })],
      });
      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/representam a mesma turma nova/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });
  });

  // Item 2 do code review do PR #18.
  describe('identidade canônica da turma', () => {
    it('nome digitado com caixa diferente grava o nome canônico da turma existente', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1', nome: '3º Ano A' })]);
      // turmaId já vem resolvido (é assim que a UI envia depois de um match
      // automático — ver toRowInput em SigeReportModal.tsx), mas turmaNome
      // ainda carrega o texto BRUTO digitado, com caixa diferente.
      const input = baseInput({ rows: [rowExisting({ turmaId: 't1', turmaNome: '3º ano a' })] });

      const result = await saveSigeReport(input, new Map());

      expect(result.rows[0].turmaNome).toBe('3º Ano A');
      expect(result.rows[0].monitoring.turmaNome).toBe('3º Ano A');
    });

    it('nome digitado sem acento grava o nome canônico da turma existente', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1', nome: '3º Ano Único' })]);
      const input = baseInput({ rows: [rowExisting({ turmaId: 't1', turmaNome: '3 ano unico' })] });

      const result = await saveSigeReport(input, new Map());

      expect(result.rows[0].monitoring.turmaNome).toBe('3º Ano Único');
    });

    it('escolha manual (turmaId) usa turma.nome, nunca o texto digitado', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't2', nome: '3º Ano A — Nome Real', turno: 'Vespertino' })]);
      const input = baseInput({
        rows: [rowExisting({ turmaId: 't2', turmaNome: 'texto qualquer digitado pelo usuário' })],
      });

      const result = await saveSigeReport(input, new Map());

      expect(result.rows[0].monitoring.turmaNome).toBe('3º Ano A — Nome Real');
    });

    it('ID que não pertence à lista revalidada é rejeitado', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({ rows: [rowExisting({ turmaId: 'id-inexistente' })] });

      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/não foi encontrada/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('turma nova usa o nome confirmado (texto digitado) — não há nome canônico anterior', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ turmaNome: 'Turma Recém-Criada' })] });

      const result = await saveSigeReport(input, new Map());

      expect(result.rows[0].monitoring.turmaNome).toBe('Turma Recém-Criada');
    });
  });

  describe('saveSigeReport', () => {
    it('linha inconsistente não pode ser confirmada — rejeitada antes de qualquer escrita no Firestore', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({
        rows: [rowExisting({ completedGradeEntries: 999, expectedGradeEntries: 100 })],
      });
      await expect(saveSigeReport(input, new Map())).rejects.toThrow();
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('falha de uma linha (ambígua) não produz salvamento parcial silencioso — nenhuma escrita acontece para as outras linhas válidas', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([
        turma({ id: 't1' }),
        turma({ id: 't2', nome: '3º Ano C', turno: 'Matutino' }),
        turma({ id: 't3', nome: '3º Ano C', turno: 'Vespertino' }),
      ]);
      const input = baseInput({
        rows: [rowExisting(), rowNova({ turno: undefined })],
      });
      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/correspondência ambígua/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('confirmação cria turma e acompanhamento — turma nova primeiro (fase 1), depois o acompanhamento (fase 2)', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova()] });

      const result = await saveSigeReport(input, new Map());

      expect(mockWriteBatch).toHaveBeenCalledTimes(2);
      expect(batchInstances).toHaveLength(2);
      const [turmaBatch, monitoringBatch] = batchInstances;

      // Fase 1: turma nova.
      expect(turmaBatch.set).toHaveBeenCalledTimes(1);
      const [, turmaPayload] = turmaBatch.set.mock.calls[0];
      expect(turmaPayload.nome).toBe('3º Ano C');
      expect(turmaPayload.schoolId).toBe('diva-cabral');
      expect(turmaBatch.commit).toHaveBeenCalledTimes(1);

      // Fase 2: grade_entry_monitoring, já com o turmaId real da turma criada.
      expect(monitoringBatch.set).toHaveBeenCalledTimes(1);
      const [, monitoringPayload] = monitoringBatch.set.mock.calls[0];
      expect(monitoringPayload.turmaId).toMatch(/^auto-turmas-/);
      expect(monitoringBatch.commit).toHaveBeenCalledTimes(1);

      expect(result.turmasCreated).toBe(1);
      expect(result.rows[0].wasTurmaCreated).toBe(true);
    });

    it('audit_log é criado tanto para a criação da turma quanto para o acompanhamento, cada um no batch certo', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova()] });
      await saveSigeReport(input, new Map());

      const [turmaBatch, monitoringBatch] = batchInstances;
      expect(mockQueueAuditLog).toHaveBeenCalledTimes(2);
      expect(mockQueueAuditLog).toHaveBeenCalledWith(turmaBatch, expect.objectContaining({ collectionName: 'turmas', operation: 'create' }));
      expect(mockQueueAuditLog).toHaveBeenCalledWith(monitoringBatch, expect.objectContaining({ collectionName: 'grade_entry_monitoring', operation: 'create' }));
    });

    it('turma existente não gera escrita na coleção turmas nem sua auditoria — só o acompanhamento', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({ rows: [rowExisting()] });

      await saveSigeReport(input, new Map());

      // Só UM writeBatch (fase 1 não roda quando não há turma nova).
      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      expect(mockQueueAuditLog).toHaveBeenCalledTimes(1);
      expect(mockQueueAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ collectionName: 'grade_entry_monitoring' }));
    });

    it('múltiplas turmas no mesmo relatório: mistura de turma existente e turma nova é tratada corretamente', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({ rows: [rowExisting(), rowNova()] });

      const result = await saveSigeReport(input, new Map());

      const [turmaBatch, monitoringBatch] = batchInstances;
      expect(turmaBatch.set).toHaveBeenCalledTimes(1); // só a turma nova
      expect(monitoringBatch.set).toHaveBeenCalledTimes(2); // as duas linhas
      expect(result.turmasCreated).toBe(1);
      expect(result.rows).toHaveLength(2);
    });

    it('atualização posterior (turma existente com acompanhamento já registrado) preserva createdAt/createdBy e registra operation update', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const existingMonitoring: GradeEntryMonitoring = {
        id: 'diva-cabral_2026_b1_t1', schoolId: 'diva-cabral', codInep: '23067918', escolaNome: 'EEM Diva Cabral',
        turmaId: 't1', turmaNome: '3º Ano A', anoLetivo: 2026, bimestre: 1,
        totalStudents: 30, studentsWithCompleteGrades: 20, studentsWithPartialGrades: 10, studentsWithoutGrades: 0,
        expectedGradeEntries: 120, completedGradeEntries: 80, status: 'rascunho', sourceSystem: 'SIGE Escola',
        referenceDate: '2026-02-10',
        createdAt: '2026-02-10T00:00:00.000Z', updatedAt: '2026-02-10T00:00:00.000Z',
        createdBy: 'super.antigo@example.com', updatedBy: 'super.antigo@example.com',
      };
      const input = baseInput({ rows: [rowExisting({ completedGradeEntries: 120 })] });

      const result = await saveSigeReport(input, new Map([['t1', existingMonitoring]]));

      expect(result.rows[0].monitoring.createdAt).toBe('2026-02-10T00:00:00.000Z');
      expect(result.rows[0].monitoring.createdBy).toBe('super.antigo@example.com');
      expect(mockQueueAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ operation: 'update', previousValue: expect.objectContaining({ action: 'update' }) })
      );
    });

    it('duplicidade por schoolId+anoLetivo+bimestre+turmaId é impedida — a mesma turma nunca gera dois documentos de acompanhamento', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({ rows: [rowExisting()] });
      await saveSigeReport(input, new Map());
      // Só um turmaId existente aqui: nenhuma turma nova, então só o
      // batch de grade_entry_monitoring é aberto (índice 0).
      const [monitoringBatch] = batchInstances;
      const [ref] = monitoringBatch.set.mock.calls[0];
      // ID determinístico — schoolId_anoLetivo_bBimestre_turmaId — garante
      // que uma segunda chamada para a MESMA turma/ano/bimestre sempre
      // sobrescreve o mesmo documento, nunca cria um segundo.
      expect(ref.id).toBe('diva-cabral_2026_b1_t1');
    });
  });

  // Item 5 do code review do PR #18.
  describe('preservação de metadados opcionais', () => {
    it('atualização com campos vazios (undefined) preserva os metadados existentes de cada acompanhamento', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const existingMonitoring: GradeEntryMonitoring = {
        id: 'diva-cabral_2026_b1_t1', schoolId: 'diva-cabral', codInep: '23067918', escolaNome: 'EEM Diva Cabral',
        turmaId: 't1', turmaNome: '3º Ano A', anoLetivo: 2026, bimestre: 1,
        totalStudents: 30, studentsWithCompleteGrades: 30, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
        expectedGradeEntries: 120, completedGradeEntries: 100, status: 'rascunho', sourceSystem: 'SIGE Escola',
        referenceDate: '2026-02-10', sourceReportTitle: 'Título antigo', sourceFileName: 'arquivo-antigo.csv',
        observation: 'Observação antiga',
        createdAt: '2026-02-10T00:00:00.000Z', updatedAt: '2026-02-10T00:00:00.000Z',
        createdBy: 'super.antigo@example.com', updatedBy: 'super.antigo@example.com',
      };
      // Relatório coletivo SEM título/arquivo/observação — undefined, nunca
      // deve apagar o que já existia.
      const input = baseInput({
        sourceReportTitle: undefined, sourceFileName: undefined, observation: undefined,
        rows: [rowExisting()],
      });

      const result = await saveSigeReport(input, new Map([['t1', existingMonitoring]]));

      expect(result.rows[0].monitoring.sourceReportTitle).toBe('Título antigo');
      expect(result.rows[0].monitoring.sourceFileName).toBe('arquivo-antigo.csv');
      expect(result.rows[0].monitoring.observation).toBe('Observação antiga');
    });

    it('string informada no relatório coletivo substitui os metadados de cada acompanhamento', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const existingMonitoring: GradeEntryMonitoring = {
        id: 'diva-cabral_2026_b1_t1', schoolId: 'diva-cabral', codInep: '23067918', escolaNome: 'EEM Diva Cabral',
        turmaId: 't1', turmaNome: '3º Ano A', anoLetivo: 2026, bimestre: 1,
        totalStudents: 30, studentsWithCompleteGrades: 30, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
        expectedGradeEntries: 120, completedGradeEntries: 100, status: 'rascunho', sourceSystem: 'SIGE Escola',
        referenceDate: '2026-02-10', sourceReportTitle: 'Título antigo',
        createdAt: '2026-02-10T00:00:00.000Z', updatedAt: '2026-02-10T00:00:00.000Z',
        createdBy: 'super.a@example.com', updatedBy: 'super.a@example.com',
      };
      const input = baseInput({ sourceReportTitle: 'Título novo', rows: [rowExisting()] });

      const result = await saveSigeReport(input, new Map([['t1', existingMonitoring]]));

      expect(result.rows[0].monitoring.sourceReportTitle).toBe('Título novo');
    });

    it('turma nova com metadados vazios simplesmente omite os campos (nunca grava undefined nem null)', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({
        sourceReportTitle: undefined, sourceFileName: undefined, observation: undefined,
        rows: [rowNova()],
      });

      const result = await saveSigeReport(input, new Map());

      expect('sourceReportTitle' in result.rows[0].monitoring).toBe(false);
      expect('sourceFileName' in result.rows[0].monitoring).toBe(false);
      expect('observation' in result.rows[0].monitoring).toBe(false);
    });
  });

  // Item 6 do code review do PR #18.
  describe('matrícula atual', () => {
    it('turma nova: matriculaInicial e matriculaAtual recebem o valor informado', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ matriculaAtual: 27 })] });

      await saveSigeReport(input, new Map());

      const [turmaBatch] = batchInstances;
      const [, turmaPayload] = turmaBatch.set.mock.calls[0];
      expect(turmaPayload.matriculaInicial).toBe(27);
      expect(turmaPayload.matriculaAtual).toBe(27);
    });

    it('turma existente: matriculaAtual informada no relatório é ignorada pelo serviço (nunca atualiza a turma existente)', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1', matriculaAtual: 30 })]);
      const input = baseInput({ rows: [rowExisting({ matriculaAtual: 999 })] });

      await saveSigeReport(input, new Map());

      // Nenhuma escrita na coleção turmas para uma turma já existente.
      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      const [monitoringBatch] = batchInstances;
      expect(monitoringBatch.set).toHaveBeenCalledTimes(1);
      // O único set() é o do grade_entry_monitoring — nunca um segundo
      // set() tentando atualizar turmas/t1.
      const [ref] = monitoringBatch.set.mock.calls[0];
      expect(ref.id).not.toContain('turmas');
    });

    it('matrícula atual inválida (texto/NaN) em turma nova bloqueia antes de qualquer escrita', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ matriculaAtual: NaN })] });

      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/Matrícula atual inválida/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('matrícula atual negativa em turma nova bloqueia antes de qualquer escrita', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ matriculaAtual: -5 })] });

      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/Matrícula atual inválida/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('matrícula atual decimal em turma nova bloqueia antes de qualquer escrita', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ matriculaAtual: 12.5 })] });

      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/Matrícula atual inválida/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('campo vazio (undefined) em turma nova usa zero como matrícula inicial — nunca bloqueia', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ matriculaAtual: undefined })] });

      await saveSigeReport(input, new Map());

      const [turmaBatch] = batchInstances;
      const [, turmaPayload] = turmaBatch.set.mock.calls[0];
      expect(turmaPayload.matriculaInicial).toBe(0);
    });
  });

  // Item 7 do code review do PR #18.
  describe('revalidação de concorrência', () => {
    it('busca as turmas da escola/ano direto do Firestore antes de resolver qualquer linha (nunca confia só na lista antiga da UI)', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({ rows: [rowExisting()] });

      await saveSigeReport(input, new Map());

      expect(mockGetDocs).toHaveBeenCalled();
    });

    it('turma criada por outro usuário depois da abertura do modal nunca é duplicada — a linha resolve para a turma real', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      // Simula: a UI tinha "3º Ano C" como não cadastrada quando o modal
      // abriu, mas por volta da confirmação outra pessoa já a criou —
      // setFreshTurmas representa o estado REAL no momento do save.
      setFreshTurmas([turma({ id: 't-criada-por-outro', nome: '3º Ano C', turno: 'Matutino' })]);
      const input = baseInput({ rows: [rowNova({ turmaNome: '3º Ano C', turno: 'Matutino' })] });

      await expect(saveSigeReport(input, new Map())).rejects.toThrow(/já está cadastrada/);
      // Nenhuma turma é criada — a tentativa de confirmar como "nova" uma
      // turma que já existe de verdade é bloqueada, nunca duplicada.
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('consultas de revalidação continuam escopadas por schoolId (nunca a coleção inteira)', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      setFreshTurmas([turma({ id: 't1' })]);
      const input = baseInput({ rows: [rowExisting()] });

      await saveSigeReport(input, new Map());

      const firestore = await import('firebase/firestore');
      expect(firestore.where).toHaveBeenCalledWith('schoolId', '==', 'diva-cabral');
      expect(firestore.where).toHaveBeenCalledWith('escolaId', '==', 'diva-cabral');
    });
  });

  // Item 3 do code review do PR #18.
  describe('recuperação após falha da fase 2 (SigeReportPartialSaveError)', () => {
    it('fase 1 passa e fase 2 falha: lança SigeReportPartialSaveError com as turmas já criadas', async () => {
      const { saveSigeReport, SigeReportPartialSaveError } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ turmaNome: 'Turma Nova Falha' })] });

      let callCount = 0;
      mockWriteBatch.mockImplementation(() => {
        callCount += 1;
        const set = vi.fn();
        // A fase 1 (primeiro writeBatch) comita normalmente; a fase 2
        // (segundo writeBatch) falha.
        const commit = callCount === 1 ? vi.fn().mockResolvedValue(undefined) : vi.fn().mockRejectedValue(new Error('permission-denied'));
        const instance = { set, commit };
        batchInstances.push(instance);
        return instance;
      });

      let caught: unknown;
      try {
        await saveSigeReport(input, new Map());
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(SigeReportPartialSaveError);
      const partialErr = caught as InstanceType<typeof SigeReportPartialSaveError>;
      expect(partialErr.createdTurmas).toHaveLength(1);
      expect(partialErr.createdTurmas[0].nome).toBe('Turma Nova Falha');
      expect(partialErr.createdTurmas[0].id).toMatch(/^auto-turmas-/);
      // A fase 1 realmente comitou — a turma existe de fato.
      expect(batchInstances[0].commit).toHaveBeenCalledTimes(1);
    });

    it('segunda tentativa (depois da turma já existir na revalidação) usa o ID real, nunca recria a turma', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      // Primeira tentativa: nenhuma turma existe ainda, fase 2 falha.
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova({ turmaNome: 'Turma Recuperável', turno: 'Matutino' })] });

      let callCount = 0;
      mockWriteBatch.mockImplementation(() => {
        callCount += 1;
        const set = vi.fn();
        const commit = callCount === 1 ? vi.fn().mockResolvedValue(undefined) : vi.fn().mockRejectedValue(new Error('unavailable'));
        const instance = { set, commit };
        batchInstances.push(instance);
        return instance;
      });

      let firstAttemptError: unknown;
      try {
        await saveSigeReport(input, new Map());
      } catch (err) {
        firstAttemptError = err;
      }
      expect(firstAttemptError).toBeDefined();
      const createdTurmaId = batchInstances[0].set.mock.calls[0][0].id as string;

      // Segunda tentativa: a revalidação (item 7) agora encontra a turma
      // já criada na primeira tentativa — nunca tenta recriá-la.
      batchInstances.length = 0;
      mockWriteBatch.mockClear();
      mockWriteBatch.mockImplementation(() => {
        const set = vi.fn();
        const commit = vi.fn().mockResolvedValue(undefined);
        const instance = { set, commit };
        batchInstances.push(instance);
        return instance;
      });
      setFreshTurmas([turma({ id: createdTurmaId, nome: 'Turma Recuperável', turno: 'Matutino' })]);

      // A UI real re-resolve a linha antes de reenviar (SigeReportRowEditor
      // recalcula o match a cada render usando o existingTurmas atualizado
      // — ver toRowInput em SigeReportModal.tsx): agora a turma é
      // encontrada automaticamente, então o retry chega com turmaId
      // preenchido e isNovaTurmaConfirmada false, nunca mais "nova".
      const retryInput = baseInput({
        rows: [rowExisting({ turmaId: createdTurmaId, turmaNome: 'Turma Recuperável', turno: 'Matutino' })],
      });
      const result = await saveSigeReport(retryInput, new Map());

      // Só UM batch agora (fase 2 apenas) — nenhuma turma nova criada.
      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      expect(result.turmasCreated).toBe(0);
      expect(result.rows[0].turmaId).toBe(createdTurmaId);
      expect(result.rows[0].wasTurmaCreated).toBe(false);
    });

    it('quando a fase 1 falha (nenhuma turma criada), o erro original é propagado — nunca SigeReportPartialSaveError', async () => {
      const { saveSigeReport, SigeReportPartialSaveError } = await import('../src/lib/sigeReportService');
      setFreshTurmas([]);
      const input = baseInput({ rows: [rowNova()] });

      mockWriteBatch.mockImplementation(() => {
        const set = vi.fn();
        const commit = vi.fn().mockRejectedValue(new Error('permission-denied'));
        const instance = { set, commit };
        batchInstances.push(instance);
        return instance;
      });

      let caught: unknown;
      try {
        await saveSigeReport(input, new Map());
      } catch (err) {
        caught = err;
      }
      expect(caught).not.toBeInstanceOf(SigeReportPartialSaveError);
      expect((caught as Error).message).toBe('permission-denied');
    });
  });
});
