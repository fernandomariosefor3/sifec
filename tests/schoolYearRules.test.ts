// Fase 2A — testes das regras de school_years/enrollment_snapshots/imports/
// audit_logs, usando o Firebase Emulator (100% local, mesmo padrão de
// tests/firestore.rules.test.ts). Nenhum nome ou dado real de aluno é usado
// — tudo aqui é sintético, só para este teste.
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const ACTIVE_A_EMAIL = 'super.a@example.com'; // vinculado só à Escola A
const ACTIVE_B_EMAIL = 'super.b@example.com'; // vinculado só à Escola B
const INACTIVE_EMAIL = 'super.inativo@example.com';
const STRANGER_EMAIL = 'estranho@example.com';

const ESCOLA_A = 'Escola A - Teste Fase 2A';
const ESCOLA_B = 'Escola B - Teste Fase 2A';
const SCHOOL_A_ID = 'escola-a-2a';
const SCHOOL_B_ID = 'escola-b-2a';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-fase2a',
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
      nome: ESCOLA_A, codInep: '00000101', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'schools', SCHOOL_B_ID), {
      nome: ESCOLA_B, codInep: '00000102', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });

    // Turmas reais para isCanonicalTurmaOfSchool — enrollment_snapshots só
    // pode referenciar uma turma que exista e pertença à MESMA escola.
    await setDoc(doc(db, 'turmas', 'turma-a'), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Teste', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
    });
    await setDoc(doc(db, 'turmas', 'turma-b'), {
      schoolId: SCHOOL_B_ID, escolaId: SCHOOL_B_ID, escolaNome: ESCOLA_B,
      nome: 'Turma B - Teste', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
    });
  });
});

function ctxFor(email: string | null) {
  return email
    ? testEnv.authenticatedContext(email, { email })
    : testEnv.unauthenticatedContext();
}

function schoolYearPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `${SCHOOL_A_ID}_2026`,
    schoolId: SCHOOL_A_ID,
    codInep: '00000101',
    escolaNome: ESCOLA_A,
    anoLetivo: 2026,
    matriculaInicial: null,
    matriculaAtual: null,
    quantidadeTurmasAtivas: 0,
    status: 'planejamento',
    dataInicio: null,
    dataFim: null,
    ultimaAtualizacao: '2026-01-05T00:00:00.000Z',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function snapshotPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `${SCHOOL_A_ID}_turma-a_2026-03`,
    schoolId: SCHOOL_A_ID,
    codInep: '00000101',
    escolaNome: ESCOLA_A,
    turmaId: 'turma-a',
    turmaNome: 'Turma A - Teste',
    anoLetivo: 2026,
    mesReferencia: '2026-03',
    matriculaInicioMes: 30,
    novasMatriculas: 2,
    transferenciasEntrada: 0,
    transferenciasSaida: 1,
    abandono: 0,
    outrasSaidas: 0,
    matriculaFimMes: 31,
    reviewStatus: 'manual',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function turmaPayload(overrides: Record<string, unknown> = {}) {
  return {
    schoolId: SCHOOL_A_ID,
    escolaId: SCHOOL_A_ID,
    escolaNome: ESCOLA_A,
    codInep: '00000101',
    anoLetivo: 2026,
    nome: 'Turma Nova - Teste',
    ano: '1º Ano',
    periodo: 'Manhã',
    alunosSinalizados: 0,
    matriculaInicial: 0,
    matriculaAtual: 0,
    createdAt: '2026-01-05T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    updatedAt: '2026-01-05T00:00:00.000Z',
    updatedBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function importPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: `${SCHOOL_A_ID}_hash1`,
    sourceSystem: 'SIGE Escola',
    reportType: 'Enturmação',
    reportTitle: 'Relação de Enturmação — Teste',
    fileName: 'enturmacao-teste.pdf',
    fileHash: 'hash1',
    schoolId: SCHOOL_A_ID,
    codInep: '00000101',
    anoLetivo: 2026,
    recordsRead: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsIgnored: 0,
    inconsistencies: [],
    status: 'analisando',
    preview: { linhas: 10 },
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: ACTIVE_A_EMAIL,
    ...overrides,
  };
}

