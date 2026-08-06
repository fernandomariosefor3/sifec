// Correção do code review do PR #19, seção 2 — prova, contra o Firebase
// Emulator (regras reais, SDK real, sem mocks de firebase/firestore), que
// saveFarolEstudanteItem (create/update) e archiveFarolEstudanteItem gravam
// farol_estudante + audit_logs atomicamente. Mesmo padrão de
// tests/schoolFlowAuditAtomicity.emulator.test.ts — aqui é o código real de
// src/lib/farolEstudanteService.ts e src/lib/auditService.ts rodando contra
// o emulador, só com src/lib/firebase.ts substituído (via vi.doMock) por um
// `db` apontando para o contexto autenticado do emulador em cada teste.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, doc, getDocs, query, setDoc, where, type DocumentData, type QuerySnapshot } from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const ACTIVE_A_EMAIL = 'super.farol.auditoria@example.com';
const ESCOLA_NOME = 'EEM Diva Cabral (Teste Auditoria Farol)';
const SCHOOL_ID = 'diva-cabral-farol-audit';
const COD_INEP = '00000701';
const ANO_LETIVO = 2026;
const TURMA_ID = 'turma-farol-audit';
const TURMA_NOME = 'Turma Farol - Teste Auditoria';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-farol-audit',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8090,
    },
  });
}, 30000);

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'superintendentes', ADMIN_EMAIL), {
      id: 'root', nome: 'Admin Raiz (Teste)', cargo: 'Superintendente de Regulação Seduc',
      email: ADMIN_EMAIL, escolas: [], ativo: true, role: 'admin',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_A_EMAIL), {
      id: 'super-farol-audit', nome: 'Superintendente Farol (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_A_EMAIL, escolas: [ESCOLA_NOME], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'schools', SCHOOL_ID), {
      nome: ESCOLA_NOME, codInep: COD_INEP, cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'turmas', TURMA_ID), {
      schoolId: SCHOOL_ID, escolaId: SCHOOL_ID, escolaNome: ESCOLA_NOME,
      nome: TURMA_NOME, ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
    });
  });
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../src/lib/firebase');
});

async function loadServiceWithDb(db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>['firestore']>) {
  vi.doMock('../src/lib/firebase', () => ({ db }));
  return import('../src/lib/farolEstudanteService');
}

function assertNoUndefinedDeep(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoUndefinedDeep(item, `${path}[${index}]`));
    return;
  }
  if (value != null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      expect(nested, `${path}.${key} não deveria ser undefined`).not.toBeUndefined();
      assertNoUndefinedDeep(nested, `${path}.${key}`);
    }
  }
}

function baseInput(actingUserEmail: string, overrides: Record<string, unknown> = {}) {
  return {
    schoolId: SCHOOL_ID,
    codInep: COD_INEP,
    escolaNome: ESCOLA_NOME,
    turmaId: TURMA_ID,
    turmaNome: TURMA_NOME,
    disciplina: 'Matemática',
    anoLetivo: ANO_LETIVO,
    bimestre: 1 as const,
    estudanteNome: 'Estudante Teste Atomicidade',
    percentualAcerto: 18,
    referenceDate: '2026-03-08',
    status: 'Identificado' as const,
    actingUserEmail,
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('saveFarolEstudanteItem — atomicidade contra o emulador (create)', () => {
  it('grava farol_estudante + audit_log (operação "create") juntos, sem nenhum undefined, sem nome do estudante no log', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveFarolEstudanteItem } = await loadServiceWithDb(db);

    const saved = await saveFarolEstudanteItem(baseInput(ACTIVE_A_EMAIL));

    const farolSnap = await getDocs(
      query(collection(db, 'farol_estudante'), where('schoolId', '==', SCHOOL_ID), where('anoLetivo', '==', ANO_LETIVO))
    );
    expect(farolSnap.empty).toBe(false);
    expect(farolSnap.docs[0].data().estudanteNome).toBe('Estudante Teste Atomicidade');
    expect(saved.statusRegistro).toBe('ativo');

    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    expect(auditSnap.empty).toBe(false);
    const auditData = auditSnap.docs[0].data();
    expect(auditData.collectionName).toBe('farol_estudante');
    expect(auditData.operation).toBe('create');
    const serialized = JSON.stringify(auditData);
    expect(serialized).not.toContain('Estudante Teste Atomicidade');
    expect(serialized).not.toContain('percentualAcerto');
    assertNoUndefinedDeep(auditData);
  });

  it('falha isolada na regra de audit_logs (userEmail divergente do autenticado) impede o commit inteiro — nem o registro nem o log ficam gravados', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveFarolEstudanteItem } = await loadServiceWithDb(db);

    await expect(
      saveFarolEstudanteItem(baseInput('nao-bate-com-autenticado@example.com'))
    ).rejects.toThrow();

    let farolSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      farolSnap = await getDocs(
        query(collection(context.firestore(), 'farol_estudante'), where('schoolId', '==', SCHOOL_ID), where('anoLetivo', '==', ANO_LETIVO))
      );
    });
    if (!farolSnap) throw new Error('farolSnap não foi carregado');
    expect(farolSnap.empty).toBe(true);

    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    expect(auditSnap.empty).toBe(true);
  });
});

describe('saveFarolEstudanteItem — atomicidade contra o emulador (update)', () => {
  it('grava a edição + audit_log (operação "update") juntos, com status anterior/novo, sem nome do estudante', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveFarolEstudanteItem } = await loadServiceWithDb(db);

    const created = await saveFarolEstudanteItem(baseInput(ACTIVE_A_EMAIL));
    const updated = await saveFarolEstudanteItem(
      baseInput(ACTIVE_A_EMAIL, { status: 'Em acompanhamento', now: '2026-03-15T00:00:00.000Z' }),
      created
    );
    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe('Em acompanhamento');

    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    expect(auditSnap.size).toBe(2); // create + update
    const updateLog = auditSnap.docs.map(d => d.data()).find(d => d.operation === 'update');
    expect(updateLog).toBeTruthy();
    expect((updateLog?.previousValue as { status: string }).status).toBe('Identificado');
    expect((updateLog?.newValue as { status: string }).status).toBe('Em acompanhamento');
    assertNoUndefinedDeep(updateLog);
  });
});

describe('archiveFarolEstudanteItem — atomicidade contra o emulador', () => {
  it('arquivamento grava statusRegistro + audit_log (operação "archive") juntos, sem nome do estudante nem percentual', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveFarolEstudanteItem, archiveFarolEstudanteItem } = await loadServiceWithDb(db);

    const created = await saveFarolEstudanteItem(baseInput(ACTIVE_A_EMAIL));
    const archived = await archiveFarolEstudanteItem(created, ACTIVE_A_EMAIL, '2026-03-20T00:00:00.000Z');
    expect(archived.statusRegistro).toBe('arquivado');

    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    const archiveLog = auditSnap.docs.map(d => d.data()).find(d => d.operation === 'archive');
    expect(archiveLog).toBeTruthy();
    const serialized = JSON.stringify(archiveLog);
    expect(serialized).not.toContain('Estudante Teste Atomicidade');
    expect(serialized).not.toContain('percentualAcerto');
    expect((archiveLog?.newValue as { statusRegistro: string }).statusRegistro).toBe('arquivado');
    assertNoUndefinedDeep(archiveLog);
  });
});
