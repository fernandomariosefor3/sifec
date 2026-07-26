// Fase 2A — ClassService: campos anuais estendidos da coleção `turmas`.
// Só ADICIONA/atualiza os campos novos (ver src/types/classroom.ts) — nunca
// toca ano/periodo/lancamentosBimestre/mediaBimestre/alunosSinalizados, que
// continuam pertencendo à Fase 1 (NotasView.tsx/CdgView.tsx).
import { updateDocument } from './firebaseService';
import type { Turma, TurmaModalidade } from '../types/classroom';
import { countActiveTurmas } from './enrollmentCalculations';
import { schoolNamesMatch, type SchoolRef } from './schoolIdentity';

// Reexportado para quem só precisa da contagem de turmas ativas de uma
// escola (ver seção 6 do plano — o total de turmas é sempre calculado,
// nunca um campo manual duplicado).
export function getActiveClassroomCount(turmas: readonly Pick<Turma, 'ativa'>[]): number {
  return countActiveTurmas(turmas);
}

// Prioridade codInep → schoolId/escolaId → nome normalizado (seção 4 do
// plano) — nunca só igualdade literal de nome. codInep primeiro porque é o
// identificador mais estável entre sistemas; schoolId/escolaId em seguida
// porque já são chaves exatas; schoolNamesMatch só como último recurso,
// para turmas legadas cujo escolaId não bate com o schoolId atual da
// escola (mesmo caso-raiz que motivou schoolIdentity.ts na Fase 1G).
export function getClassroomsForSchool(turmas: readonly Turma[], school: SchoolRef): Turma[] {
  return turmas.filter(t =>
    (!!school.codInep && !!t.codInep && t.codInep === school.codInep) ||
    (!!school.id && (t.schoolId === school.id || t.escolaId === school.id)) ||
    schoolNamesMatch(t.escolaNome, school.nome)
  );
}

export interface ClassYearFieldsInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  codigoTurma?: string;
  serie?: string;
  etapa?: string;
  modalidade?: TurmaModalidade;
  turno?: string;
  oferta?: string;
  cargaHoraria?: number;
  matriculaInicial?: number;
  matriculaAtual?: number;
  ativa?: boolean;
  dataInicio?: string;
  dataEncerramento?: string;
  actingUserEmail: string;
  now: string;
}

// Núcleo puro: monta o objeto parcial de atualização, sem gravar nada.
export function buildClassYearFieldsUpdate(input: ClassYearFieldsInput): Partial<Turma> {
  return {
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    codigoTurma: input.codigoTurma,
    serie: input.serie,
    etapa: input.etapa,
    modalidade: input.modalidade,
    turno: input.turno,
    oferta: input.oferta,
    cargaHoraria: input.cargaHoraria,
    matriculaInicial: input.matriculaInicial,
    matriculaAtual: input.matriculaAtual,
    ativa: input.ativa,
    dataInicio: input.dataInicio,
    dataEncerramento: input.dataEncerramento,
    updatedAt: input.now,
    updatedBy: input.actingUserEmail,
  };
}

export async function saveClassYearFields(turmaId: string, input: ClassYearFieldsInput): Promise<void> {
  await updateDocument('turmas', turmaId, buildClassYearFieldsUpdate(input));
}
