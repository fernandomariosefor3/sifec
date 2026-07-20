// Testes das Firestore Security Rules propostas (firestore.rules.proposed)
// usando o Firebase Emulator. Roda 100% local — nunca toca dados de
// produção. Nenhum nome ou nota de estudante real é usado; todos os dados
// abaixo são sintéticos, criados só para este teste.
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const ACTIVE_EMAIL = 'super.ativo@example.com';
const INACTIVE_EMAIL = 'super.inativo@example.com';
const NO_ATIVO_FIELD_EMAIL = 'super.sem-campo-ativo@example.com';
const EMPTY_ESCOLAS_EMAIL = 'super.sem-escolas@example.com';
const STRANGER_EMAIL = 'estranho@example.com';

const ESCOLA_A = 'Escola A - Teste';
const ESCOLA_B = 'Escola B - Teste';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules.proposed', 'utf8'),
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

    await setDoc(doc(db, 'superintendentes', ACTIVE_EMAIL), {
      nome: 'Superintendente Ativo (Teste)',
      cargo: 'Superintendente Regional',
      email: ACTIVE_EMAIL,
      escolas: [ESCOLA_A],
      ativo: true,
    });
    await setDoc(doc(db, 'superintendentes', INACTIVE_EMAIL), {
      nome: 'Superintendente Inativo (Teste)',
      cargo: 'Superintendente Regional',
      email: INACTIVE_EMAIL,
      escolas: [ESCOLA_B],
      ativo: false,
    });
    // Documento antigo, anterior à existência do campo `ativo` — simula um
    // registro real de produção que ainda não passou pela migração.
    await setDoc(doc(db, 'superintendentes', NO_ATIVO_FIELD_EMAIL), {
      nome: 'Superintendente Legado Sem Campo Ativo (Teste)',
      cargo: 'Superintendente Regional',
      email: NO_ATIVO_FIELD_EMAIL,
      escolas: [ESCOLA_B],
    });
    // Ativo, mas sem nenhuma escola atribuída — não deve conseguir escrever
    // em escola nenhuma (myEscolas() vazio).
    await setDoc(doc(db, 'superintendentes', EMPTY_ESCOLAS_EMAIL), {
      nome: 'Superintendente Sem Escolas (Teste)',
      cargo: 'Superintendente Regional',
      email: EMPTY_ESCOLAS_EMAIL,
      escolas: [],
      ativo: true,
    });

    await setDoc(doc(db, 'schools', 'escola-a-teste'), {
      nome: ESCOLA_A, codInep: '00000001', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'schools', 'escola-b-teste'), {
      nome: ESCOLA_B, codInep: '00000002', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });

    await setDoc(doc(db, 'turmas', 'turma-a-teste'), {
      escolaId: 'escola-a-teste', escolaNome: ESCOLA_A, nome: 'Turma A - Teste',
      ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
    });
    await setDoc(doc(db, 'turmas', 'turma-b-teste'), {
      escolaId: 'escola-b-teste', escolaNome: ESCOLA_B, nome: 'Turma B - Teste',
      ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0,
    });

    await setDoc(doc(db, 'visitas', 'visita-a-teste'), {
      escola: ESCOLA_A, tecnico: 'Técnico Teste', data: '2026-01-10',
      foco: 'Foco de Teste', status: 'Agendada',
    });
    await setDoc(doc(db, 'visitas', 'visita-b-teste'), {
      escola: ESCOLA_B, tecnico: 'Técnico Teste', data: '2026-01-10',
      foco: 'Foco de Teste', status: 'Agendada',
    });

    await setDoc(doc(db, 'grades', 'nota-teste-1'), {
      nome: 'Aluno Fictício Um', turma: 'Turma Teste',
      portugues: 7, matematica: 7, ciencias: 7, bimestre: '1º Bimestre',
    });
  });
});

function ctxFor(email: string | null) {
  return email
    ? testEnv.authenticatedContext(email, { email })
    : testEnv.unauthenticatedContext();
}