function auditLogPayload(email: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    collectionName: 'school_years',
    documentId: `${SCHOOL_A_ID}_2026`,
    schoolId: SCHOOL_A_ID,
    codInep: '00000101',
    anoLetivo: 2026,
    operation: 'update',
    previousValue: { matriculaAtual: 100 },
    newValue: { matriculaAtual: 110 },
    source: 'Manual',
    userId: 'uid-1',
    userEmail: email,
    timestamp: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Fase 2A — school_years', () => {
  it('administrador cria e lê school_year de qualquer escola', async () => {
    const db = ctxFor(ADMIN_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload()));
    await assertSucceeds(getDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`)));
  });

  it('superintendente grava school_year da própria escola', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload()));
  });

  it('superintendente não grava school_year de outra escola', async () => {
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload()));
  });

  it('superintendente sem vínculo não lê school_year de outra escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(getDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`)));
  });

  it('superintendente com vínculo lê a própria escola normalmente', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(getDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`)));
  });

  it('usuário inativo não lê nem escreve', async () => {
    const db = ctxFor(INACTIVE_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload()));
    await assertFails(getDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`)));
  });

  it('usuário não cadastrado é bloqueado', async () => {
    const db = ctxFor(STRANGER_EMAIL).firestore();
    await assertFails(getDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`)));
  });

  it('matriculaInicial negativa é rejeitada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ matriculaInicial: -1 })));
  });

  it('matriculaAtual decimal é rejeitada', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ matriculaAtual: 10.5 })));
  });

  it('status fora do enum é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ status: 'invalido' })));
  });

  it('campo inesperado é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ campoNaoPrevisto: 'x' })));
  });

  it('id/schoolId/anoLetivo incompatíveis com o próprio documentId são rejeitados na criação', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    // Documento "diva..._2026" mas schoolId aponta para outra escola.
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ schoolId: 'outra-escola' })));
    // Documento "..._2026" mas anoLetivo é outro.
    await assertFails(setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ anoLetivo: 2027 })));
  });

  it('update corrige o MESMO registro (mesma escola) com sucesso — fluxo legítimo de correção', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ matriculaAtual: 850 }))
    );
  });

  it('update não pode trocar schoolId/codInep/anoLetivo para "virar" outro registro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ anoLetivo: 2027 }))
    );
    await assertFails(
      updateDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ codInep: '99999999' }))
    );
  });

  it('update NÃO PODE sequestrar o school_year de outra escola enviando os próprios dados por cima', async () => {
    // Documento pertence à Escola A. Superintendente B (só tem acesso à
    // Escola B) tenta "tomar" o documento enviando escolaNome/schoolId da
    // própria Escola B — deve falhar tanto pela checagem de imutabilidade
    // quanto pela autorização sobre o dono ANTIGO (resource.data.escolaNome).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(
      updateDoc(
        doc(db, 'school_years', `${SCHOOL_A_ID}_2026`),
        schoolYearPayload({ schoolId: SCHOOL_B_ID, codInep: '00000102', escolaNome: ESCOLA_B })
      )
    );
  });

  it('update não pode reescrever createdAt/createdBy', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ createdAt: '2020-01-01T00:00:00.000Z' }))
    );
    await assertFails(
      updateDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ createdBy: 'outro@example.com' }))
    );
  });

  describe('propriedade canônica na criação (bloqueantes do PR #8)', () => {
    it('A. superintendente da Escola A não cria school_year usando o schoolId real da Escola B', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      // schoolId aponta para a Escola B de verdade, mas escolaNome é a
      // Escola A (que o superintendente A tem permissão de escrever) — o
      // ataque que canWriteEscola(incoming().escolaNome) sozinho não pegava.
      await assertFails(
        setDoc(
          doc(db, 'school_years', `${SCHOOL_B_ID}_2026`),
          schoolYearPayload({ id: `${SCHOOL_B_ID}_2026`, schoolId: SCHOOL_B_ID, escolaNome: ESCOLA_A })
        )
      );
    });

    it('D. codInep ou escolaNome divergentes do canônico da escola são rejeitados mesmo com schoolId correto', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ codInep: '99999999' }))
      );
      await assertFails(
        setDoc(doc(db, 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload({ escolaNome: 'Nome Divergente Qualquer' }))
      );
    });
  });

  it('exclusão comum é bloqueada — só admin raiz exclui', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'school_years', `${SCHOOL_A_ID}_2026`), schoolYearPayload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'school_years', `${SCHOOL_A_ID}_2026`)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'school_years', `${SCHOOL_A_ID}_2026`)));
  });
});

describe('Correção final PR #8 — turmas (create/update/delete separados)', () => {
  it('A. superintendente da Escola A não cria turma com o schoolId real da Escola B', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'turmas', 'turma-ataque-a'), turmaPayload({
        schoolId: SCHOOL_B_ID, escolaId: SCHOOL_B_ID,
      }))
    );
  });

  it('B. usa nome/schoolId da Escola A e codInep da Escola B — rejeitado pela integridade canônica', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'turmas', 'turma-ataque-b'), turmaPayload({ codInep: '00000102' }))
    );
  });

  it('C. schoolId diferente de escolaId é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'turmas', 'turma-ataque-c'), turmaPayload({ escolaId: 'algum-id-diferente' }))
    );
  });

  it('D. update não pode mudar escolaNome da turma para outra escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'turmas', 'turma-alvo-d'),
        turmaPayload({ schoolId: SCHOOL_B_ID, escolaId: SCHOOL_B_ID, escolaNome: ESCOLA_B, codInep: '00000102' })
      );
    });
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'turmas', 'turma-alvo-d'), {
        escolaNome: ESCOLA_A, updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_B_EMAIL,
      })
    );
  });

  it('E. update não move uma turma da Escola A para a Escola B (schoolId)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-alvo-e'), turmaPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'turmas', 'turma-alvo-e'), {
        schoolId: SCHOOL_B_ID, updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  it('F. update não pode alterar codInep de uma turma já canônica', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-alvo-f'), turmaPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'turmas', 'turma-alvo-f'), {
        codInep: '99999999', updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  it('G. update não pode reescrever createdAt/createdBy', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-alvo-g'), turmaPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'turmas', 'turma-alvo-g'), {
        createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
    await assertFails(
      updateDoc(doc(db, 'turmas', 'turma-alvo-g'), {
        createdBy: 'outro@example.com', updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  it('H. superintendente comum não exclui turma', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-alvo-h'), turmaPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(deleteDoc(doc(db, 'turmas', 'turma-alvo-h')));
  });

  it('I. criação canônica na própria escola é permitida', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'turmas', 'turma-canonica-i'), turmaPayload()));
  });

  it('J. edição de campos pedagógicos na própria escola é permitida', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-alvo-j'), turmaPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'turmas', 'turma-alvo-j'), {
        nome: 'Turma Renomeada', alunosSinalizados: 4,
        updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  it('K. enriquecimento canônico de turma legada é permitido', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-legada-k'), {
        escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A, nome: 'Turma Legada K',
        ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
      });
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'turmas', 'turma-legada-k'), {
        schoolId: SCHOOL_A_ID, codInep: '00000101', anoLetivo: 2026,
        createdAt: '2026-02-01T00:00:00.000Z', createdBy: ACTIVE_A_EMAIL,
        updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  it('L. enriquecimento de turma legada com schoolId de outra escola é rejeitado', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'turmas', 'turma-legada-l'), {
        escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A, nome: 'Turma Legada L',
        ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
      });
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'turmas', 'turma-legada-l'), {
        schoolId: SCHOOL_B_ID, updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  describe('último ajuste de integridade — validação de campos novos no update', () => {
    it('Ativar/Inativar (só ativa boolean) continua funcionando', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'turmas', 'turma-toggle'), turmaPayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'turmas', 'turma-toggle'), {
          ativa: false, updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('update rejeita ativa com tipo errado (string em vez de boolean)', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'turmas', 'turma-ativa-invalida'), turmaPayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'turmas', 'turma-ativa-invalida'), {
          ativa: 'false', updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('update rejeita modalidade fora do enum', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'turmas', 'turma-modalidade-invalida'), turmaPayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'turmas', 'turma-modalidade-invalida'), {
          modalidade: 'Inventada', updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('update rejeita matriculaAtual negativa', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'turmas', 'turma-matricula-invalida'), turmaPayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        updateDoc(doc(db, 'turmas', 'turma-matricula-invalida'), {
          matriculaAtual: -5, updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('Editar turma com campos pedagógicos válidos continua funcionando', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'turmas', 'turma-edicao-valida'), turmaPayload());
      });
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertSucceeds(
        updateDoc(doc(db, 'turmas', 'turma-edicao-valida'), {
          modalidade: 'Tempo Integral', cargaHoraria: 900, matriculaAtual: 32,
          updatedAt: '2026-02-01T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });
  });
});

describe('Fase 2A — enrollment_snapshots', () => {
  it('superintendente grava snapshot mensal da própria escola', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload()));
  });

  it('superintendente não grava snapshot de outra escola', async () => {
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload()));
  });

  it('valor negativo é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ abandono: -1 }))
    );
  });

  it('valor decimal é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ novasMatriculas: 1.5 }))
    );
  });

  it('mês de referência inválido é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-13`), snapshotPayload({ mesReferencia: '2026-13' }))
    );
    await assertFails(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_03-2026`), snapshotPayload({ mesReferencia: '03-2026' }))
    );
  });

  it('mês de referência de outro ano (fora do anoLetivo) é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2027-03`),
        snapshotPayload({ id: `${SCHOOL_A_ID}_turma-a_2027-03`, mesReferencia: '2027-03' })
      )
    );
  });

  it('fevereiro preservado ao gravar março — são documentos (IDs) diferentes', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-02`),
        snapshotPayload({ id: `${SCHOOL_A_ID}_turma-a_2026-02`, mesReferencia: '2026-02', matriculaFimMes: 30, matriculaInicioMes: 28 })
      )
    );
    await assertSucceeds(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload())
    );

    const fevereiro = await getDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-02`));
    const marco = await getDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`));
    if (fevereiro.data()?.matriculaFimMes !== 30) throw new Error('fevereiro foi alterado inesperadamente');
    if (marco.data()?.matriculaFimMes !== 31) throw new Error('março não foi gravado corretamente');
  });

  it('consulta por escola só retorna (e só é permitida) para quem tem vínculo com ela', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload());
    });
    const ownDb = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(getDocs(query(collection(ownDb, 'enrollment_snapshots'), where('schoolId', '==', SCHOOL_A_ID))));

    const otherDb = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(getDocs(query(collection(otherDb, 'enrollment_snapshots'), where('schoolId', '==', SCHOOL_A_ID))));
  });

  it('exclusão de snapshot é sempre bloqueada para usuário comum', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`)));
  });

  it('schoolId/turmaId/mesReferencia incompatíveis com o próprio documentId são rejeitados na criação', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ turmaId: 'turma-outra' }))
    );
    await assertFails(
      setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ mesReferencia: '2026-04' }))
    );
  });

  it('update corrige o MESMO snapshot (mesma escola/turma/mês) com sucesso — fluxo legítimo de correção', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(
      updateDoc(
        doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`),
        snapshotPayload({ matriculaFimMes: 32, observacao: 'Corrigido após conferência.', reviewStatus: 'corrigido' })
      )
    );
  });

  it('update não pode trocar schoolId/turmaId/anoLetivo/mesReferencia para "virar" outro registro', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ turmaId: 'turma-b' }))
    );
    await assertFails(
      updateDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ anoLetivo: 2027 }))
    );
  });

  it('update NÃO PODE sequestrar o snapshot de outra escola enviando os próprios dados por cima', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload());
    });
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(
      updateDoc(
        doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`),
        snapshotPayload({ schoolId: SCHOOL_B_ID, codInep: '00000102', escolaNome: ESCOLA_B })
      )
    );
  });

  it('update não pode reescrever createdAt/createdBy', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      updateDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ createdAt: '2020-01-01T00:00:00.000Z' }))
    );
    await assertFails(
      updateDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ createdBy: 'outro@example.com' }))
    );
  });

  describe('propriedade canônica na criação (bloqueantes do PR #8)', () => {
    it('B. superintendente da Escola A não cria snapshot usando o schoolId real da Escola B', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        setDoc(
          doc(db, 'enrollment_snapshots', `${SCHOOL_B_ID}_turma-a_2026-03`),
          snapshotPayload({ id: `${SCHOOL_B_ID}_turma-a_2026-03`, schoolId: SCHOOL_B_ID, escolaNome: ESCOLA_A })
        )
      );
    });

    it('C. turma pertencente a outra escola é rejeitada mesmo com schoolId/codInep/escolaNome corretos', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      // turma-b pertence à Escola B (ver seed em beforeEach) — a Escola A
      // não pode registrar um snapshot próprio referenciando essa turma.
      await assertFails(
        setDoc(
          doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-b_2026-03`),
          snapshotPayload({ id: `${SCHOOL_A_ID}_turma-b_2026-03`, turmaId: 'turma-b' })
        )
      );
    });

    it('D. codInep ou escolaNome divergentes do canônico da escola são rejeitados mesmo com schoolId correto', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ codInep: '99999999' }))
      );
      await assertFails(
        setDoc(doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-a_2026-03`), snapshotPayload({ escolaNome: 'Nome Divergente Qualquer' }))
      );
    });

    it('snapshot referenciando uma turma inexistente é rejeitado', async () => {
      const db = ctxFor(ACTIVE_A_EMAIL).firestore();
      await assertFails(
        setDoc(
          doc(db, 'enrollment_snapshots', `${SCHOOL_A_ID}_turma-fantasma_2026-03`),
          snapshotPayload({ id: `${SCHOOL_A_ID}_turma-fantasma_2026-03`, turmaId: 'turma-fantasma' })
        )
      );
    });
  });
});

