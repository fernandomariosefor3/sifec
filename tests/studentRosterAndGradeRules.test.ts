// Fase 2C — testes das regras de student_rosters, student_bimester_grades
// e da coleção legado grades (agora restrita ao admin raiz), usando o
// Firebase Emulator (100% local, mesmo padrão de tests/schoolFlowRules.test.ts).
// Nenhum nome real de estudante é usado — tudo aqui é sintético.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const CADASTRO_ADMIN_EMAIL = 'admin.cadastrado.2c@example.com';
const ACTIVE_A_EMAIL = 'super.a.2c@example.com';
const ACTIVE_B_EMAIL = 'super.b.2c@example.com';
const INACTIVE_EMAIL = 'super.inativo.2c@example.com';
const STRANGER_EMAIL = 'estranho.2c@example.com';

const ESCOLA_A = 'Escola A - Teste Fase 2C';
const ESCOLA_B = 'Escola B - Teste Fase 2C';
const SCHOOL_A_ID = 'escola-a-2c';
const SCHOOL_B_ID = 'escola-b-2c';
const TURMA_A_ID = 'turma-a-2c';
const TURMA_B_ID = 'turma-b-2c';
const TURMA_ANO_ANTERIOR_ID = 'turma-a-ano-anterior-2c';
const TURMA_SEM_ANO_ID = 'turma-a-sem-ano-2c';
const ANO_LETIVO = 2026;
const STUDENT_KEY = 'aaaa1111-uuid';
const ROSTER_ID = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_A_ID}_${STUDENT_KEY}`;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-fase2c',
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
    await setDoc(doc(db, 'superintendentes', CADASTRO_ADMIN_EMAIL), {
      id: 'admin-cadastrado-2c', nome: 'Admin Cadastrado (Teste)', cargo: 'Superintendente Regional',
      email: CADASTRO_ADMIN_EMAIL, escolas: [], ativo: true, role: 'admin',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_A_EMAIL), {
      id: 'super-a-2c', nome: 'Superintendente A (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_A_EMAIL, escolas: [ESCOLA_A], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_B_EMAIL), {
      id: 'super-b-2c', nome: 'Superintendente B (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_B_EMAIL, escolas: [ESCOLA_B], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', INACTIVE_EMAIL), {
      id: 'super-inativo-2c', nome: 'Superintendente Inativo (Teste)', cargo: 'Superintendente Regional',
      email: INACTIVE_EMAIL, escolas: [ESCOLA_A], ativo: false, role: 'superintendent',
    });

    await setDoc(doc(db, 'schools', SCHOOL_A_ID), {
      nome: ESCOLA_A, codInep: '00000401', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'schools', SCHOOL_B_ID), {
      nome: ESCOLA_B, codInep: '00000402', cidade: 'Fortaleza',
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
    // confirmar que um roster do ano corrente nunca pode apontar para ela
    // (revisão do PR #15, item 1: turma × ano letivo).
    await setDoc(doc(db, 'turmas', TURMA_ANO_ANTERIOR_ID), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Ano Anterior', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO - 1,
    });
    // Turma legada da MESMA escola, ainda sem `anoLetivo` (Fase 2A nunca
    // migrou todo o histórico) — nunca pode ser usada silenciosamente pelo
    // módulo de notas.
    await setDoc(doc(db, 'turmas', TURMA_SEM_ANO_ID), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Sem Ano Letivo', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
    });

    // Documento legado de `grades` — nunca alterado por este teste, só
    // usado para confirmar que a leitura fica restrita ao admin raiz.
    await setDoc(doc(db, 'grades', 'grade-legado-1'), {
      nome: 'Estudante Legado', turma: 'Turma A - Teste', portugues: 7, matematica: 6, ciencias: 8, bimestre: '1º Bimestre',
    });
  });
});

function ctxFor(email: string | null) {
  return email
    ? testEnv.authenticatedContext(email, { email })
    : testEnv.unauthenticatedContext();
}

function rosterPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: ROSTER_ID,
    studentKey: STUDENT_KEY,
    schoolId: SCHOOL_A_ID,
    codInep: '00000401',
    escolaNome: ESCOLA_A,
    turmaId: TURMA_A_ID,
    turmaNome: 'Turma A - Teste',
    anoLetivo: ANO_LETIVO,
    studentName: 'Estudante Teste',
    active: true,
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function gradePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `${ROSTER_ID}_b1`,
    rosterId: ROSTER_ID,
    studentKey: STUDENT_KEY,
    schoolId: SCHOOL_A_ID,
    codInep: '00000401',
    escolaNome: ESCOLA_A,
    turmaId: TURMA_A_ID,
    turmaNome: 'Turma A - Teste',
    anoLetivo: ANO_LETIVO,
    bimestre: 1,
    scores: { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 },
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function rosterQuery(db: ReturnType<ReturnType<typeof ctxFor>['firestore']>, schoolId: string, anoLetivo: number) {
  return query(collection(db, 'student_rosters'), where('schoolId', '==', schoolId), where('anoLetivo', '==', anoLetivo));
}

describe('Fase 2C — student_rosters', () => {
  it('root consulta escola autorizada, mesmo sem documento', async () => {
    const db = ctxFor(ADMIN_EMAIL).firestore();
    const snap = await assertSucceeds(getDocs(rosterQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
    expect(snap.empty).toBe(true);
  });

  it('admin cadastrado (não-root) consulta a escola selecionada', async () => {
    const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
    await assertSucceeds(getDocs(rosterQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('superintendente consulta sua escola', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const snap = await assertSucceeds(getDocs(rosterQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
    expect(snap.empty).toBe(true);
  });

  it('outra escola é bloqueada', async () => {
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(getDocs(rosterQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('usuário inativo é bloqueado', async () => {
    const db = ctxFor(INACTIVE_EMAIL).firestore();
    await assertFails(getDocs(rosterQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('usuário não cadastrado é bloqueado', async () => {
    const db = ctxFor(STRANGER_EMAIL).firestore();
    await assertFails(getDocs(rosterQuery(db, SCHOOL_A_ID, ANO_LETIVO)));
  });

  it('consulta sem filtro de schoolId é bloqueada para superintendente comum', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(getDocs(collection(db, 'student_rosters')));
  });

  it('roster válido é permitido', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload()));
  });

  it('escola incorreta (schoolId de outra escola) é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_B_ID}_${ANO_LETIVO}_${TURMA_A_ID}_${STUDENT_KEY}`;
    await assertFails(
      setDoc(doc(db, 'student_rosters', badId), rosterPayload({ id: badId, schoolId: SCHOOL_B_ID, escolaNome: ESCOLA_A }))
    );
  });

  it('turma de outra escola é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_B_ID}_${STUDENT_KEY}`;
    await assertFails(
      setDoc(doc(db, 'student_rosters', badId), rosterPayload({ id: badId, turmaId: TURMA_B_ID, turmaNome: 'Turma B - Teste' }))
    );
  });

  // Revisão do PR #15, item 1: roster do ano corrente (2026) nunca pode
  // apontar para uma turma de outro ano letivo, mesmo da MESMA escola.
  it('roster do ano corrente com turma de ano letivo anterior é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_ANO_ANTERIOR_ID}_${STUDENT_KEY}`;
    await assertFails(
      setDoc(
        doc(db, 'student_rosters', badId),
        rosterPayload({ id: badId, turmaId: TURMA_ANO_ANTERIOR_ID, turmaNome: 'Turma A - Ano Anterior' })
      )
    );
  });

  it('turma sem anoLetivo cadastrado nunca é aceita silenciosamente', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const badId = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_SEM_ANO_ID}_${STUDENT_KEY}`;
    await assertFails(
      setDoc(
        doc(db, 'student_rosters', badId),
        rosterPayload({ id: badId, turmaId: TURMA_SEM_ANO_ID, turmaNome: 'Turma A - Sem Ano Letivo' })
      )
    );
  });

  it('campo pessoal extra (ex.: CPF) é bloqueado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ cpf: '000.000.000-00' })));
  });

  it('alteração de schoolId é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ schoolId: SCHOOL_B_ID, codInep: '00000402', escolaNome: ESCOLA_B }))
    );
  });

  it('alteração de turma é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ turmaId: 'outra-turma' })));
  });

  it('alteração de studentKey é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ studentKey: 'outro-key' })));
  });

  // Revisão do PR #15, item 3: metadados de origem são imutáveis depois da
  // criação — nenhum deles pode ser inserido, removido ou trocado num
  // update, mesmo mantendo todo o resto do payload igual.
  describe('metadados de origem são imutáveis no update', () => {
    it('inserir sourceSystem após a criação (documento sem nenhum metadado) é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ sourceSystem: 'Manual' }))
      );
    });

    it('trocar sourceSystem existente é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload({ sourceSystem: 'Manual' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ sourceSystem: 'SIGE Escola' }))
      );
    });

    it('remover sourceSystem existente é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload({ sourceSystem: 'Manual' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      // updateDoc faz merge parcial — reenviar rosterPayload() sem
      // sourceSystem NÃO o remove (o SDK só mexe nos campos presentes no
      // payload). deleteField() é o sentinel real de remoção.
      await assertFails(updateDoc(doc(db, 'student_rosters', ROSTER_ID), { sourceSystem: deleteField() }));
    });

    it('trocar sourceStudentHash é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload({ sourceStudentHash: 'hash-original' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ sourceStudentHash: 'hash-novo' }))
      );
    });

    it('trocar sourceFileHash é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload({ sourceFileHash: 'hash-arquivo-original' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ sourceFileHash: 'hash-arquivo-novo' }))
      );
    });

    it('trocar importBatchId é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload({ importBatchId: 'lote-original' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ importBatchId: 'lote-novo' }))
      );
    });

    it('atualização legítima (studentName/active, metadados de origem intocados) continua permitida', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload({ sourceSystem: 'Manual', importBatchId: 'lote-1' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        updateDoc(
          doc(db, 'student_rosters', ROSTER_ID),
          rosterPayload({ sourceSystem: 'Manual', importBatchId: 'lote-1', studentName: 'Nome Corrigido' })
        )
      );
    });
  });

  it('inativação legítima (active: false, resto igual) é permitida', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(updateDoc(doc(db, 'student_rosters', ROSTER_ID), rosterPayload({ active: false, updatedAt: '2026-05-01T00:00:00.000Z' })));
  });

  it('exclusão comum é bloqueada — só admin raiz exclui', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'student_rosters', ROSTER_ID)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_rosters', ROSTER_ID)));
  });
});

describe('Fase 2C — student_bimester_grades', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), rosterPayload());
    });
  });

  it('grade válida é permitida (roster existente e ativo)', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload()));
  });

  it('grade sem roster (rosterId inexistente) é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const fakeRosterId = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_A_ID}_inexistente-uuid`;
    await assertFails(
      setDoc(
        doc(db, 'student_bimester_grades', `${fakeRosterId}_b1`),
        gradePayload({ id: `${fakeRosterId}_b1`, rosterId: fakeRosterId, studentKey: 'inexistente-uuid' })
      )
    );
  });

  it('grade referenciando roster de outra escola é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const otherRosterId = `${SCHOOL_B_ID}_${ANO_LETIVO}_${TURMA_B_ID}_${STUDENT_KEY}`;
      await setDoc(
        doc(ctx.firestore(), 'student_rosters', otherRosterId),
        rosterPayload({ id: otherRosterId, schoolId: SCHOOL_B_ID, codInep: '00000402', escolaNome: ESCOLA_B, turmaId: TURMA_B_ID, turmaNome: 'Turma B - Teste' })
      );
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const otherRosterId = `${SCHOOL_B_ID}_${ANO_LETIVO}_${TURMA_B_ID}_${STUDENT_KEY}`;
    // Superintendente A tenta gravar uma nota da Escola A, mas apontando
    // rosterId para o roster da Escola B — isValidRosterForGradeCreation
    // exige que roster.schoolId bata com o schoolId do payload.
    await assertFails(
      setDoc(
        doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
        gradePayload({ rosterId: otherRosterId })
      )
    );
  });

  it('grade com ano letivo divergente do roster é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ anoLetivo: 2027 })));
  });

  it('grade com roster inativo é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), { active: false });
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload()));
  });

  it('grade com bimestre divergente do ID é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ bimestre: 2 })));
  });

  it('nota inválida (fora de 0-10) é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
        gradePayload({ scores: { linguaPortuguesa: 11, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
      )
    );
  });

  it('chave inesperada em scores é bloqueada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
        gradePayload({ scores: { linguaPortuguesa: 8, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6, ingles: 10 } })
      )
    );
  });

  // Revisão do PR #15, item 5: nota*100 precisa ser um inteiro — no máximo
  // duas casas decimais, com tolerância só para erro de ponto flutuante
  // binário (ver comentário de isValidBimesterScoreValue em firestore.rules).
  describe('nota com no máximo duas casas decimais', () => {
    it('nota com três casas decimais é bloqueada', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        setDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 7.123, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
        )
      );
    });

    it('nota com duas casas decimais é permitida', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        setDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 7.12, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
        )
      );
    });

    it('notas sujeitas a erro de ponto flutuante binário (ex.: 0.29, 1.11) continuam permitidas', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        setDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 0.29, matematica: 1.11, cienciasNatureza: 2.22, cienciasHumanas: 6 } })
        )
      );
    });

    it('nota null (em branco) continua válida', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        setDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: null, matematica: null, cienciasNatureza: null, cienciasHumanas: null } })
        )
      );
    });
  });

  it('atualização legítima (mesmos estudante/turma/ano/bimestre) é permitida', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(
        doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
        gradePayload({ scores: { linguaPortuguesa: 9, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 }, updatedAt: '2026-04-01T00:00:00.000Z' })
      )
    );
  });

  // Revisão do PR #15, item 4: o `allow update` de student_bimester_grades
  // agora reconsulta o roster referenciado a cada correção — não só no
  // create. isValidRosterForGradeWrite() é chamado nos dois.
  describe('revalidação do roster no update', () => {
    it('atualizar nota com roster ativo continua permitido', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        updateDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 10, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
        )
      );
    });

    it('atualizar nota depois de o roster ser inativado é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
        await updateDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), { active: false });
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 10, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
        )
      );
    });

    it('atualizar nota depois de o roster deixar de existir é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
        await deleteDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 10, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
        )
      );
    });

    it('atualizar nota depois de o roster "migrar" para outra turma/ano é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
        // Simula o roster sendo desviado de escopo por fora da aplicação
        // (ex.: correção manual/migração) — a nota nunca deveria continuar
        // gravável contra um roster que não bate mais com seus próprios
        // campos denormalizados de turma/ano.
        await updateDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID), { turmaId: TURMA_B_ID, turmaNome: 'Turma B - Teste' });
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ scores: { linguaPortuguesa: 10, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 } })
        )
      );
    });
  });

  // Revisão do PR #15, item 3: metadados de origem imutáveis no update de
  // student_bimester_grades, mesmo princípio de student_rosters.
  describe('metadados de origem são imutáveis no update', () => {
    it('inserir sourceSystem após a criação é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceSystem: 'Manual' }))
      );
    });

    it('trocar sourceReportTitle é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceReportTitle: 'Boletim Original' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceReportTitle: 'Boletim Novo' }))
      );
    });

    it('trocar sourceFileName é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceFileName: 'arquivo-original.csv' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceFileName: 'arquivo-novo.csv' }))
      );
    });

    it('trocar sourceFileHash é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceFileHash: 'hash-original' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ sourceFileHash: 'hash-novo' }))
      );
    });

    it('trocar importBatchId é bloqueado', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ importBatchId: 'lote-original' }));
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ importBatchId: 'lote-novo' }))
      );
    });

    it('atualização legítima (scores/observacao, metadados de origem intocados) continua permitida', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({ sourceSystem: 'Manual', importBatchId: 'lote-1' })
        );
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        updateDoc(
          doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`),
          gradePayload({
            sourceSystem: 'Manual', importBatchId: 'lote-1',
            scores: { linguaPortuguesa: 9, matematica: 7, cienciasNatureza: 9, cienciasHumanas: 6 },
          })
        )
      );
    });
  });

  it('mudança de estudante (studentKey/rosterId) é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
      const otherRosterId = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_A_ID}_bbbb2222-uuid`;
      await setDoc(doc(ctx.firestore(), 'student_rosters', otherRosterId), rosterPayload({ id: otherRosterId, studentKey: 'bbbb2222-uuid' }));
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const otherRosterId = `${SCHOOL_A_ID}_${ANO_LETIVO}_${TURMA_A_ID}_bbbb2222-uuid`;
    await assertFails(
      updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ rosterId: otherRosterId, studentKey: 'bbbb2222-uuid' }))
    );
  });

  it('mudança de bimestre é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ bimestre: 2 })));
  });

  it('mudança de createdAt/createdBy é bloqueada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ createdAt: '2020-01-01T00:00:00.000Z' })));
    await assertFails(updateDoc(doc(db, 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload({ createdBy: 'outro@example.com' })));
  });

  it('exclusão comum é bloqueada — só admin raiz exclui', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`), gradePayload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'student_bimester_grades', `${ROSTER_ID}_b1`)));
  });
});

describe('Fase 2C — grades (legado, restrito)', () => {
  it('invisível para superintendente comum', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(getDoc(doc(db, 'grades', 'grade-legado-1')));
  });

  it('invisível para admin cadastrado (não-root)', async () => {
    const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
    await assertFails(getDoc(doc(db, 'grades', 'grade-legado-1')));
  });

  it('legível apenas pelo admin raiz', async () => {
    const db = ctxFor(ADMIN_EMAIL).firestore();
    const snap = await assertSucceeds(getDoc(doc(db, 'grades', 'grade-legado-1')));
    expect(snap.exists()).toBe(true);
  });

  it('qualquer escrita é bloqueada, inclusive para o admin raiz', async () => {
    const payload = { nome: 'Novo', turma: 'Turma A - Teste', portugues: 5, matematica: 5, ciencias: 5, bimestre: '1º Bimestre' };
    await assertFails(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'grades', 'grade-novo'), payload));
    await assertFails(updateDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'grades', 'grade-legado-1'), { portugues: 9 }));
    await assertFails(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'grades', 'grade-legado-1')));
  });
});

describe('Fase 2C — atomicidade (falha na auditoria derruba o batch inteiro)', () => {
  it('userEmail do audit_log divergente do autenticado impede o commit do roster inteiro', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'student_rosters', ROSTER_ID), rosterPayload());
    batch.set(doc(collection(db, 'audit_logs')), {
      id: 'audit-x',
      collectionName: 'student_rosters',
      documentId: ROSTER_ID,
      schoolId: SCHOOL_A_ID,
      codInep: '00000401',
      anoLetivo: ANO_LETIVO,
      operation: 'create',
      previousValue: null,
      newValue: { action: 'create', rosterId: ROSTER_ID, turmaId: TURMA_A_ID, anoLetivo: ANO_LETIVO },
      source: 'Manual',
      userId: ACTIVE_A_EMAIL,
      userEmail: 'nao-bate-com-autenticado@example.com',
      timestamp: '2026-02-10T00:00:00.000Z',
    });

    await assertFails(batch.commit());

    let rosterSnap: Awaited<ReturnType<typeof getDoc>> | undefined;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      rosterSnap = await getDoc(doc(ctx.firestore(), 'student_rosters', ROSTER_ID));
    });
    expect(rosterSnap?.exists()).toBe(false);
  });
});
