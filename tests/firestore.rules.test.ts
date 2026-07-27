// Testes das Firestore Security Rules oficiais (firestore.rules) usando o
// Firebase Emulator. Roda 100% local — nunca toca dados de produção. Nenhum
// nome ou nota de estudante real é usado; todos os dados abaixo são
// sintéticos, criados só para este teste.
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

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com'; // admin raiz (isPlatformAdmin)
const CADASTRO_ADMIN_EMAIL = 'admin.cadastrado@example.com'; // admin não-raiz, cadastrado
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

    // Documento do admin raiz — precisa existir para testar as proteções
    // (root não pode ser rebaixado/desativado/excluído) contra dado real,
    // em vez de falhar só por "documento inexistente".
    await setDoc(doc(db, 'superintendentes', ADMIN_EMAIL), {
      id: 'root', nome: 'Admin Raiz (Teste)', cargo: 'Superintendente de Regulação Seduc',
      email: ADMIN_EMAIL, escolas: [], ativo: true, role: 'admin',
    });
    await setDoc(doc(db, 'superintendentes', CADASTRO_ADMIN_EMAIL), {
      id: 'admin-cadastrado', nome: 'Admin Cadastrado (Teste)', cargo: 'Superintendente Regional',
      email: CADASTRO_ADMIN_EMAIL, escolas: [], ativo: true, role: 'admin',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_EMAIL), {
      id: 'super-ativo', nome: 'Superintendente Ativo (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_EMAIL, escolas: [ESCOLA_A], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', INACTIVE_EMAIL), {
      id: 'super-inativo', nome: 'Superintendente Inativo (Teste)', cargo: 'Superintendente Regional',
      email: INACTIVE_EMAIL, escolas: [ESCOLA_B], ativo: false, role: 'superintendent',
    });
    // Documento antigo, anterior à existência dos campos ativo/role — simula
    // um registro real de produção que ainda não passou pela migração.
    await setDoc(doc(db, 'superintendentes', NO_ATIVO_FIELD_EMAIL), {
      id: 'super-legado', nome: 'Superintendente Legado (Teste)', cargo: 'Superintendente Regional',
      email: NO_ATIVO_FIELD_EMAIL, escolas: [ESCOLA_B],
    });
    // Ativo, mas sem nenhuma escola atribuída — não deve conseguir escrever
    // em escola nenhuma (myEscolas() vazio).
    await setDoc(doc(db, 'superintendentes', EMPTY_ESCOLAS_EMAIL), {
      id: 'super-sem-escolas', nome: 'Superintendente Sem Escolas (Teste)', cargo: 'Superintendente Regional',
      email: EMPTY_ESCOLAS_EMAIL, escolas: [], ativo: true, role: 'superintendent',
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

// Payload mínimo válido de superintendentes, com overrides pontuais por teste.
function superPayload(email: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'novo-teste',
    nome: 'Novo Superintendente (Teste)',
    cargo: 'Superintendente Regional',
    email,
    escolas: [ESCOLA_A],
    ativo: true,
    role: 'superintendent',
    ...overrides,
  };
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
    await assertFails(updateDoc(doc(db, 'superintendentes', ACTIVE_EMAIL),
      superPayload(ACTIVE_EMAIL, { id: 'super-ativo', role: 'admin' })));
  });

  it('somente administrador autorizado gerencia a coleção superintendentes', async () => {
    await assertFails(getDocs(collection(ctxFor(STRANGER_EMAIL).firestore(), 'superintendentes')));

    await assertFails(setDoc(doc(ctxFor(ACTIVE_EMAIL).firestore(), 'superintendentes', 'novo@example.com'),
      superPayload('novo@example.com')));

    await assertSucceeds(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'superintendentes', 'novo@example.com'),
      superPayload('novo@example.com')));
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
      const payload = superPayload('sem-ativo@example.com');
      delete (payload as any).ativo;
      await assertFails(setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'superintendentes', 'sem-ativo@example.com'), payload));
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

    it('superintendente não altera o nome da escola por update comum', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'schools', 'escola-a-teste'), {
        nome: 'Nome Divergente Qualquer', codInep: '00000001', cidade: 'Fortaleza',
        matriculas: 150, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
      }));
    });

    it('superintendente não altera o código INEP da escola por update comum', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'schools', 'escola-a-teste'), {
        nome: ESCOLA_A, codInep: '99999999', cidade: 'Fortaleza',
        matriculas: 150, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
      }));
    });

    it('administrador também não altera a identidade (nome/codInep) por update comum', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'schools', 'escola-a-teste'), {
        nome: 'Nome Divergente Qualquer', codInep: '00000001', cidade: 'Fortaleza',
        matriculas: 150, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
      }));
      await assertFails(updateDoc(doc(db, 'schools', 'escola-a-teste'), {
        nome: ESCOLA_A, codInep: '99999999', cidade: 'Fortaleza',
        matriculas: 150, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
      }));
    });

    it('atualização de indicadores permitidos (não identitários) continua funcionando', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(updateDoc(doc(db, 'schools', 'escola-a-teste'), {
        nome: ESCOLA_A, codInep: '00000001', cidade: 'Fortaleza',
        matriculas: 812, idebMedio: 6.3, metaIdeb: 6.6, status: 'Ativo',
      }));
    });
  });

  describe('TURMAS', () => {
    it('responsável cria turma de escola atribuída', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'turmas', 'turma-a-nova'), {
        schoolId: 'escola-a-teste', escolaId: 'escola-a-teste', escolaNome: ESCOLA_A,
        codInep: '00000001', anoLetivo: 2026, nome: 'Turma A Nova - Teste',
        ano: '2º Ano', periodo: 'Tarde', alunosSinalizados: 0,
        matriculaInicial: 0, matriculaAtual: 0,
        createdAt: '2026-01-05T00:00:00.000Z', createdBy: ACTIVE_EMAIL,
        updatedAt: '2026-01-05T00:00:00.000Z', updatedBy: ACTIVE_EMAIL,
      }));
    });

    it('responsável atualiza turma de escola atribuída (turma legada, sem enriquecer campos novos)', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertSucceeds(updateDoc(doc(db, 'turmas', 'turma-a-teste'), {
        escolaId: 'escola-a-teste', escolaNome: ESCOLA_A, nome: 'Turma A - Teste',
        ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 3,
        updatedAt: '2026-01-06T00:00:00.000Z', updatedBy: ACTIVE_EMAIL,
      }));
    });

    it('responsável não altera turma de outra escola', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'turmas', 'turma-b-teste'), {
        escolaId: 'escola-b-teste', escolaNome: ESCOLA_B, nome: 'Turma B - Teste',
        ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 3,
        updatedAt: '2026-01-06T00:00:00.000Z', updatedBy: ACTIVE_EMAIL,
      }));
    });

    it('superintendente comum não exclui turma — só admin raiz', async () => {
      const activeDb = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(deleteDoc(doc(activeDb, 'turmas', 'turma-a-teste')));
      const adminDb = ctxFor(ADMIN_EMAIL).firestore();
      await assertSucceeds(deleteDoc(doc(adminDb, 'turmas', 'turma-a-teste')));
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

  describe('SUPERINTENDENTES — hierarquia raiz / admin cadastrado / superintendent (Fase 1C)', () => {
    it('root cria superintendent', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'superintendentes', 'novo-super@example.com'),
        superPayload('novo-super@example.com', { role: 'superintendent' })));
    });

    it('root cria admin', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'superintendentes', 'novo-admin@example.com'),
        superPayload('novo-admin@example.com', { role: 'admin', escolas: [] })));
    });

    it('admin cadastrado cria superintendent', async () => {
      const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'superintendentes', 'novo-super2@example.com'),
        superPayload('novo-super2@example.com', { role: 'superintendent' })));
    });

    it('admin cadastrado não cria admin', async () => {
      const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
      await assertFails(setDoc(doc(db, 'superintendentes', 'novo-admin2@example.com'),
        superPayload('novo-admin2@example.com', { role: 'admin', escolas: [] })));
    });

    it('admin cadastrado não promove usuário', async () => {
      const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'superintendentes', ACTIVE_EMAIL),
        superPayload(ACTIVE_EMAIL, { id: 'super-ativo', role: 'admin', escolas: [] })));
    });

    it('admin cadastrado não rebaixa admin', async () => {
      const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'superintendentes', ADMIN_EMAIL),
        superPayload(ADMIN_EMAIL, { id: 'root', role: 'superintendent' })));
    });

    it('admin cadastrado não edita outro admin', async () => {
      const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'superintendentes', ADMIN_EMAIL),
        superPayload(ADMIN_EMAIL, { id: 'root', role: 'admin', escolas: [] })));
    });

    it('admin cadastrado não exclui usuário', async () => {
      const db = ctxFor(CADASTRO_ADMIN_EMAIL).firestore();
      await assertFails(deleteDoc(doc(db, 'superintendentes', ACTIVE_EMAIL)));
    });

    it('superintendent não cria usuário', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(setDoc(doc(db, 'superintendentes', 'outro@example.com'),
        superPayload('outro@example.com')));
    });

    it('superintendent não edita a si próprio', async () => {
      const db = ctxFor(ACTIVE_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'superintendentes', ACTIVE_EMAIL),
        superPayload(ACTIVE_EMAIL, { id: 'super-ativo', escolas: [ESCOLA_A, ESCOLA_B] })));
    });

    it('usuário inativo não acessa', async () => {
      await assertFails(getDocs(collection(ctxFor(INACTIVE_EMAIL).firestore(), 'schools')));
    });

    it('documento com role inválida é rejeitado', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertFails(setDoc(doc(db, 'superintendentes', 'role-invalida@example.com'),
        superPayload('role-invalida@example.com', { role: 'super-admin' })));
    });

    it('documento sem ativo é rejeitado', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      const payload = superPayload('sem-ativo2@example.com');
      delete (payload as any).ativo;
      await assertFails(setDoc(doc(db, 'superintendentes', 'sem-ativo2@example.com'), payload));
    });

    it('documento sem role é rejeitado', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      const payload = superPayload('sem-role@example.com');
      delete (payload as any).role;
      await assertFails(setDoc(doc(db, 'superintendentes', 'sem-role@example.com'), payload));
    });

    it('documento com e-mail diferente do ID é rejeitado', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertFails(setDoc(doc(db, 'superintendentes', 'id-correto@example.com'),
        superPayload('email-diferente@example.com')));
    });

    it('superintendent sem escola é rejeitado', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertFails(setDoc(doc(db, 'superintendentes', 'sem-escola@example.com'),
        superPayload('sem-escola@example.com', { role: 'superintendent', escolas: [] })));
    });

    it('admin com escolas vazias é permitido', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertSucceeds(setDoc(doc(db, 'superintendentes', 'admin-global@example.com'),
        superPayload('admin-global@example.com', { role: 'admin', escolas: [] })));
    });

    it('root não pode ser desativado', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertFails(updateDoc(doc(db, 'superintendentes', ADMIN_EMAIL),
        superPayload(ADMIN_EMAIL, { id: 'root', role: 'admin', escolas: [], ativo: false })));
    });

    it('root não pode ser excluído', async () => {
      const db = ctxFor(ADMIN_EMAIL).firestore();
      await assertFails(deleteDoc(doc(db, 'superintendentes', ADMIN_EMAIL)));
    });
  });
});