describe('Fase 2A — imports', () => {
  it('superintendente cria import para a própria escola', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), importPayload()));
  });

  it('import sem escola válida (schoolId de escola inexistente) é rejeitado', async () => {
    const db = ctxFor(ADMIN_EMAIL).firestore();
    await assertFails(
      setDoc(doc(db, 'imports', 'escola-inexistente_hash1'), importPayload({ id: 'escola-inexistente_hash1', schoolId: 'escola-inexistente' }))
    );
  });

  it('import não pode nascer já confirmado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), importPayload({ status: 'confirmado' })));
  });

  it('import com schoolId correto e codInep de outra escola é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), importPayload({ codInep: '00000102' })));
  });

  it('superintendente sem permissão não confirma import de outra escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'imports', `${SCHOOL_A_ID}_hash1`), importPayload());
    });
    const db = ctxFor(ACTIVE_B_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { status: 'confirmado' }));
  });

  it('superintendente com permissão confirma import da própria escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'imports', `${SCHOOL_A_ID}_hash1`), importPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { status: 'confirmado', confirmedAt: '2026-03-02T00:00:00.000Z', confirmedBy: ACTIVE_A_EMAIL }));
  });

  it('campo inesperado no import é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), importPayload({ campoNaoPrevisto: 'x' })));
  });

  it('importId incompatível com schoolId_fileHash é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'imports', 'id-qualquer'), importPayload({ id: 'id-qualquer' })));
  });

  it('incoming().id divergente do documentId é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), importPayload({ id: 'outro-id' })));
  });

  it('update não pode reescrever id/codInep/anoLetivo/fileHash/createdAt/createdBy', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'imports', `${SCHOOL_A_ID}_hash1`), importPayload());
    });
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { codInep: '99999999' }));
    await assertFails(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { anoLetivo: 2027 }));
    await assertFails(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { fileHash: 'outro-hash' }));
    await assertFails(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { createdAt: '2020-01-01T00:00:00.000Z' }));
    await assertFails(updateDoc(doc(db, 'imports', `${SCHOOL_A_ID}_hash1`), { createdBy: 'outro@example.com' }));
  });
});

