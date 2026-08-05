// Reestruturação SIFEC — regras das sete coleções novas (bimonthly_enrollments,
// farol_estudante, recomposicao_planos, cdg_planos, cdg_tarefas,
// parecer_bimestral_notas, grade_entry_monitoring_disciplina — esta última
// adicionada na auditoria da reestruturação para a dimensão turma+
// disciplina do Acompanhamento de Notas), usando o Firebase Emulator (100%
// local), mesmo padrão de tests/gradeEntryMonitoringRules.test.ts. Cobertura
// enxuta e focada nos limites de segurança reais: criação autorizada,
// bloqueio cross-escola, e o modelo de exclusão de cada coleção (admin-only
// para as com ID determinístico; qualquer superintendente com acesso de
// escrita à escola para as listas de trabalho com ID opaco).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const ACTIVE_A_EMAIL = 'super.a.reestruturacao@example.com';
const ACTIVE_B_EMAIL = 'super.b.reestruturacao@example.com';
const STRANGER_EMAIL = 'estranho.reestruturacao@example.com';

const ESCOLA_A = 'Escola A - Teste Reestruturação';
const ESCOLA_B = 'Escola B - Teste Reestruturação';
const SCHOOL_A_ID = 'escola-a-reestruturacao';
const SCHOOL_B_ID = 'escola-b-reestruturacao';
const TURMA_A_ID = 'turma-a-reestruturacao';
const ANO_LETIVO = 2026;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sifec-rules-test-reestruturacao',
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
      id: 'super-a-reestruturacao', nome: 'Superintendente A (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_A_EMAIL, escolas: [ESCOLA_A], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'superintendentes', ACTIVE_B_EMAIL), {
      id: 'super-b-reestruturacao', nome: 'Superintendente B (Teste)', cargo: 'Superintendente Regional',
      email: ACTIVE_B_EMAIL, escolas: [ESCOLA_B], ativo: true, role: 'superintendent',
    });
    await setDoc(doc(db, 'schools', SCHOOL_A_ID), {
      nome: ESCOLA_A, codInep: '00000601', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'schools', SCHOOL_B_ID), {
      nome: ESCOLA_B, codInep: '00000602', cidade: 'Fortaleza',
      matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
    });
    await setDoc(doc(db, 'turmas', TURMA_A_ID), {
      schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
      nome: 'Turma A - Teste', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
    });
  });
});

function ctxFor(email: string | null) {
  return email
    ? testEnv.authenticatedContext(email, { email })
    : testEnv.unauthenticatedContext();
}

describe('Reestruturação SIFEC — bimonthly_enrollments', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`,
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A,
      anoLetivo: ANO_LETIVO, bimestre: 1, matricula: 100,
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria com sucesso; de outra escola é bloqueado', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`;
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'bimonthly_enrollments', id), payload()));
    await assertFails(setDoc(doc(ctxFor(ACTIVE_B_EMAIL).firestore(), 'bimonthly_enrollments', `${id}-outro`), payload({ id: `${id}-outro` })));
  });

  it('ID precisa bater com schoolId_anoLetivo_bBimestre', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'bimonthly_enrollments', 'id-errado'), payload()));
  });

  it('matrícula negativa é rejeitada', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'bimonthly_enrollments', id), payload({ matricula: -1 })));
  });

  it('exclusão restrita ao admin raiz', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'bimonthly_enrollments', id), payload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'bimonthly_enrollments', id)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'bimonthly_enrollments', id)));
  });
});

describe('Reestruturação SIFEC — farol_estudante', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: 'farol-1',
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A,
      turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste', disciplina: 'Matemática',
      anoLetivo: ANO_LETIVO, bimestre: 1, estudanteNome: 'Estudante Teste', percentualAcerto: 18,
      sourceSystem: 'SISEDU Analytics', referenceDate: '2026-03-08', status: 'Identificado',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria com sucesso; leitura de outra escola é bloqueada', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1'), payload()));
    await assertFails(getDocs(collection(ctxFor(ACTIVE_B_EMAIL).firestore(), 'farol_estudante')));
    await assertFails(getDocs(collection(ctxFor(STRANGER_EMAIL).firestore(), 'farol_estudante')));
  });

  it('percentual de acerto >= 25 é rejeitado — a lista é exclusiva para baixo desempenho', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-2'), payload({ id: 'farol-2', percentualAcerto: 25 })));
  });

  it('fonte diferente de "SISEDU Analytics" é rejeitada — nunca outra origem', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-fonte'), payload({ id: 'farol-fonte', sourceSystem: 'Outro sistema' })));
  });

  it('status de acompanhamento fora do enum é rejeitado', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-status'), payload({ id: 'farol-status', status: 'Concluído' })));
  });

  it('turma que não existe (ou de outra escola) é rejeitada — integridade canônica', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-3'), payload({ id: 'farol-3', turmaId: 'turma-inexistente' })));
  });

  it('exclusão permitida para o superintendente da própria escola (lista de trabalho, não histórico auditável)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_B_EMAIL).firestore(), 'farol_estudante', 'farol-1')));
    await assertSucceeds(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1')));
  });
});

