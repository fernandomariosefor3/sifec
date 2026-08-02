// Correção funcional pós-PR #17 — testes de sigeReportService.ts:
// resolução pura das linhas (resolveSigeReportRows) e orquestração
// assíncrona (saveSigeReport) contra um Firestore mockado, mesmo padrão de
// tests/schoolFlowServiceFirestore.test.ts. queueAuditLog é mockado
// diretamente (seu próprio comportamento já é coberto por
// tests/auditService.test.ts) para verificar só QUE cada auditoria foi
// enfileirada no batch certo, sem duplicar a checagem de sanitização aqui.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Turma } from '../src/types/classroom';
import type { GradeEntryMonitoring } from '../src/types/gradeEntryMonitoring';

const {
  mockCollection, mockDoc, mockWriteBatch, mockQueueAuditLog, batchInstances,
} = vi.hoisted(() => {
  const batches: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> }[] = [];
  let autoIdCounter = 0;
  return {
    batchInstances: batches,
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
  getDocs: vi.fn(),
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
    nome: '3º Ano A', ano: '3º Ano', periodo: 'Matutino', schoolId: 'diva-cabral',
    ...overrides,
  };
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
    batchInstances.length = 0;
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('resolveSigeReportRows (núcleo puro)', () => {
    it('rejeita relatório sem nenhuma linha', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      expect(() => resolveSigeReportRows([], [])).toThrow('Adicione ao menos uma turma');
    });

    it('linha com turmaId existente resolve para a turma real (turma existente é associada)', async () => {
      const { resolveSigeReportRows } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const resolved = resolveSigeReportRows([rowExisting()], existentes);
      expect(resolved[0].turmaId).toBe('t1');
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
      expect(resolved[0].turmaId).toBe('');
    });
  });

  describe('saveSigeReport', () => {
    it('linha inconsistente não pode ser confirmada — rejeitada antes de qualquer escrita no Firestore', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const input = baseInput({
        rows: [rowExisting({ completedGradeEntries: 999, expectedGradeEntries: 100 })],
      });
      await expect(saveSigeReport(input, existentes, new Map())).rejects.toThrow();
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('falha de uma linha (ambígua) não produz salvamento parcial silencioso — nenhuma escrita acontece para as outras linhas válidas', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const existentes = [
        turma({ id: 't1' }),
        turma({ id: 't2', nome: '3º Ano C', turno: 'Matutino' }),
        turma({ id: 't3', nome: '3º Ano C', turno: 'Vespertino' }),
      ];
      const input = baseInput({
        rows: [rowExisting(), rowNova({ turno: undefined })],
      });
      await expect(saveSigeReport(input, existentes, new Map())).rejects.toThrow(/correspondência ambígua/);
      expect(mockWriteBatch).not.toHaveBeenCalled();
    });

    it('confirmação cria turma e acompanhamento — turma nova primeiro (fase 1), depois o acompanhamento (fase 2)', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const input = baseInput({ rows: [rowNova()] });

      const result = await saveSigeReport(input, [], new Map());

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
      const input = baseInput({ rows: [rowNova()] });
      await saveSigeReport(input, [], new Map());

      const [turmaBatch, monitoringBatch] = batchInstances;
      expect(mockQueueAuditLog).toHaveBeenCalledTimes(2);
      expect(mockQueueAuditLog).toHaveBeenCalledWith(turmaBatch, expect.objectContaining({ collectionName: 'turmas', operation: 'create' }));
      expect(mockQueueAuditLog).toHaveBeenCalledWith(monitoringBatch, expect.objectContaining({ collectionName: 'grade_entry_monitoring', operation: 'create' }));
    });

    it('turma existente não gera escrita na coleção turmas nem sua auditoria — só o acompanhamento', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const input = baseInput({ rows: [rowExisting()] });

      await saveSigeReport(input, existentes, new Map());

      // Só UM writeBatch (fase 1 não roda quando não há turma nova).
      expect(mockWriteBatch).toHaveBeenCalledTimes(1);
      expect(mockQueueAuditLog).toHaveBeenCalledTimes(1);
      expect(mockQueueAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ collectionName: 'grade_entry_monitoring' }));
    });

    it('múltiplas turmas no mesmo relatório: mistura de turma existente e turma nova é tratada corretamente', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const input = baseInput({ rows: [rowExisting(), rowNova()] });

      const result = await saveSigeReport(input, existentes, new Map());

      const [turmaBatch, monitoringBatch] = batchInstances;
      expect(turmaBatch.set).toHaveBeenCalledTimes(1); // só a turma nova
      expect(monitoringBatch.set).toHaveBeenCalledTimes(2); // as duas linhas
      expect(result.turmasCreated).toBe(1);
      expect(result.rows).toHaveLength(2);
    });

    it('atualização posterior (turma existente com acompanhamento já registrado) preserva createdAt/createdBy e registra operation update', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
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

      const result = await saveSigeReport(input, existentes, new Map([['t1', existingMonitoring]]));

      expect(result.rows[0].monitoring.createdAt).toBe('2026-02-10T00:00:00.000Z');
      expect(result.rows[0].monitoring.createdBy).toBe('super.antigo@example.com');
      expect(mockQueueAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ operation: 'update', previousValue: expect.objectContaining({ action: 'update' }) })
      );
    });

    it('duplicidade por schoolId+anoLetivo+bimestre+turmaId é impedida — a mesma turma nunca gera dois documentos de acompanhamento', async () => {
      const { saveSigeReport } = await import('../src/lib/sigeReportService');
      const existentes = [turma({ id: 't1' })];
      const input = baseInput({ rows: [rowExisting()] });
      await saveSigeReport(input, existentes, new Map());
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
});
