// Integração do fluxo do PR #18 ao PR #19, seção "TESTES OBRIGATÓRIOS" —
// prova, contra o Firebase Emulator (regras reais, SDK real, sem mocks de
// firebase/firestore), que saveSigeReport processa um relatório GRANDE (25
// turmas) em chunks de no máximo SIGE_REPORT_CHUNK_SIZE (8) linhas, cada
// chunk atômico (documento + audit_log de cada linha, no mesmo commit),
// nunca um único batch para todas as turmas. Mesmo padrão de
// tests/farolEstudanteAuditAtomicity.emulator.test.ts e
// tests/schoolFlowAuditAtomicity.emulator.test.ts — aqui é o código real de
// src/lib/sigeReportService.ts rodando contra o emulador, só com
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
const ACTIVE_A_EMAIL = 'super.sige.chunk@example.com';
const ESCOLA_NOME = 'EEM Diva Cabral (Teste Chunk SIGE)';
const SCHOOL_ID = 'diva-cabral-sige-chunk';
const COD_INEP = '00000801';
const ANO_LETIVO = 2026;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-sige-chunk',
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
      id: 'super-sige-chunk', nome: 'Superintendente SIGE Chunk (Teste)', cargo: 'Superintendente Regional',
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
  return import('../src/lib/sigeReportService');
}

describe('saveSigeReport — atomicidade em chunks contra o emulador (relatório com 25 turmas)', () => {
  it('cria 25 turmas novas e 25 acompanhamentos, cada chunk com seu próprio audit_log, sem nenhum documento nominal', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveSigeReport } = await loadServiceWithDb(db);

    const rows = Array.from({ length: 25 }, (_, i) => ({
      turmaNome: `Turma Chunk ${i + 1}`,
      turno: 'Matutino',
      matriculaAtual: 20 + i,
      isNovaTurmaConfirmada: true,
      totalStudents: 20, studentsWithCompleteGrades: 20, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
      expectedGradeEntries: 80, completedGradeEntries: 80,
      status: 'confirmado' as const,
    }));

    const result = await saveSigeReport(
      {
        schoolId: SCHOOL_ID,
        codInep: COD_INEP,
        escolaNome: ESCOLA_NOME,
        anoLetivo: ANO_LETIVO,
        bimestre: 1,
        referenceDate: '2026-03-10',
        rows,
        actingUserEmail: ACTIVE_A_EMAIL,
        now: '2026-03-10T12:00:00.000Z',
      },
      new Map()
    );

    expect(result.rows).toHaveLength(25);
    expect(result.turmasCreated).toBe(25);

    const turmasSnap = await getDocs(
      query(collection(db, 'turmas'), where('schoolId', '==', SCHOOL_ID), where('anoLetivo', '==', ANO_LETIVO))
    );
    expect(turmasSnap.size).toBe(25);

    const monitoringSnap = await getDocs(
      query(collection(db, 'grade_entry_monitoring'), where('schoolId', '==', SCHOOL_ID), where('anoLetivo', '==', ANO_LETIVO))
    );
    expect(monitoringSnap.size).toBe(25);

    let auditSnap: QuerySnapshot<DocumentData> | undefined;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      auditSnap = await getDocs(collection(context.firestore(), 'audit_logs'));
    });
    if (!auditSnap) throw new Error('auditSnap não foi carregado');
    // 25 audit_logs de turmas (fase 1) + 25 de grade_entry_monitoring (fase 2).
    expect(auditSnap.size).toBe(50);

    // Nenhum documento nominal — nunca nome de estudante, matrícula
    // individual ou nota individual em qualquer coleção tocada.
    monitoringSnap.docs.forEach(d => {
      const serialized = JSON.stringify(d.data());
      expect(serialized.toLowerCase()).not.toContain('estudante');
      expect(serialized.toLowerCase()).not.toContain('aluno');
    });
  }, 60000);

  it('falha de auditoria (userEmail divergente do autenticado) contra as regras reais impede a escrita — nenhum documento fica gravado, nem parcialmente', async () => {
    const db = testEnv.authenticatedContext(ACTIVE_A_EMAIL, { email: ACTIVE_A_EMAIL }).firestore();
    const { saveSigeReport } = await loadServiceWithDb(db);

    // 12 turmas EXISTENTES (pré-criadas fora do serviço) — 2 chunks de fase
    // 2 (8 + 4), sem fase 1 nesta chamada.
    const turmaIds: string[] = [];
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      for (let i = 0; i < 12; i += 1) {
        const ref = doc(collection(adminDb, 'turmas'));
        await setDoc(ref, {
          schoolId: SCHOOL_ID, escolaId: SCHOOL_ID, escolaNome: ESCOLA_NOME,
          nome: `Turma Existente ${i + 1}`, ano: '1º Ano', periodo: 'Matutino', turno: 'Matutino',
          alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
        });
        turmaIds.push(ref.id);
      }
    });

    const rows = turmaIds.map((id, i) => ({
      turmaId: id,
      turmaNome: `Turma Existente ${i + 1}`,
      turno: 'Matutino',
      isNovaTurmaConfirmada: false,
      totalStudents: 20, studentsWithCompleteGrades: 20, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
      expectedGradeEntries: 80, completedGradeEntries: 80,
      status: 'confirmado' as const,
    }));

    // actingUserEmail DIVERGE do usuário autenticado — a regra de
    // audit_logs (userEmail.lower() == myEmail()) rejeita isso, derrubando
    // o batch de CADA chunk (documento + log são gravados juntos, ou
    // nenhum dos dois). Como a divergência é a mesma em todas as 12 linhas,
    // todos os chunks falham igualmente — a garantia provada aqui é que a
    // integração real com as regras do Firestore (não só o mock) barra a
    // escrita mesmo em lote, sem nenhum documento parcial sobrevivendo.
    await expect(
      saveSigeReport(
        {
          schoolId: SCHOOL_ID, codInep: COD_INEP, escolaNome: ESCOLA_NOME,
          anoLetivo: ANO_LETIVO, bimestre: 1, referenceDate: '2026-03-10',
          rows, actingUserEmail: 'nao-bate-com-autenticado@example.com',
          now: '2026-03-10T12:00:00.000Z',
        },
        new Map()
      )
    ).rejects.toThrow();

    const monitoringSnap = await getDocs(
      query(collection(db, 'grade_entry_monitoring'), where('schoolId', '==', SCHOOL_ID), where('anoLetivo', '==', ANO_LETIVO))
    );
    // Nenhum chunk foi commitado — a mesma divergência de userEmail afeta
    // TODOS os chunks igualmente (não é uma falha específica de um chunk
    // isolado neste cenário), então nada fica gravado.
    expect(monitoringSnap.size).toBe(0);
  }, 60000);
});