describe('Firestore Rules propostas — SIFEC', () => {
  it('usuário não autenticado não consegue ler schools', async () => {
    await assertFails(getDocs(collection(ctxFor(null).firestore(), 'schools')));
  });

  it('conta Google não cadastrada não consegue ler schools', async () => {
    await assertFails(getDocs(collection(ctxFor(STRANGER_EMAIL).firestore(), 'schools')));
  });

  it('superintendente ativo consegue ler dados permitidos (schools, turmas, grades, visitas)', async () => {
    const db = ctxFor(ACTIVE_EMAIL).firestore();
    await assertSucceeds(getDocs(collection(db, 'schools')));
    await assertSucceeds(getDocs(collection(db, 'turmas')));
    await assertSucceeds(getDocs(collection(db, 'grades')));
    await assertSucceeds(getDocs(collection(db, 'visitas')));
  });

  it('superintendente inativo não consegue ler nenhuma coleção institucional', async () => {
    const db = ctxFor(INACTIVE_EMAIL).firestore();
    await assertFails(getDocs(collection(db, 'schools')));
    await assertFails(getDocs(collection(db, 'grades')));
  });

  it('superintendente não consegue alterar escola de outro responsável', async () => {
    const db = ctxFor(ACTIVE_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'schools', 'escola-b-teste'), { matriculas: 999 }));
  });

  it('superintendente autorizado consegue alterar escola vinculada a ele', async () => {
    const db = ctxFor(ACTIVE_EMAIL).firestore();
    await assertSucceeds(updateDoc(doc(db, 'schools', 'escola-a-teste'), {
      nome: ESCOLA_A, codInep: '00000001', cidade: 'Fortaleza',
      matriculas: 150, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    }));
  });

  it('usuário comum não consegue se promover a administrador', async () => {
    const db = ctxFor(ACTIVE_EMAIL).firestore();
    await assertFails(updateDoc(doc(db, 'superintendentes', ACTIVE_EMAIL), {
      nome: 'Superintendente Ativo (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_EMAIL, escolas: [ESCOLA_A], ativo: true, role: 'admin',
    }));
  });

  it('somente administrador autorizado gerencia a coleção superintendentes', async () => {
    await assertFails(getDocs(collection(ctxFor(STRANGER_EMAIL).firestore(), 'superintendentes')));

    await assertFails(setDoc(doc(ctxFor(ACTIVE_EMAIL).firestore(), 'superintendentes', 'novo@example.com'), {
      nome: 'Novo Superintendente (Teste)', cargo: 'Superintendente Regional',
      email: 'novo@example.com', escolas: [], ativo: true,
    }));

    await assertSucceeds(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'superintendentes', 'novo@example.com'), {
      nome: 'Novo Superintendente (Teste)', cargo: 'Superintendente Regional',
      email: 'novo@example.com', escolas: [], ativo: true,
    }));
  });

  describe('campo ativo — fail-closed', () => {
    it('documento sem o campo ativo não consegue acessar', async () => {
      const db = ctxFor(NO_ATIVO_FIELD_EMAIL).firestore();
      await assertFails(getDocs(collection(db, 'schools')));
      await assertFails(getDocs(collection(db, 'grades')));
    });

    it('ativo: false não consegue acessar', async () => {
      const db = ctxFor(INACTIVE_EMAIL).firestore();
      await assertFails(getDocs(collection(db, 'schools')));
    });

    it('ativo: true consegue acessar', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(getDocs(collection(db, 'schools')));
    });

    it('usuário não cadastrado continua bloqueado', async () => {
      const db = ctxFor(STRANGER_EMAIL).firestore();
      await assertFails(getDocs(collection(db, 'schools')));
    });

    it('admin não consegue criar superintendente sem declarar ativo explicitamente', async () => {
      await assertFails(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'superintendentes', 'sem-ativo@example.com'), {
        nome: 'Sem Ativo (Teste)', cargo: 'Superintendente Regional',
        email: 'sem-ativo@example.com', escolas: [],
      }));
    });
  });

  it('leitura e escrita em grades respeitam a autorização', async () => {
    await assertFails(getDocs(collection(ctxFor(null).firestore(), 'grades')));
    await assertFails(getDocs(collection(ctxFor(STRANGER_EMAIL).firestore(), 'grades')));
    await assertSucceeds(getDocs(collection(ctxFor(ACTIVE_EMAIL).firestore(), 'grades')));

    await assertFails(setDoc(doc(ctxFor(STRANGER_EMAIL).firestore(), 'grades', 'nota-teste-2'), {
      nome: 'Aluno Fictício Dois', turma: 'Turma Teste',
      portugues: 8, matematica: 8, ciencias: 8, bimestre: '1º Bimestre',
    }));
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_EMAIL).firestore(), 'grades', 'nota-teste-2'), {
      nome: 'Aluno Fictício Dois', turma: 'Turma Teste',
      portugues: 8, matematica: 8, ciencias: 8, bimestre: '1º Bimestre',
    }));
  });

  it('exclusões indevidas são bloqueadas', async () => {
    const activeDb = ctxFor(ACTIVE_EMAIL).firestore();
    await assertFails(deleteDoc(doc(activeDb, 'schools', 'escola-a-teste')));
    await assertFails(deleteDoc(doc(activeDb, 'grades', 'nota-teste-1')));
    await assertFails(deleteDoc(doc(activeDb, 'superintendentes', ACTIVE_EMAIL)));

    const adminDb = ctxFor(ADMIN_EMAIL).firestore();
    await assertSucceeds(deleteDoc(doc(adminDb, 'schools', 'escola-a-teste')));
  });

  describe('SCHOOLS — cobertura adicional', () => {
    it('administrador cria escola válida', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'schools', 'escola-c-teste'), {
        nome: 'Escola C - Teste', codInep: '00000003', cidade: 'Fortaleza',
        matriculas: 50, idebMedio: 5.5, metaIdeb: 6.0, status: 'Ativo',
      }));
    });

    it('usuário comum não cria escola', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(setDoc(doc(db, 'schools', 'escola-c-teste'), {
        nome: 'Escola C - Teste', codInep: '00000003', cidade: 'Fortaleza',
        matriculas: 50, idebMedio: 5.5, metaIdeb: 6.0, status: 'Ativo',
      }));
    });
  });

  describe('TURMAS', () => {
    it('responsável cria turma de escola atribuída', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'turmas', 'turma-a-nova'), {
        escolaId: 'escola-a-teste', escolaNome: ESCOLA_A, nome: 'Turma A Nova - Teste',
        ano: '2º Ano', periodo: 'Tarde', alunosSinalizados: 0,
      }));
    });

    it('responsável atualiza turma de escola atribuída', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(updateDoc(doc(db, 'turmas', 'turma-a-teste'), {
        escolaId: 'escola-a-teste', escolaNome: ESCOLA_A, nome: 'Turma A - Teste',
        ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 3,
      }));
    });

    it('responsável não altera turma de outra escola', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'turmas', 'turma-b-teste'), {
        escolaId: 'escola-b-teste', escolaNome: ESCOLA_B, nome: 'Turma B - Teste',
        ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 3,
      }));
    });

    it('exclusão indevida é bloqueada', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(deleteDoc(doc(db, 'turmas', 'turma-b-teste')));
    });
  });

  describe('VISITAS', () => {
    it('responsável cria visita vinculada à sua escola', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'visitas', 'visita-a-nova'), {
        escola: ESCOLA_A, tecnico: 'Técnico Novo Teste', data: '2026-02-01',
        foco: 'Foco Novo de Teste', status: 'Agendada',
      }));
    });

    it('responsável atualiza visita vinculada à sua escola', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(updateDoc(doc(db, 'visitas', 'visita-a-teste'), {
        escola: ESCOLA_A, tecnico: 'Técnico Teste', data: '2026-01-10',
        foco: 'Foco de Teste', status: 'Realizada',
      }));
    });

    it('responsável não altera visita de outra escola', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'visitas', 'visita-b-teste'), {
        escola: ESCOLA_B, tecnico: 'Técnico Teste', data: '2026-01-10',
        foco: 'Foco de Teste', status: 'Realizada',
      }));
    });

    it('exclusão indevida é bloqueada', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(deleteDoc(doc(db, 'visitas', 'visita-b-teste')));
    });
  });

  describe('SUPERINTENDENTES — cobertura adicional', () => {
    it('administrador raiz consegue excluir um registro', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertSucceeds(deleteDoc(doc(db, 'superintendentes', INACTIVE_EMAIL)));
    });

    it('usuário comum não consegue excluir', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(deleteDoc(doc(db, 'superintendentes', INACTIVE_EMAIL)));
    });

    it('superintendente com escolas: [] não consegue escrever em nenhuma escola', async () => {
      const db = ctxFor(EMPTY_ESCOLAS_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'schools', 'escola-a-teste'), { matriculas: 999 }));
      await assertFails(updateDoc(doc(db, 'schools', 'escola-b-teste'), { matriculas: 999 }));
    });
  });

  describe('GRADES — Opção C (superintendente ativo, sem isolamento por escola)', () => {
    it('superintendente ativo consegue ler', async () => {
      await assertSucceeds(getDocs(collection(ctxFor(ACTIVE_EMAIL).firestore(), 'grades')));
    });

    it('superintendente ativo consegue criar e atualizar', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'grades', 'nota-teste-opcao-c'), {
        nome: 'Aluno Fictício Opção C', turma: 'Turma Teste',
        portugues: 6, matematica: 6, ciencias: 6, bimestre: '1º Bimestre',
      }));
      await assertSucceeds(updateDoc(doc(db, 'grades', 'nota-teste-1'), {
        nome: 'Aluno Fictício Um', turma: 'Turma Teste',
        portugues: 8, matematica: 8, ciencias: 8, bimestre: '1º Bimestre',
      }));
    });

    it('superintendente inativo não lê nem escreve', async () => {
      const db = ctxFor(INACTIVE_EMAIL).firestore();
      await assertFails(getDocs(collection(db, 'grades')));
      await assertFails(setDoc(doc(db, 'grades', 'nota-teste-inativo'), {
        nome: 'Aluno Fictício Inativo', turma: 'Turma Teste',
        portugues: 5, matematica: 5, ciencias: 5, bimestre: '1º Bimestre',
      }));
    });

    it('conta Google não cadastrada não lê nem escreve', async () => {
      const db = ctxFor(STRANGER_EMAIL).firestore();
      await assertFails(getDocs(collection(db, 'grades')));
      await assertFails(setDoc(doc(db, 'grades', 'nota-teste-estranho'), {
        nome: 'Aluno Fictício Estranho', turma: 'Turma Teste',
        portugues: 5, matematica: 5, ciencias: 5, bimestre: '1º Bimestre',
      }));
    });

    it('usuário sem campo ativo não lê nem escreve', async () => {
      const db = ctxFor(NO_ATIVO_FIELD_EMAIL).firestore();
      await assertFails(getDocs(collection(db, 'grades')));
      await assertFails(setDoc(doc(db, 'grades', 'nota-teste-sem-ativo'), {
        nome: 'Aluno Fictício Sem Ativo', turma: 'Turma Teste',
        portugues: 5, matematica: 5, ciencias: 5, bimestre: '1º Bimestre',
      }));
    });
  });
});
