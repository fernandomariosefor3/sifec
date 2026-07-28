// Fase 2B — hotfix: prova, contra o Firebase Emulator (regras reais, SDK
// real, sem mocks de firebase/firestore), que saveSchoolFlowResult grava
// school_flow_results + audit_logs atomicamente. Diferente de
// tests/schoolFlowRules.test.ts (que testa firestore.rules diretamente com
// setDoc/getDocs cru) e de tests/schoolFlowServiceFirestore.test.ts (que
// mocka o SDK inteiro) — aqui é o código real de src/lib/schoolFlowService.ts
// e src/lib/auditService.ts rodando contra o emulador, só com
// src/lib/firebase.ts substituído (via vi.doMock) por um `db` apontando
// para o contexto autenticado do emulador em cada teste.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, doc, getDocs, query, setDoc, where, type DocumentData, type QuerySnapshot } from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const ACTIVE_A_EMAIL = 'super.auditoria@example.com';
const ESCOLA_NOME = 'EEM Diva Cabral (Teste Auditoria)';
const SCHOOL_ID = 'diva-cabral-2b-audit';
const COD_INEP = '00000301';
const ANO_LETIVO = 2025;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-fase2b-audit',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8090,
    },
  });
});

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
      id: 'super-auditoria', nome: 'Superintendente Auditoria (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_A_EMAIL, escolas: [ESCOLA_NOME], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'schools', SCHOOL_ID), {
      nome: ESCOLA_NOME, codInep: COD_INEP, cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
  });
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../src/lib/firebase');
});

async function loadServiceWithDb(db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>['firestore']>) {
  vi.doMock('../src/lib/firebase', () => ({ db }));
  return import('../src/lib/schoolFlowService');
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

describe('saveSchoolFlowResult — atomicidade contra o emulador (hotfix auditoria)', () => {
  it('admin raiz, EEM Diva Cabral, 2025, aprovados 220/reprovados 50/abandono 3, rascunho, sem importBatchId: grava resultado + auditoria juntos, sem nenhum undefined', async () => {
    const db = testEnv.authenticatedContext(ADMIN_EMAIL, { email: ADMIN_EMAIL }).firestore();
    const { saveSchoolFlowResult } = await loadServiceWithDb(db);

    const result = await saveSchoolFlowResult({
      schoolId: SCHOOL_ID,
      codInep: COD_INEP,
      escolaNome: ESCOLA_NOME,
      anoLetivo: ANO_LETIVO,
      aprovados: 220,
      reprovados: 50,
      abandono: 3,
      status: 'rascunho',
      actingUserEmail: ADMIN_EMAIL,
      now: '2025-12-20T10:00:00.000Z',
    });

    expect(result.id).toBe(`${SCHOOL_ID}_${ANO_LETIVO}`);

    // 1. school_flow_results foi gravado.
    const flowSnap = await getDocs(
      query(collection(db, 'school_flow_results'), where('schoolId', '==', SCHOOL_ID), where('anoLetivo', '==', ANO_LETIVO))
    );
    expect(flowSnap.empty).toBe(false);
    expect(flowSnap.docs[0].data().aprovados).toBe(220);

    // 2/3/4. audit_logs foi gravado, sem importBatchId, sem nenhum undefined
    // em qualquer profundidade.
    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    expect(auditSnap.empty).toBe(false);
    const auditData = auditSnap.docs[0].data();
    expect('importBatchId' in auditData).toBe(false);
    expect(auditData.collectionName).toBe('school_flow_results');
    expect(auditData.newValue).toEqual({ anoLetivo: ANO_LETIVO, aprovados: 220, reprovados: 50, abandono: 3, status: 'rascunho' });
    assertNoUndefinedDeep(auditData);
  });

  it('falha isolada na regra de audit_logs (userEmail divergente do autenticado) impede o commit inteiro — o resultado do fluxo NÃO fica gravado isoladamente', async () => {
    // ACTIVE_A_EMAIL está vinculado à escola e SOZINHO teria permissão de
    // gravar school_flow_results normalmente — a única coisa que quebra é
    // enviar um actingUserEmail que diverge do e-mail autenticado, o que só
    // a regra de audit_logs verifica (incoming().userEmail.lower() ==
    // myEmail()). Isso isola a falha na escrita de auditoria, provando que
    // ela por si só derruba o batch inteiro.
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveSchoolFlowResult } = await loadServiceWithDb(db);

    await expect(
      saveSchoolFlowResult({
        schoolId: SCHOOL_ID,
        codInep: COD_INEP,
        escolaNome: ESCOLA_NOME,
        anoLetivo: ANO_LETIVO,
        aprovados: 220,
        reprovados: 50,
        abandono: 3,
        status: 'rascunho',
        actingUserEmail: 'nao-bate-com-autenticado@example.com',
        now: '2025-12-20T10:00:00.000Z',
      })
    ).rejects.toThrow();

    let flowSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      flowSnap = await getDocs(
        query(
          collection(context.firestore(), 'school_flow_results'),
          where('schoolId', '==', SCHOOL_ID),
          where('anoLetivo', '==', ANO_LETIVO)
        )
      );
    });
    if (!flowSnap) throw new Error('flowSnap não foi carregado');
    expect(flowSnap.empty).toBe(true);

    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    expect(auditSnap.empty).toBe(true);
  });
});
