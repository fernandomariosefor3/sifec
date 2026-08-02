// Fase 2C.1 — testes das regras de grade_entry_monitoring (acompanhamento
// agregado, substitui o protótipo nominal de student_rosters/
// student_bimester_grades) e do bloqueio dessas duas coleções antigas,
// usando o Firebase Emulator (100% local, mesmo padrão de
// tests/schoolFlowRules.test.ts). `grades` (legado ainda mais antigo)
// continua coberto por tests/firestore.rules.test.ts — não duplicado aqui.
// Nenhum nome real de estudante é usado — tudo aqui é sintético, e
// grade_entry_monitoring nunca tem campo de nome de estudante mesmo assim.
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
const ACTIVE_A_EMAIL = 'super.a.2c1@example.com'; // vinculado só à Escola A
const ACTIVE_B_EMAIL = 'super.b.2c1@example.com'; // vinculado só à Escola B
const INACTIVE_EMAIL = 'super.inativo.2c1@example.com';
const STRANGER_EMAIL = 'estranho.2c1@example.com';

const ESCOLA_A = 'Escola A - Teste Fase 2C.1';
const ESCOLA_B = 'Escola B - Teste Fase 2C.1';
const SCHOOL_A_ID = 'escola-a-2c1';
const SCHOOL_B_ID = 'escola-b-2c1';
const TURMA_A_ID = 'turma-a-2c1';
const TURMA_B_ID = 'turma-b-2c1';
const TURMA_ANO_ANTERIOR_ID = 'turma-a-ano-anterior-2c1';
const TURMA_SEM_ANO_ID = 'turma-a-sem-ano-2c1';
const ANO_LETIVO = 2026;
const MONITORING_ID = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}`;

let testEnv: RulesTestEnvironment;

// Timeout explícito de 30s (padrão do Vitest é 10s): este é o 5º arquivo de
// regras conectado ao MESMO emulador local dentro de `npm run test:rules`
// (depois de firestore.rules/schoolYearRules/schoolFlowRules/
// schoolFlowAuditAtomicity, com centenas de testes já executados) —
// initializeTestEnvironment ocasionalmente passa dos 10s default sob essa
// carga acumulada, mesmo a suíte inteira sempre terminando bem dentro de
// 30s quando este arquivo roda sozinho.
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-fase2c1',
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
      id: 'super-a-2c1', nome: 'Superintendente A (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_A_EMAIL, escolas: [ESCOLA_A], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_B_EMAIL), {
      id: 'super-b-2c1', nome: 'Superintendente B (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_B_EMAIL, escolas: [ESCOLA_B], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', INACTIVE_EMAIL), {
      id: 'super-inativo-2c1', nome: 'Superintendente Inativo (Teste)', cargo: 'Superintendente Regional',
      email: INACTIVE_EMAIL, escolas: [ESCOLA_A], ativo: false, role: 'superintendent',
    });

    await setDoc(doc(db, 'schools', SCHOOL_A_ID), {
      nome: ESCOLA_A, codInep: '00000501', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'schools', SCHOOL_B_ID), {
      nome: ESCOLA_B, codInep: '00000502', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });

    await setDoc(doc(db, 'turmas', TURMA_A_ID), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Teste', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
    });
    await setDoc(doc(db, 'turmas', TURMA_B_ID), {
      schoolId: SCHOOL_B_ID, escolaId: SCHOOL_B_ID, escolaNome: ESCOLA_B,
      nome: 'Turma B - Teste', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
    });
    // Turma da MESMA escola, mas de um ano letivo anterior — usada para
    // confirmar que um acompanhamento do ano corrente nunca pode apontar
    // para ela (mesmo cuidado já aplicado a student_rosters na Fase 2C).
    await setDoc(doc(db, 'turmas', TURMA_ANO_ANTERIOR_ID), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Ano Anterior', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO - 1,
    });
    // Turma legada da MESMA escola, ainda sem `anoLetivo` — nunca pode ser
    // usada silenciosamente pelo módulo de notas.
    await setDoc(doc(db, 'turmas', TURMA_SEM_ANO_ID), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Sem Ano Letivo', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
    });

    // Documentos legados de student_rosters/student_bimester_grades — nunca
    // alterados por este teste, só usados para confirmar que a leitura fica
    // restrita ao admin raiz e nenhuma escrita é possível.
    await setDoc(doc(db, 'student_rosters', 'roster-legado-1'), {
      id: 'roster-legado-1', studentKey: 'legado-1', schoolId: SCHOOL_A_ID, codInep: '00000501',
      escolaNome: ESCOLA_A, turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste', anoLetivo: ANO_LETIVO,
      studentName: 'Estudante Legado', active: true,
      createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
    });
    await setDoc(doc(db, 'student_bimester_grades', 'grade-legado-1'), {
      id: 'grade-legado-1', rosterId: 'roster-legado-1', studentKey: 'legado-1', schoolId: SCHOOL_A_ID,
      codInep: '00000501', escolaNome: ESCOLA_A, turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste',
      anoLetivo: ANO_LETIVO, bimestre: 1, scores: { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 },
      createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
    });
  });
});

function ctxFor(email: string | null) {
  return email
    ? testEnv.authenticatedContext(email, { email })
    : testEnv.unauthenticatedContext();
}

function monitoringPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: MONITORING_ID,
    schoolId: SCHOOL_A_ID,
    codInep: '00000501',
    escolaNome: ESCOLA_A,
    turmaId: TURMA_A_ID,
    turmaNome: 'Turma A - Teste',
    anoLetivo: ANO_LETIVO,
    bimestre: 1,
    totalStudents: 30,
    studentsWithCompleteGrades: 30,
    studentsWithPartialGrades: 0,
    studentsWithoutGrades: 0,
    expectedGradeEntries: 120,
    completedGradeEntries: 120,
    status: 'confirmado',
    sourceSystem: 'SIGE Escola',
    referenceDate: '2026-03-10',
    createdAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-03-10T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function monitoringQuery(db: ReturnType<ReturnType<typeof ctxFor>['firestore']>, schoolId: string, anoLetivo: number) {
  return query(
    collection(db, 'grade_entry_monitoring'),
    where('schoolId', '==', schoolId),
    where('anoLetivo', '==', anoLetivo)
  );
}

describe('Fase 2C.1 — student_rosters/student_bimester_grades (protótipo nominal descontinuado, fechado)', () => {
  it('leitura restrita ao admin raiz; bloqueada para todos os demais, inclusive quem antes tinha acesso', async () => {
    await assertFails(getDocs(collection(ctxFor(ACTIVE_A_EMAIL).firestore(), 'student_rosters')));
    await assertFails(getDocs(collection(ctxFor(STRANGER_EMAIL).firestore(), 'student_rosters')));
    await assertFails(getDocs(collection(ctxFor(null).firestore(), 'student_rosters')));
    const snap = await assertSucceeds(getDocs(collection(ctxFor(ADMIN_EMAIL).firestore(), 'student_rosters')));
    expect(snap.empty).toBe(false);
  });

  it('mesma restrição de leitura para student_bimester_grades', async () => {
    await assertFails(getDocs(collection(ctxFor(ACTIVE_A_EMAIL).firestore(), 'student_bimester_grades')));
    await assertSucceeds(getDocs(collection(ctxFor(ADMIN_EMAIL).firestore(), 'student_bimester_grades')));
  });

  it('criação é bloqueada em student_rosters para todos, inclusive admin raiz', async () => {
    const payload = {
      id: 'roster-novo', studentKey: 'novo', schoolId: SCHOOL_A_ID, codInep: '00000501',
      escolaNome: ESCOLA_A, turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste', anoLetivo: ANO_LETIVO,
      studentName: 'Estudante Novo', active: true,
      createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
    };
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'student_rosters', 'roster-novo'), payload));
    await assertFails(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_rosters', 'roster-novo'), payload));
  });

  it('atualização e exclusão são bloqueadas em student_rosters, inclusive para admin raiz', async () => {
    await assertFails(updateDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_rosters', 'roster-legado-1'), { active: false }));
    await assertFails(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_rosters', 'roster-legado-1')));
  });

  it('criação, atualização e exclusão são bloqueadas em student_bimester_grades, inclusive para admin raiz', async () => {
    const payload = {
      id: 'grade-novo', rosterId: 'roster-legado-1', studentKey: 'legado-1', schoolId: SCHOOL_A_ID,
      codInep: '00000501', escolaNome: ESCOLA_A, turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste',
      anoLetivo: ANO_LETIVO, bimestre: 2, scores: { linguaPortuguesa: null, matematica: null, cienciasNatureza: null, cienciasHumanas: null },
      createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
    };
    await assertFails(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_bimester_grades', 'grade-novo'), payload));
    await assertFails(updateDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_bimester_grades', 'grade-legado-1'), { scores: payload.scores }));
    await assertFails(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_bimester_grades', 'grade-legado-1')));
  });

  it('nenhum documento legado foi apagado por esta correção — continua acessível ao admin raiz', async () => {
    const rosterSnap = await assertSucceeds(getDocs(collection(ctxFor(ADMIN_EMAIL).firestore(), 'student_rosters')));
    const gradeSnap = await assertSucceeds(getDocs(collection(ctxFor(ADMIN_EMAIL).firestore(), 'student_bimester_grades')));
    expect(rosterSnap.docs.map(d => d.id)).toContain('roster-legado-1');
    expect(gradeSnap.docs.map(d => d.id)).toContain('grade-legado-1');
  });
});

describe('Fase 2C.1 — grade_entry_monitoring', () => {
  it('administrador consulta escola sem documento e recebe vazio', async () => {
    const db = ctxFor(ADMIN_EMAIL).firestore();
    const snap = await assertSucceeds(getDocs(monitoringQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
    expect(snap.empty).toBe(true);
  });

  it('superintendente consulta sua escola', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const snap = await assertSucceeds(getDocs(monitoringQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
    expect(snap.empty).toBe(true);
  });

  it('outra escola é bloqueada', async () => {
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(getDocs(monitoringQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('usuário inativo é bloqueado', async () => {
    const db = ctxFor(INACTIVE_EMAIL).firestore();
    await assertFails(getDocs(monitoringQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('usuário não cadastrado é bloqueado', async () => {
    const db = ctxFor(STRANGER_EMAIL).firestore();
    await assertFails(getDocs(monitoringQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('consulta sem filtro de schoolId é bloqueada para superintendente comum', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(getDocs(collection(db, 'grade_entry_monitoring')));
  });

  // monitoringPayload() usa turmaNome: 'Turma A - Teste', o nome EXATO
  // cadastrado em `turmas` para TURMA_A_ID (linha do beforeEach) — este
  // teste já cobre "criação com turmaNome canônico permitida" (revisão do
  // code review do PR #17, seção 3), além da autorização básica.
  it('acompanhamento válido é permitido', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload()));
  });

  // Revisão do code review do PR #17, seção 3:
  // isCanonicalTurmaOfSchoolYearAndName precisa bloquear a criação quando
  // turmaId/schoolId/anoLetivo estão corretos mas turmaNome diverge do nome
  // real cadastrado em `turmas` — antes só schoolId/anoLetivo eram
  // verificados, e um turmaNome adulterado passava despercebido.
  it('turmaId correto com turmaNome adulterado é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ turmaNome: 'Turma Inventada' }))
    );
  });

  // Comparação por igualdade estrita de string (turma.get('nome', '') ==
  // turmaNome): diferença de caixa ou espaço não pode ser tolerada
  // silenciosamente — mesmo padrão de rigor de isCanonicalSchoolMatch para
  // codInep/escolaNome.
  it('diferença de caixa no turmaNome não é aceita silenciosamente', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ turmaNome: 'turma a - teste' }))
    );
  });

  it('diferença de espaço no turmaNome não é aceita silenciosamente', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ turmaNome: 'Turma A - Teste ' }))
    );
  });

  it('escola incorreta (schoolId de outra escola) é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_B_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}`;
    await assertFails(
      setDoc(doc(db, 'grade_entry_monitoring', badId), monitoringPayload({ id: badId, schoolId: SCHOOL_B_ID, escolaNome: ESCOLA_A }))
    );
  });

  it('turma de outra escola é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_B_ID}`;
    await assertFails(
      setDoc(doc(db, 'grade_entry_monitoring', badId), monitoringPayload({ id: badId, turmaId: TURMA_B_ID, turmaNome: 'Turma B - Teste' }))
    );
  });

  it('acompanhamento do ano corrente com turma de ano letivo anterior é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_ANO_ANTERIOR_ID}`;
    await assertFails(
      setDoc(
        doc(db, 'grade_entry_monitoring', badId),
        monitoringPayload({ id: badId, turmaId: TURMA_ANO_ANTERIOR_ID, turmaNome: 'Turma A - Ano Anterior' })
      )
    );
  });

  it('turma sem anoLetivo cadastrado nunca é aceita silenciosamente', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_SEM_ANO_ID}`;
    await assertFails(
      setDoc(
        doc(db, 'grade_entry_monitoring', badId),
        monitoringPayload({ id: badId, turmaId: TURMA_SEM_ANO_ID, turmaNome: 'Turma A - Sem Ano Letivo' })
      )
    );
  });

  it('ID divergente dos campos internos é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ bimestre: 2 })));
  });

  it('campo pessoal/nominal (ex.: nome de estudante) é bloqueado — shape estrito', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ studentName: 'Não deveria existir' })));
  });

  it('completedGradeEntries maior que expectedGradeEntries é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ completedGradeEntries: 130, expectedGradeEntries: 120 }))
    );
  });

  it('soma de estudantes divergente do total é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'grade_entry_monitoring', MONITORING_ID),
        monitoringPayload({ studentsWithCompleteGrades: 10, studentsWithPartialGrades: 10, studentsWithoutGrades: 5, totalStudents: 30 })
      )
    );
  });

  it('status fora de rascunho/confirmado é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ status: 'aprovado' })));
  });

  it('sourceSystem diferente de "SIGE Escola" é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ sourceSystem: 'Manual' })));
  });

  it('referenceDate com formato inválido é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ referenceDate: '10-03-2026' })));
  });

  it('todos os contadores em zero (turma cadastrada, relatório informado, zero real) é permitido', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'grade_entry_monitoring', MONITORING_ID),
        monitoringPayload({
          totalStudents: 0, studentsWithCompleteGrades: 0, studentsWithPartialGrades: 0, studentsWithoutGrades: 0,
          expectedGradeEntries: 0, completedGradeEntries: 0,
        })
      )
    );
  });

  it('atualização legítima (correção dos totais) é permitida', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(
        doc(db, 'grade_entry_monitoring', MONITORING_ID),
        monitoringPayload({ completedGradeEntries: 100, updatedAt: '2026-03-15T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL })
      )
    );
  });

  it('troca de escola no update é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(
        doc(db, 'grade_entry_monitoring', MONITORING_ID),
        monitoringPayload({ schoolId: SCHOOL_B_ID, codInep: '00000502', escolaNome: ESCOLA_B })
      )
    );
  });

  it('troca de turma/ano/bimestre no update é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ turmaId: TURMA_B_ID })));
    await assertFails(updateDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ anoLetivo: 2027 })));
    await assertFails(updateDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ bimestre: 2 })));
  });

  // Revisão do code review do PR #17, seção 3: turmaNome faz parte da
  // identidade do acompanhamento tanto quanto turmaId — sem esta trava, uma
  // correção podia renomear a turma exibida sem tocar turmaId.
  it('troca de turmaNome no update é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ turmaNome: 'Turma A - Renomeada' }))
    );
  });

  it('troca somente dos totais (turmaNome e demais campos de identidade preservados) é permitida', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(
        doc(db, 'grade_entry_monitoring', MONITORING_ID),
        monitoringPayload({
          totalStudents: 25, studentsWithCompleteGrades: 20, studentsWithPartialGrades: 5, studentsWithoutGrades: 0,
          expectedGradeEntries: 100, completedGradeEntries: 90,
          updatedAt: '2026-03-16T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      )
    );
  });

  it('alteração de createdAt/createdBy é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ createdAt: '2020-01-01T00:00:00.000Z' })));
    await assertFails(updateDoc(doc(db, 'grade_entry_monitoring', MONITORING_ID), monitoringPayload({ createdBy: 'outro@example.com' })));
  });

  it('exclusão comum é bloqueada — só admin raiz exclui', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'grade_entry_monitoring', MONITORING_ID), monitoringPayload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring', MONITORING_ID)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'grade_entry_monitoring', MONITORING_ID)));
  });
});
