// Fase 2B — testes das regras de school_flow_results, usando o Firebase
// Emulator (100% local, mesmo padrão de tests/schoolYearRules.test.ts).
// Nenhum nome ou dado real de estudante é usado — tudo aqui é sintético, só
// para este teste. Só dados agregados (aprovados/reprovados/abandono).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const ACTIVE_A_EMAIL = 'super.a@example.com'; // vinculado só à Escola A
const ACTIVE_B_EMAIL = 'super.b@example.com'; // vinculado só à Escola B
const INACTIVE_EMAIL = 'super.inativo@example.com';
const STRANGER_EMAIL = 'estranho@example.com';

const ESCOLA_A = 'Escola A - Teste Fase 2B';
const ESCOLA_B = 'Escola B - Teste Fase 2B';
const SCHOOL_A_ID = 'escola-a-2b';
const SCHOOL_B_ID = 'escola-b-2b';

let testEnv: RulesTestEnvironment;

// Timeout explícito de 30s (padrão do Vitest é 10s) — mesmo ajuste de
// tests/gradeEntryMonitoringRules.test.ts: com mais arquivos de regras
// conectando ao MESMO emulador local dentro de `npm run test:rules`,
// initializeTestEnvironment pode passar dos 10s default sob a carga
// acumulada, mesmo a suíte inteira terminando bem dentro de 30s.
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-fase2b',
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
      id: 'super-a', nome: 'Superintendente A (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_A_EMAIL, escolas: [ESCOLA_A], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_B_EMAIL), {
      id: 'super-b', nome: 'Superintendente B (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_B_EMAIL, escolas: [ESCOLA_B], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', INACTIVE_EMAIL), {
      id: 'super-inativo', nome: 'Superintendente Inativo (Teste)', cargo: 'Superintendente Regional',
      email: INACTIVE_EMAIL, escolas: [ESCOLA_A], ativo: false, role: 'superintendent',
    });

    await setDoc(doc(db, 'schools', SCHOOL_A_ID), {
      nome: ESCOLA_A, codInep: '00000201', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'schools', SCHOOL_B_ID), {
      nome: ESCOLA_B, codInep: '00000202', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
  });
});

function ctxFor(email: string | null) {
  return email
    ? testEnv.authenticatedContext(email, { email })
    : testEnv.unauthenticatedContext();
}

function flowResultPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `${SCHOOL_A_ID}_2025`,
    schoolId: SCHOOL_A_ID,
    codInep: '00000201',
    escolaNome: ESCOLA_A,
    anoLetivo: 2025,
    aprovados: 700,
    reprovados: 80,
    abandono: 20,
    status: 'confirmado',
    createdAt: '2025-12-15T00:00:00.000Z',
    updatedAt: '2025-12-15T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function flowResultQuery(
  db: ReturnType<ReturnType<typeof ctxFor>['firestore']>,
  schoolId: string,
  anoLetivo: number
) {
  return query(
    collection(db, 'school_flow_results'),
    where('schoolId', '==', schoolId),
    where('anoLetivo', '==', anoLetivo)
  );
}

describe('Fase 2B — school_flow_results', () => {
  it('A. administrador consulta escola sem documento e recebe vazio', async () => {
    const db = ctxFor(ADMIN_EMAIL).firestore();
    const snap = await assertSucceeds(getDocs(flowResultQuery(db, SCHOOL_A_ID, 2025)));
    expect(snap.empty).toBe(true);
  });

  it('B. superintendente consulta sua escola sem documento e recebe vazio', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const snap = await assertSucceeds(getDocs(flowResultQuery(db, SCHOOL_A_ID, 2025)));
    expect(snap.empty).toBe(true);
  });

  it('C. outra escola é bloqueada', async () => {
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(getDocs(flowResultQuery(db, SCHOOL_A_ID, 2025)));
  });

  it('D. usuário inativo é bloqueado', async () => {
    const db = ctxFor(INACTIVE_EMAIL).firestore();
    await assertFails(getDocs(flowResultQuery(db, SCHOOL_A_ID, 2025)));
  });

  it('E. usuário não cadastrado é bloqueado', async () => {
    const db = ctxFor(STRANGER_EMAIL).firestore();
    await assertFails(getDocs(flowResultQuery(db, SCHOOL_A_ID, 2025)));
  });

  it('F. criação válida é permitida', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload()));
  });

  it('G. criação com schoolId de outra escola é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'school_flow_results', `${SCHOOL_B_ID}_2025`),
        flowResultPayload({ id: `${SCHOOL_B_ID}_2025`, schoolId: SCHOOL_B_ID, escolaNome: ESCOLA_A })
      )
    );
  });

  it('H. criação com INEP incorreto é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload({ codInep: '99999999' }))
    );
  });

  it('I. ID divergente é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload({ anoLetivo: 2026 }))
    );
  });

  it('J. campo inesperado é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload({ nomeAluno: 'Não deveria existir' }))
    );
  });

  it('confirmado com total zero é bloqueado (validação de shape do lado das regras)', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`),
        flowResultPayload({ aprovados: 0, reprovados: 0, abandono: 0, status: 'confirmado' })
      )
    );
  });

  it('rascunho com total zero é permitido', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`),
        flowResultPayload({ aprovados: 0, reprovados: 0, abandono: 0, status: 'rascunho' })
      )
    );
  });

  it('K. atualização legítima é permitida', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(
        doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`),
        flowResultPayload({ aprovados: 705, reprovados: 75, updatedAt: '2026-01-05T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL })
      )
    );
  });

  it('L. troca de escola é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(
        doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`),
        flowResultPayload({ schoolId: SCHOOL_B_ID, codInep: '00000202', escolaNome: ESCOLA_B })
      )
    );
  });

  it('M. troca de ano é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload({ anoLetivo: 2026 }))
    );
  });

  it('N. alteração de createdBy/createdAt é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload({ createdAt: '2020-01-01T00:00:00.000Z' }))
    );
    await assertFails(
      updateDoc(doc(db, 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload({ createdBy: 'outro@example.com' }))
    );
  });

  it('O. exclusão comum é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`)));
  });

  it('P. administrador raiz pode excluir', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`), flowResultPayload());
    });
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'school_flow_results', `${SCHOOL_A_ID}_2025`)));
  });

  it('Q. consulta global sem filtro é bloqueada para superintendente comum', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(getDocs(collection(db, 'school_flow_results')));
  });
});