describe('Fase 2A — audit_logs', () => {
  it('usuário autorizado registra um log de auditoria em seu próprio nome', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertSucceeds(setDoc(doc(db, 'audit_logs', 'log-1'), auditLogPayload(ACTIVE_A_EMAIL)));
  });

  it('não é possível gravar um log em nome de outro usuário', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(setDoc(doc(db, 'audit_logs', 'log-1'), auditLogPayload(ACTIVE_B_EMAIL)));
  });

  it('usuário comum não lê audit_logs — só administrador', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'audit_logs', 'log-1'), auditLogPayload(ACTIVE_A_EMAIL));
    });
    await assertFails(getDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', 'log-1')));
    await assertSucceeds(getDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'audit_logs', 'log-1')));
  });

  it('audit_log não pode ser alterado, nem por administrador', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'audit_logs', 'log-1'), auditLogPayload(ACTIVE_A_EMAIL));
    });
    await assertFails(updateDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'audit_logs', 'log-1'), { operation: 'correction' }));
  });

  it('audit_log não pode ser excluído, nem por administrador', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'audit_logs', 'log-1'), auditLogPayload(ACTIVE_A_EMAIL));
    });
    await assertFails(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'audit_logs', 'log-1')));
  });

  it('log escolar apontando para escola de outra carteira é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    // ACTIVE_A_EMAIL só tem acesso à Escola A — tentar gravar um log
    // "escolar" (collectionName em isSchoolScopedAuditCollection) com o
    // schoolId real da Escola B deve falhar.
    await assertFails(
      setDoc(
        doc(db, 'audit_logs', 'log-carteira-errada'),
        auditLogPayload(ACTIVE_A_EMAIL, { id: 'log-carteira-errada', schoolId: SCHOOL_B_ID, codInep: '00000102' })
      )
    );
  });

  it('log escolar com codInep divergente do canônico da escola é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    await assertFails(
      setDoc(
        doc(db, 'audit_logs', 'log-codinep-errado'),
        auditLogPayload(ACTIVE_A_EMAIL, { id: 'log-codinep-errado', codInep: '99999999' })
      )
    );
  });

  it('log escolar sem schoolId é rejeitado', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const payload = auditLogPayload(ACTIVE_A_EMAIL, { id: 'log-sem-escola' });
    delete (payload as Record<string, unknown>).schoolId;
    await assertFails(setDoc(doc(db, 'audit_logs', 'log-sem-escola'), payload));
  });

  it('log de coleção não-escolar (ex.: superintendentes) não exige schoolId', async () => {
    const db = ctxFor(ACTIVE_A_EMAIL).firestore();
    const payload = auditLogPayload(ACTIVE_A_EMAIL, {
      id: 'log-nao-escolar',
      collectionName: 'superintendentes',
      documentId: ACTIVE_A_EMAIL,
    });
    delete (payload as Record<string, unknown>).schoolId;
    delete (payload as Record<string, unknown>).codInep;
    delete (payload as Record<string, unknown>).anoLetivo;
    await assertSucceeds(setDoc(doc(db, 'audit_logs', 'log-nao-escolar'), payload));
  });
});