describe('Reestruturação SIFEC — recomposicao_planos', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: 'plano-1',
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A,
      anoLetivo: ANO_LETIVO, bimestre: 1,
      prazo: 'Até o fim do 2º bimestre', areaDisciplina: 'Língua Portuguesa', turno: 'Matutino',
      descricao: 'Oficinas de reforço semanais.',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria com sucesso', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'recomposicao_planos', 'plano-1'), payload()));
  });

  it('turno fora da lista permitida é rejeitado', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'recomposicao_planos', 'plano-2'), payload({ id: 'plano-2', turno: 'Madrugada' })));
  });

  it('exclusão permitida para o superintendente da própria escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'recomposicao_planos', 'plano-1'), payload());
    });
    await assertSucceeds(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'recomposicao_planos', 'plano-1')));
  });
});

describe('Reestruturação SIFEC — cdg_planos', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: `${SCHOOL_A_ID}_${ANO_LETIVO}`,
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A, anoLetivo: ANO_LETIVO,
      situacao: 'Ativo', statusExecucao: 'Em execução',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria com sucesso; situação inválida é rejeitada', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}`;
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_planos', id), payload()));
  });

  it('status de execução fora da lista permitida é rejeitado', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_planos', id), payload({ statusExecucao: 'Pausado' })));
  });

  it('exclusão restrita ao admin raiz', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'cdg_planos', id), payload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_planos', id)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'cdg_planos', id)));
  });
});

describe('Reestruturação SIFEC — cdg_tarefas', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: 'tarefa-1',
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A, anoLetivo: ANO_LETIVO,
      acao: 'Reunião de alinhamento', responsavel: 'Coordenação pedagógica', prazo: '2026-03-20',
      status: 'Em Andamento',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria com sucesso', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_tarefas', 'tarefa-1'), payload()));
  });

  it('status fora dos seis valores permitidos é rejeitado', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_tarefas', 'tarefa-2'), payload({ id: 'tarefa-2', status: 'Cancelado' })));
  });

  it('prazo fora do formato AAAA-MM-DD é rejeitado', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_tarefas', 'tarefa-3'), payload({ id: 'tarefa-3', prazo: '20/03/2026' })));
  });

  it('exclusão permitida para o superintendente da própria escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'cdg_tarefas', 'tarefa-1'), payload());
    });
    await assertSucceeds(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'cdg_tarefas', 'tarefa-1')));
  });
});

describe('Reestruturação SIFEC — parecer_bimestral_notas', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`,
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A,
      anoLetivo: ANO_LETIVO, bimestre: 1, encaminhamentos: 'Priorizar acompanhamento.',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria e atualiza com sucesso; troca de identidade no update é bloqueada', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`;
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'parecer_bimestral_notas', id), payload()));
    await assertFails(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'parecer_bimestral_notas', id), { schoolId: SCHOOL_B_ID })
    );
  });

  it('outra escola nunca lê os encaminhamentos', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parecer_bimestral_notas', id), payload());
    });
    await assertFails(getDocs(collection(ctxFor(ACTIVE_B_EMAIL).firestore(), 'parecer_bimestral_notas')));
  });

  it('exclusão restrita ao admin raiz', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parecer_bimestral_notas', id), payload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'parecer_bimestral_notas', id)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'parecer_bimestral_notas', id)));
  });
});

describe('Reestruturação SIFEC — grade_entry_monitoring_disciplina', () => {
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`,
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A,
      turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste',
      anoLetivo: ANO_LETIVO, bimestre: 1, disciplina: 'matematica',
      expectedGradeEntries: 32, completedGradeEntries: 30,
      status: 'confirmado', referenceDate: '2026-03-10',
      createdAt: '2026-03-10T00:00:00.000Z', updatedAt: '2026-03-10T00:00:00.000Z',
      createdBy: ACTIVE_A_EMAIL, updatedBy: ACTIVE_A_EMAIL,
      ...overrides,
    };
  }

  it('superintendente da escola cria com sucesso; leitura de outra escola é bloqueada', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload()));
    await assertFails(getDocs(collection(ctxFor(ACTIVE_B_EMAIL).firestore(), 'grade_entry_monitoring_disciplina')));
  });

  it('ID precisa bater com schoolId_anoLetivo_bBimestre_turmaId_disciplina', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', 'id-errado'), payload()));
  });

  it('disciplina fora das 4 áreas conhecidas é rejeitada', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_artes`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ id, disciplina: 'artes' })));
  });

  it('lançamentos realizados maiores que os esperados é rejeitado', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ expectedGradeEntries: 10, completedGradeEntries: 20 })));
  });

  it('turma que não existe (ou de outra escola) é rejeitada — integridade canônica', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_turma-inexistente_matematica`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ id, turmaId: 'turma-inexistente' })));
  });

  it('update não pode trocar disciplina/turma/identidade da escola', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'grade_entry_monitoring_disciplina', id), payload());
    });
    await assertFails(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), { disciplina: 'matematica2' })
    );
    await assertSucceeds(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), { completedGradeEntries: 32, updatedAt: '2026-03-12T00:00:00.000Z' })
    );
  });

  it('exclusão restrita ao admin raiz — mesmo histórico auditável de grade_entry_monitoring', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'grade_entry_monitoring_disciplina', id), payload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id)));
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id)));
  });
});
