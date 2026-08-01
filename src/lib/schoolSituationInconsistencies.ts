// Fase 2D — Sala de Situação: inconsistências (seção 11 do plano).
// Extraído de schoolSituationCalculations.ts para manter os arquivos desta
// fase pequenos e focados. Só SINALIZA — nunca corrige nada automaticamente
// (o plano é explícito: "apenas sinalizar", ver seção 11).
//
// Revisão do code review do PR #16: (a) implementa matricula_final_divergente
// (seção 6), que existia no tipo mas nunca era detectada; (b) detecta
// documentos duplicados pela CHAVE NATURAL em school_years/
// school_flow_results/enrollment_snapshots/student_rosters/
// student_bimester_grades, inclusive quando um documento antigo tem ID não
// canônico (seção 7) — os IDs determinísticos impedem duplicidade para
// documentos criados por este app, mas não para um documento legado
// importado com outro esquema de ID; (c) toda verificação que depende de
// uma fonte agora é condicionada por `availability` — uma fonte que falhou
// nunca produz um diagnóstico (seção 3).
import type { EnrollmentSnapshot } from '../types/enrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { SchoolYear } from '../types/schoolYear';
import type { StudentBimesterGrade } from '../types/studentBimesterGrade';
import type { StudentRosterEntry } from '../types/studentRoster';
import type { SchoolSituationInconsistency, SchoolSituationSourceAvailability } from '../types/schoolSituation';
import { calculateMatriculaFimMes, hasEnrollmentDivergence } from './enrollmentCalculations';
import { calculateTotalResultados } from './schoolFlowCalculations';
import { normalizeSchoolName } from './schoolIdentity';

interface TurmaRefLike {
  id: string;
  schoolId?: string;
  escolaId?: string;
  anoLetivo?: number;
  nome: string;
}

export interface InconsistencyDetectionInput {
  schoolId: string;
  codInep: string;
  anoLetivo: number;
  turmasDoAno: readonly TurmaRefLike[];
  turmasById: ReadonlyMap<string, TurmaRefLike>;
  snapshots: readonly EnrollmentSnapshot[];
  roster: readonly StudentRosterEntry[];
  grades: readonly StudentBimesterGrade[];
  flowResult: SchoolFlowResult | null;
  // Disponibilidade das fontes desta escola (revisão do code review do PR
  // #16, seção 3) — nenhuma verificação abaixo roda a partir de uma fonte
  // com availability=false.
  availability: SchoolSituationSourceAvailability;
  // Listas de listagem própria (sem limit(1), ver schoolYearService/
  // schoolFlowService) só para detectar duplicidade pela chave natural
  // schoolId+anoLetivo — como a consulta já filtra por essa chave, mais de
  // um documento na lista já É a duplicidade.
  schoolYearDocs: readonly Pick<SchoolYear, 'id'>[];
  flowResultDocs: readonly Pick<SchoolFlowResult, 'id'>[];
}

// Agrupa por chave natural e sinaliza toda chave com mais de um documento —
// nunca escolhe silenciosamente um deles como se fosse único, nunca
// corrige/exclui nada (seção 7 do plano/revisão).
function pushNaturalKeyDuplicates<T>(
  inconsistencies: SchoolSituationInconsistency[],
  schoolId: string,
  sourceCollection: string,
  naturalKeyLabel: string,
  docs: readonly T[],
  keyOf: (doc: T) => string,
  idOf: (doc: T) => string
): void {
  const idsByKey = new Map<string, string[]>();
  for (const doc of docs) {
    const key = keyOf(doc);
    const ids = idsByKey.get(key) ?? [];
    ids.push(idOf(doc));
    idsByKey.set(key, ids);
  }
  for (const [key, ids] of idsByKey) {
    if (ids.length > 1) {
      inconsistencies.push({
        type: 'registro_duplicado',
        schoolId,
        message: `${ids.length} documentos duplicados em ${sourceCollection} para ${naturalKeyLabel}="${key}".`,
        details: ids.join(', '),
      });
    }
  }
}

