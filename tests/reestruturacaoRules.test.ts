// Reestruturação SIFEC — regras das sete coleções novas (bimonthly_enrollments,
// farol_estudante, recomposicao_planos, cdg_planos, cdg_tarefas,
// parecer_bimestral_notas, grade_entry_monitoring_disciplina — esta última
// adicionada na auditoria da reestruturação para a dimensão turma+
// disciplina do Acompanhamento de Notas), usando o Firebase Emulator (100%
// local), mesmo padrão de tests/gradeEntryMonitoringRules.test.ts. Cobertura
// enxuta e focada nos limites de segurança reais: criação autorizada,
// bloqueio cross-escola, e o modelo de exclusão de cada coleção — admin-only
// para as com ID determinístico, e TAMBÉM admin-only para farol_estudante
// (correção final da auditoria, seção 2: dado nominal nunca pode ser
// excluído fisicamente por um superintendente comum, mesmo o da própria
// escola — o caminho normal passa a ser arquivar via update de
// statusRegistro); recomposicao_planos/cdg_tarefas continuam permitindo
// exclusão física ao superintendente da própria escola (não são dado
// nominal, são listas de trabalho comuns).
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
      statusRegistro: 'ativo',
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

  // Correção final da auditoria da reestruturação, seção 2: "exclusão
  // bloqueada para usuário comum" — a versão anterior desta regra permitia
  // delete físico para o superintendente da própria escola (canWriteEscola);
  // corrigido para isPlatformAdmin() apenas. O caminho normal para "remover
  // da lista de trabalho" passa a ser arquivar (update de statusRegistro).
  it('exclusão física é SEMPRE bloqueada para superintendente comum, mesmo da própria escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
    });
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_B_EMAIL).firestore(), 'farol_estudante', 'farol-1')));
    await assertFails(deleteDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1')));
  });

  it('exclusão física permitida ao admin raiz, em manutenção excepcional', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
    });
    await assertSucceeds(deleteDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'farol_estudante', 'farol-1')));
  });

  it('arquivamento (update de statusRegistro) é permitido ao superintendente da própria escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
    });
    await assertSucceeds(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1'), {
        statusRegistro: 'arquivado', updatedAt: '2026-03-20T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
      })
    );
  });

  it('arquivamento é bloqueado para superintendente de outra escola', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
    });
    await assertFails(
      updateDoc(doc(ctxFor(ACTIVE_B_EMAIL).firestore(), 'farol_estudante', 'farol-1'), {
        statusRegistro: 'arquivado', updatedAt: '2026-03-20T00:00:00.000Z', updatedBy: ACTIVE_B_EMAIL,
      })
    );
  });

  it('statusRegistro fora do enum ["ativo", "arquivado"] é rejeitado', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-registro'), payload({ id: 'farol-registro', statusRegistro: 'deletado' })));
  });

  it('consulta continua obrigatoriamente filtrada por schoolId (leitura de outra escola bloqueada mesmo após arquivamento)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload({ statusRegistro: 'arquivado' }));
    });
    await assertFails(getDocs(collection(ctxFor(ACTIVE_B_EMAIL).firestore(), 'farol_estudante')));
    await assertSucceeds(getDocs(query(collection(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante'), where('schoolId', '==', SCHOOL_A_ID))));
  });

  // Correção do code review do PR #19, seção 3: a versão anterior travava
  // só turmaId no update, deixando turmaNome livre para reescrita — um
  // update podia manter o turmaId antigo mas trocar o nome exibido. Data de
  // referência também endurecida (regex de calendário, não só tamanho).
  describe('integridade canônica da turma no update', () => {
    it('update válido (sem tocar na identidade da turma) é permitido', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
      });
      await assertSucceeds(
        updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1'), {
          percentualAcerto: 10, updatedAt: '2026-03-12T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('alteração de turmaId no update é rejeitada, mesmo para uma turma real da mesma escola', async () => {
      const outraTurmaId = 'turma-outra-mesma-escola';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
        await setDoc(doc(context.firestore(), 'turmas', outraTurmaId), {
          schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
          nome: 'Turma A - Teste', ano: '1º Ano', periodo: 'Tarde', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
        });
      });
      await assertFails(
        updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1'), {
          turmaId: outraTurmaId, updatedAt: '2026-03-12T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('alteração de turmaNome no update é rejeitada, mesmo mantendo o turmaId original', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
      });
      await assertFails(
        updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1'), {
          turmaNome: '3º Ano B - Vespertino', updatedAt: '2026-03-12T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });

    it('arquivamento válido (statusRegistro) continua permitido depois do endurecimento da integridade de turma', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'farol_estudante', 'farol-1'), payload());
      });
      await assertSucceeds(
        updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-1'), {
          statusRegistro: 'arquivado', updatedAt: '2026-03-20T00:00:00.000Z', updatedBy: ACTIVE_A_EMAIL,
        })
      );
    });
  });

  describe('integridade canônica da turma na criação', () => {
    it('nome semelhante, mas não idêntico ao nome real da turma, é rejeitado', async () => {
      await assertFails(
        setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-nome-parecido'), payload({
          id: 'farol-nome-parecido', turmaNome: 'Turma A -Teste',
        }))
      );
    });

    it('turma real, mas de outro ano letivo, é rejeitada', async () => {
      const turmaOutroAnoId = 'turma-outro-ano-farol';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'turmas', turmaOutroAnoId), {
          schoolId: SCHOOL_A_ID, escolaId: SCHOOL_A_ID, escolaNome: ESCOLA_A,
          nome: 'Turma Ano Anterior', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO - 1,
        });
      });
      await assertFails(
        setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-outro-ano'), payload({
          id: 'farol-outro-ano', turmaId: turmaOutroAnoId, turmaNome: 'Turma Ano Anterior',
        }))
      );
    });

    it('turma real, mas de outra escola, é rejeitada', async () => {
      const turmaOutraEscolaId = 'turma-outra-escola-farol';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'turmas', turmaOutraEscolaId), {
          schoolId: SCHOOL_B_ID, escolaId: SCHOOL_B_ID, escolaNome: ESCOLA_B,
          nome: 'Turma Escola B', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
        });
      });
      await assertFails(
        setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-outra-escola'), payload({
          id: 'farol-outra-escola', turmaId: turmaOutraEscolaId, turmaNome: 'Turma Escola B',
        }))
      );
    });
  });

  // Correção do code review do PR #19, seção 4: a checagem anterior só
  // media o tamanho da string (10 caracteres) — "2026-99-99" também tinha
  // 10 caracteres e passava.
  describe('validação da data de referência', () => {
    it('formato correto (AAAA-MM-DD) é aceito', async () => {
      await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-data-ok'), payload({ id: 'farol-data-ok', referenceDate: '2026-03-08' })));
    });

    it('mês fora de 01-12 é rejeitado, mesmo com 10 caracteres', async () => {
      await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-data-mes'), payload({ id: 'farol-data-mes', referenceDate: '2026-99-10' })));
    });

    it('dia fora de 01-31 é rejeitado, mesmo com 10 caracteres', async () => {
      await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-data-dia'), payload({ id: 'farol-data-dia', referenceDate: '2026-03-99' })));
    });

    it('formato diferente de AAAA-MM-DD (com barras) é rejeitado', async () => {
      await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'farol_estudante', 'farol-data-formato'), payload({ id: 'farol-data-formato', referenceDate: '08/03/2026' })));
    });
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
  // Correção final da auditoria, seção 3: disciplina deixou de ser uma
  // lista fechada de 4 áreas — disciplinaId (chave normalizada) +
  // disciplinaNome (texto livre) + areaConhecimento (opcional).
  function payload(overrides: Record<string, unknown> = {}) {
    return {
      id: `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`,
      schoolId: SCHOOL_A_ID, codInep: '00000601', escolaNome: ESCOLA_A,
      turmaId: TURMA_A_ID, turmaNome: 'Turma A - Teste',
      anoLetivo: ANO_LETIVO, bimestre: 1, disciplinaId: 'matematica', disciplinaNome: 'Matemática',
      areaConhecimento: 'Matemática',
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

  // Nunca limitado a 4 disciplinas — História/Geografia/Física/Química/
  // Biologia/Filosofia/Sociologia/Língua Inglesa são todas aceitas.
  it('aceita qualquer disciplina real (nunca limitada a 4 áreas fixas)', async () => {
    const casos: Array<{ nome: string; id: string }> = [
      { nome: 'História', id: 'historia' },
      { nome: 'Geografia', id: 'geografia' },
      { nome: 'Física', id: 'fisica' },
      { nome: 'Química', id: 'quimica' },
      { nome: 'Educação Física', id: 'educacao-fisica' },
    ];
    for (const caso of casos) {
      const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_${caso.id}`;
      // Firestore setDoc() rejeita `undefined` como valor de campo (mesmo
      // cuidado de stripUndefinedDeep em auditService.ts) — nunca passar
      // `areaConhecimento: undefined` no overrides; omitir a chave inteira.
      const { areaConhecimento: _unused, ...base } = payload({ id, disciplinaId: caso.id, disciplinaNome: caso.nome });
      await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), base));
    }
  });

  it('ID precisa bater com schoolId_anoLetivo_bBimestre_turmaId_disciplinaId', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', 'id-errado'), payload()));
  });

  it('disciplinaId fora do formato de chave normalizada (maiúscula/espaço/acento) é rejeitado', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_Matemática`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ id, disciplinaId: 'Matemática' })));
  });

  it('disciplinaNome vazio é rejeitado', async () => {
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`), payload({ disciplinaNome: '' })));
  });

  it('areaConhecimento fora do enum é rejeitada; ausência de areaConhecimento é aceita', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ areaConhecimento: 'Artes Marciais' })));
    const { areaConhecimento: _unused, ...semArea } = payload();
    await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), semArea));
  });

  it('lançamentos realizados maiores que os esperados é rejeitado', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ expectedGradeEntries: 10, completedGradeEntries: 20 })));
  });

  it('turma que não existe (ou de outra escola) é rejeitada — integridade canônica', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_turma-inexistente_matematica`;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ id, turmaId: 'turma-inexistente' })));
  });

  it('update não pode trocar disciplinaId/disciplinaNome/turma/identidade da escola — mas pode reclassificar areaConhecimento', async () => {
    const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'grade_entry_monitoring_disciplina', id), payload());
    });
    await assertFails(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), { disciplinaId: 'matematica2' })
    );
    await assertFails(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), { disciplinaNome: 'Matemática Financeira' })
    );
    await assertSucceeds(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), { completedGradeEntries: 32, updatedAt: '2026-03-12T00:00:00.000Z' })
    );
    await assertSucceeds(
      updateDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), { areaConhecimento: 'Ciências Humanas', updatedAt: '2026-03-12T00:00:00.000Z' })
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

  // Correção do code review do PR #19, seção 5: entryId é uma chave
  // composta (schoolId_ano_bBimestre_turmaId_disciplinaId) que pode
  // ultrapassar 128 caracteres mesmo com cada componente dentro do próprio
  // limite — isValidId() rejeitaria isso incorretamente. isValidGradeDisciplineCompositeId
  // usa um teto mais alto (512), mas nunca deixa de exigir igualdade exata
  // com a chave composta nem aceita caracteres inseguros.
  describe('isValidGradeDisciplineCompositeId — ID composto longo', () => {
    it('ID comum (curto) continua permitido', async () => {
      const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_matematica`;
      await assertSucceeds(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ id })));
    });

    it('combinação próxima do tamanho máximo permitido (schoolId/turmaId longos) é aceita', async () => {
      const longSchoolId = 'escola-' + 'a'.repeat(110); // <= 128
      const longTurmaId = 'turma-' + 'b'.repeat(110); // <= 128
      const id = `${longSchoolId}_${ANO_LETIVO}_b1_${longTurmaId}_matematica`;
      expect(id.length).toBeLessThanOrEqual(512);
      expect(id.length).toBeGreaterThan(128);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schools', longSchoolId), {
          nome: 'Escola Longa - Teste', codInep: '00000699', cidade: 'Fortaleza',
          matriculas: 100, idebMedio: 6.0, metaIdeb: 6.5, status: 'Ativo',
        });
        await setDoc(doc(context.firestore(), 'turmas', longTurmaId), {
          schoolId: longSchoolId, escolaId: longSchoolId, escolaNome: 'Escola Longa - Teste',
          nome: 'Turma Longa - Teste', ano: '1º Ano', periodo: 'Manhã', alunosSinalizados: 0, anoLetivo: ANO_LETIVO,
        });
        await setDoc(doc(context.firestore(), 'superintendentes', 'super.longa@example.com'), {
          id: 'super-longa', nome: 'Superintendente Longa (Teste)', cargo: 'Superintendente Regional',
          email: 'super.longa@example.com', escolas: ['Escola Longa - Teste'], ativo: true, role: 'superintendent',
        });
      });
      await assertSucceeds(
        setDoc(
          doc(ctxFor('super.longa@example.com').firestore(), 'grade_entry_monitoring_disciplina', id),
          payload({
            id, schoolId: longSchoolId, codInep: '00000699', escolaNome: 'Escola Longa - Teste',
            turmaId: longTurmaId, turmaNome: 'Turma Longa - Teste',
          })
        )
      );
    });

    it('ID maior que o limite conservador (512) é rejeitado', async () => {
      const hugeId = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_` + 'x'.repeat(500);
      expect(hugeId.length).toBeGreaterThan(512);
      await assertFails(
        setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', hugeId), payload({ id: hugeId, disciplinaId: 'x'.repeat(500) }))
      );
    });

    // Um "/" literal é estruturalmente impossível num ID de documento do
    // Firestore (é separador de caminho — o próprio SDK cliente trataria
    // como sub-caminho, não como parte do ID). O charset de
    // isValidGradeDisciplineCompositeId (`^[a-zA-Z0-9_\-]+$`) bloqueia TODO
    // caractere fora de letras/dígitos/underscore/hífen — incluindo `.`,
    // que por si só já torna `..` (path traversal) estruturalmente
    // impossível. Este teste prova essa restrição de charset com um `.`.
    it('caractere de path (`.`) no disciplinaId torna o ID inválido — rejeitado', async () => {
      const idComPonto = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_mate.matica`;
      await assertFails(
        setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', idComPonto), payload({ id: idComPonto, disciplinaId: 'mate.matica' }))
      );
    });

    it('ID divergente da chave composta continua rejeitado mesmo dentro do novo limite de tamanho', async () => {
      const id = `${SCHOOL_A_ID}_${ANO_LETIVO}_b1_${TURMA_A_ID}_disciplina-errada`;
      await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'grade_entry_monitoring_disciplina', id), payload({ id, disciplinaId: 'matematica' })));
    });
  });
});

describe('Reestruturação SIFEC — audit_logs das sete coleções novas', () => {
  // Correção do code review do PR #19, seção 1: isSchoolScopedAuditCollection
  // não incluía nenhuma das sete coleções novas — um audit_log dessas
  // coleções só precisava de isAuthorized() (qualquer superintendente
  // cadastrado e ativo, de QUALQUER escola), nunca exigindo schoolId/codInep
  // válidos nem acesso de escrita àquela escola específica.
  const NEW_COLLECTIONS = [
    'bimonthly_enrollments', 'farol_estudante', 'recomposicao_planos',
    'cdg_planos', 'cdg_tarefas', 'parecer_bimestral_notas', 'grade_entry_monitoring_disciplina',
  ];

  function auditPayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 'log-1',
      collectionName: 'farol_estudante',
      documentId: 'doc-1',
      schoolId: SCHOOL_A_ID,
      codInep: '00000601',
      anoLetivo: ANO_LETIVO,
      operation: 'create',
      previousValue: null,
      newValue: { itemId: 'doc-1' },
      source: 'Manual',
      userId: ACTIVE_A_EMAIL,
      userEmail: ACTIVE_A_EMAIL,
      timestamp: '2026-03-10T00:00:00.000Z',
      ...overrides,
    };
  }

  it('superintendente da Escola A cria log da Escola A, para cada uma das sete coleções — helper protege igualmente todas', async () => {
    for (const collectionName of NEW_COLLECTIONS) {
      await assertSucceeds(
        setDoc(
          doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', `log-ok-${collectionName}`),
          auditPayload({ collectionName })
        )
      );
    }
  });

  it('não cria log da Escola B (schoolId de outra escola), para cada uma das sete coleções', async () => {
    for (const collectionName of NEW_COLLECTIONS) {
      await assertFails(
        setDoc(
          doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', `log-outra-escola-${collectionName}`),
          auditPayload({ collectionName, schoolId: SCHOOL_B_ID, codInep: '00000602' })
        )
      );
    }
  });

  it('não cria log com schoolId inexistente', async () => {
    await assertFails(
      setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', 'log-schoolid-inexistente'), auditPayload({ schoolId: 'escola-fantasma' }))
    );
  });

  it('não cria log com codInep divergente do real da escola', async () => {
    await assertFails(
      setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', 'log-codinep-divergente'), auditPayload({ codInep: '99999999' }))
    );
  });

  it('administrador raiz cria log válido para qualquer escola', async () => {
    await assertSucceeds(
      setDoc(doc(ctxFor(ADMIN_EMAIL).firestore(), 'audit_logs', 'log-admin'), auditPayload({ userId: ADMIN_EMAIL, userEmail: ADMIN_EMAIL }))
    );
  });

  it('usuário não autorizado (não cadastrado) não cria log', async () => {
    await assertFails(
      setDoc(doc(ctxFor(STRANGER_EMAIL).firestore(), 'audit_logs', 'log-estranho'), auditPayload({ userId: STRANGER_EMAIL, userEmail: STRANGER_EMAIL }))
    );
  });

  it('log escolar sem schoolId, ou sem codInep, é rejeitado', async () => {
    const fullPayload = auditPayload();
    const semSchoolId: Record<string, unknown> = { ...fullPayload };
    delete semSchoolId.schoolId;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', 'log-sem-schoolid'), semSchoolId));

    const semCodInep: Record<string, unknown> = { ...fullPayload };
    delete semCodInep.codInep;
    await assertFails(setDoc(doc(ctxFor(ACTIVE_A_EMAIL).firestore(), 'audit_logs', 'log-sem-codinep'), semCodInep));
  });
});