export function detectInconsistencies(input: InconsistencyDetectionInput): SchoolSituationInconsistency[] {
  const {
    schoolId, codInep, anoLetivo, turmasDoAno, turmasById, snapshots, roster, grades, flowResult,
    availability, schoolYearDocs, flowResultDocs,
  } = input;
  const inconsistencies: SchoolSituationInconsistency[] = [];

  if (!codInep) {
    inconsistencies.push({
      type: 'cod_inep_ausente',
      schoolId,
      message: 'Escola sem código INEP cadastrado.',
    });
  }

  if (availability.snapshots) {
    // Turma referenciada pelo snapshot pertence a OUTRA escola, ou a um ano
    // letivo diferente do snapshot — turmasById é passado com a coleção de
    // turmas do ESCOPO VISÍVEL (não mais toda a base — ver seção 5 do
    // code review), então esta verificação cruzada só detecta uma
    // referência errada quando a turma real também está no escopo atual.
    for (const snap of snapshots) {
      const turma = turmasById.get(snap.turmaId);
      if (!turma) continue;
      const turmaSchoolId = turma.schoolId ?? turma.escolaId;
      if (turmaSchoolId != null && turmaSchoolId !== snap.schoolId) {
        inconsistencies.push({
          type: 'snapshot_turma_outra_escola',
          schoolId,
          message: `Registro mensal ${snap.id} referencia uma turma de outra escola.`,
          details: snap.id,
        });
      }
      if (turma.anoLetivo != null && turma.anoLetivo !== snap.anoLetivo) {
        inconsistencies.push({
          type: 'snapshot_ano_diferente',
          schoolId,
          message: `Registro mensal ${snap.id} referencia uma turma de ano letivo diferente (${turma.anoLetivo}).`,
          details: snap.id,
        });
      }
    }

    // Matrícula final divergente do cálculo esperado (seção 6 do code
    // review): matriculaFimMes informada != matriculaInicioMes +
    // novasMatriculas + transferenciasEntrada - transferenciasSaida -
    // abandono - outrasSaidas. Só sinaliza — nunca corrige o documento nem
    // persiste nada; a mensagem inclui só o ID do snapshot e os valores
    // agregados (nunca dado nominal).
    for (const snap of snapshots) {
      if (hasEnrollmentDivergence(snap, snap.matriculaFimMes)) {
        inconsistencies.push({
          type: 'matricula_final_divergente',
          schoolId,
          message: `Registro mensal ${snap.id} (${snap.mesReferencia}): matrícula final informada (${snap.matriculaFimMes}) diverge do cálculo esperado (${calculateMatriculaFimMes(snap)}).`,
          details: snap.id,
        });
      }
    }

    pushNaturalKeyDuplicates(
      inconsistencies, schoolId, 'enrollment_snapshots', 'turmaId+mesReferencia',
      snapshots, s => `${s.turmaId}_${s.mesReferencia}`, s => s.id
    );
  }

  if (availability.roster) {
    // Cadastro de estudante vinculado a uma turma de ano letivo diferente
    // do próprio cadastro (mesma lacuna já fechada em firestore.rules via
    // isCanonicalTurmaOfSchoolYear — aqui só sinaliza para quem já existir).
    for (const entry of roster) {
      const turma = turmasById.get(entry.turmaId);
      if (turma?.anoLetivo != null && turma.anoLetivo !== entry.anoLetivo) {
        inconsistencies.push({
          type: 'roster_turma_ano_diferente',
          schoolId,
          message: `Cadastro de estudante ${entry.id} vinculado a uma turma de ano letivo diferente (${turma.anoLetivo}).`,
          details: entry.id,
        });
      }
    }

    pushNaturalKeyDuplicates(
      inconsistencies, schoolId, 'student_rosters', 'turmaId+studentKey',
      roster, r => `${r.turmaId}_${r.studentKey}`, r => r.id
    );
  }

  if (availability.roster && availability.grades) {
    // Nota sem roster correspondente, ou de estudante inativo — nunca
    // exposto com nome (details usa só o ID do documento). Só roda quando
    // AMBAS as fontes (roster e grades) foram lidas com sucesso: se
    // qualquer uma falhou, cruzar as duas listas produziria um falso
    // positivo ("nota sem roster" só porque o roster não carregou).
    const rosterById = new Map(roster.map(r => [r.id, r] as const));
    for (const grade of grades) {
      const rosterEntry = rosterById.get(grade.rosterId);
      if (!rosterEntry) {
        inconsistencies.push({
          type: 'nota_sem_roster',
          schoolId,
          message: `Nota ${grade.id} não corresponde a nenhum cadastro de estudante encontrado.`,
          details: grade.id,
        });
      } else if (!rosterEntry.active) {
        inconsistencies.push({
          type: 'nota_estudante_inativo',
          schoolId,
          message: `Nota ${grade.id} registrada para um estudante inativo.`,
          details: grade.id,
        });
      }
    }
  }

  if (availability.grades) {
    // rosterId+bimestre é a chave natural, mas `grades` já vem filtrado por
    // um único bimestre (ver schoolSituationService.ts) — dentro dele,
    // agrupar só por rosterId já é equivalente.
    pushNaturalKeyDuplicates(
      inconsistencies, schoolId, 'student_bimester_grades', 'rosterId+bimestre',
      grades, g => `${g.rosterId}_${g.bimestre}`, g => g.id
    );
  }

  if (availability.flow) {
    if (flowResult && flowResult.status === 'confirmado' && calculateTotalResultados(flowResult) === 0) {
      inconsistencies.push({
        type: 'fluxo_confirmado_total_zero',
        schoolId,
        message: 'Fluxo escolar confirmado com total de resultados igual a zero.',
        details: flowResult.id,
      });
    }

    // school_flow_results já é consultado por schoolId+anoLetivo — mais de
    // um documento na lista já é a duplicidade pela chave natural.
    if (flowResultDocs.length > 1) {
      inconsistencies.push({
        type: 'registro_duplicado',
        schoolId,
        message: `${flowResultDocs.length} documentos duplicados em school_flow_results para schoolId+anoLetivo="${schoolId}_${anoLetivo}".`,
        details: flowResultDocs.map(d => d.id).join(', '),
      });
    }
  }

  if (availability.schoolYear && schoolYearDocs.length > 1) {
    inconsistencies.push({
      type: 'registro_duplicado',
      schoolId,
      message: `${schoolYearDocs.length} documentos duplicados em school_years para schoolId+anoLetivo="${schoolId}_${anoLetivo}".`,
      details: schoolYearDocs.map(d => d.id).join(', '),
    });
  }

  if (availability.turmas) {
    // Duas turmas ativas com o mesmo nome normalizado no mesmo ano letivo —
    // além da duplicidade por ID não canônico (o principal ponto deste app
    // onde isso é estruturalmente possível, já que turmas tem ID
    // auto-gerado, ao contrário das demais coleções desta fase).
    const countByName = new Map<string, number>();
    for (const turma of turmasDoAno) {
      const key = normalizeSchoolName(turma.nome);
      countByName.set(key, (countByName.get(key) ?? 0) + 1);
    }
    for (const [key, count] of countByName) {
      if (count > 1) {
        inconsistencies.push({
          type: 'registro_duplicado',
          schoolId,
          message: `${count} turmas cadastradas com o mesmo nome ("${key}") no ano letivo ${anoLetivo}.`,
        });
      }
    }
  }

  return inconsistencies;
}
