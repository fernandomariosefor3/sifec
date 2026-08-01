// Fase 2A — ClassService: campos anuais estendidos da coleção `turmas`.
// Só ADICIONA/atualiza os campos novos (ver src/types/classroom.ts) — nunca
// toca ano/periodo/lancamentosBimestre/mediaBimestre/alunosSinalizados, que
// continuam pertencendo à Fase 1 (NotasView.tsx/CdgView.tsx).
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { updateDocument } from './firebaseService';
import type { Turma, TurmaModalidade } from '../types/classroom';
import { countActiveTurmas, isNonNegativeInteger } from './enrollmentCalculations';
import { normalizeSchoolName, schoolNamesMatch, type SchoolRef } from './schoolIdentity';

// Revisão do code review do PR #17, seção 2: turmas de UMA escola por vez
// (nunca a coleção inteira — antes NotasView.tsx assinava a coleção
// `turmas` completa via subscribeToCollection, mesmo autenticado, mesmo com
// uma única escola selecionada). Consulta por `escolaId` (campo legado,
// sempre presente — Fase 1) E por `schoolId` (campo novo, Fase 2A) em
// paralelo, e deduplica por id: cobre tanto documentos legados (só
// escolaId) quanto documentos novos (ambos os campos, ou só schoolId numa
// futura migração) sem depender de qual dos dois foi preenchido.
export async function listClassroomsForSchool(schoolId: string): Promise<Turma[]> {
  const [byEscolaId, bySchoolId] = await Promise.all([
    getDocs(query(collection(db, 'turmas'), where('escolaId', '==', schoolId))),
    getDocs(query(collection(db, 'turmas'), where('schoolId', '==', schoolId))),
  ]);
  const byId = new Map<string, Turma>();
  for (const snap of [byEscolaId, bySchoolId]) {
    for (const d of snap.docs) {
      const turma = d.data() as Turma;
      byId.set(turma.id, turma);
    }
  }
  return Array.from(byId.values());
}

// Reexportado para quem só precisa da contagem de turmas ativas de uma
// escola (ver seção 6 do plano — o total de turmas é sempre calculado,
// nunca um campo manual duplicado).
export function getActiveClassroomCount(turmas: readonly Pick<Turma, 'ativa'>[]): number {
  return countActiveTurmas(turmas);
}

// Cascata ESTRITA codInep → schoolId/escolaId → nome normalizado (revisão
// pós-PR #8): para cada turma, decide qual nível de identificador usar e
// testa SÓ esse nível — nunca um OR independente entre as três
// alternativas. Antes, uma turma com codInep DIFERENTE do da escola (ou
// schoolId/escolaId diferente) ainda podia "colar" por coincidência de
// nome normalizado, associando turmas de escolas diferentes só porque o
// nome de exibição batia. Agora:
//   1) se a escola e a turma têm codInep, a decisão é só por codInep —
//      não cai para nome mesmo se o codInep não bater;
//   2) senão, se a turma tem schoolId ou escolaId, a decisão é só pelo ID
//      — mesma lógica, não cai para nome se o ID não bater;
//   3) só na ausência dos dois anteriores (turma genuinamente legada, sem
//      nenhum identificador estável) usa nome normalizado como fallback.
function classroomBelongsToSchool(turma: Turma, school: SchoolRef): boolean {
  if (school.codInep && turma.codInep) {
    return turma.codInep === school.codInep;
  }
  const turmaSchoolId = turma.schoolId || turma.escolaId;
  if (school.id && turmaSchoolId) {
    return turmaSchoolId === school.id;
  }
  return schoolNamesMatch(turma.escolaNome, school.nome);
}

export function getClassroomsForSchool(turmas: readonly Turma[], school: SchoolRef): Turma[] {
  return turmas.filter(t => classroomBelongsToSchool(t, school));
}

// Fase 2C — revisão do PR #15: NotasView nunca pode resolver uma turma de
// OUTRO ano letivo só porque pertence à escola certa (mesma lacuna já
// fechada em firestore.rules via isCanonicalTurmaOfSchoolYear) — sem isso,
// um student_roster de 2026 podia acabar exibindo/gravando contra uma
// turma de 2025. Turma legada sem `anoLetivo` nunca "cola" silenciosamente
// aqui: precisa ser completada em Gestão de Escolas antes de aparecer no
// módulo de notas. Função própria (em vez de um parâmetro opcional em
// getClassroomsForSchool) para não alterar o comportamento dos outros
// consumidores existentes (SchoolEnrollmentPanel/useSchoolEnrollmentSummaries),
// que continuam listando turmas por escola em qualquer ano.
export function getClassroomsForSchoolYear(
  turmas: readonly Turma[],
  school: SchoolRef,
  anoLetivo: number
): Turma[] {
  return getClassroomsForSchool(turmas, school).filter(t => t.anoLetivo === anoLetivo);
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
// Campos opcionais ausentes (undefined) são OMITIDOS por completo, nunca
// incluídos como `campo: undefined` — o SDK do Firestore rejeita
// `undefined` como valor de campo mesmo em setDoc(..., {merge: true}), e
// uma ação como "Ativar/Inativar" (seção 7 do plano) só informa `ativa`,
// deixando os demais campos opcionais de fora de propósito.
export function buildClassYearFieldsUpdate(input: ClassYearFieldsInput): Partial<Turma> {
  const update: Partial<Turma> = {
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    updatedAt: input.now,
    updatedBy: input.actingUserEmail,
  };
  if (input.codigoTurma !== undefined) update.codigoTurma = input.codigoTurma;
  if (input.serie !== undefined) update.serie = input.serie;
  if (input.etapa !== undefined) update.etapa = input.etapa;
  if (input.modalidade !== undefined) update.modalidade = input.modalidade;
  if (input.turno !== undefined) update.turno = input.turno;
  if (input.oferta !== undefined) update.oferta = input.oferta;
  if (input.cargaHoraria !== undefined) update.cargaHoraria = input.cargaHoraria;
  if (input.matriculaInicial !== undefined) update.matriculaInicial = input.matriculaInicial;
  if (input.matriculaAtual !== undefined) update.matriculaAtual = input.matriculaAtual;
  if (input.ativa !== undefined) update.ativa = input.ativa;
  if (input.dataInicio !== undefined) update.dataInicio = input.dataInicio;
  if (input.dataEncerramento !== undefined) update.dataEncerramento = input.dataEncerramento;
  return update;
}

export async function saveClassYearFields(turmaId: string, input: ClassYearFieldsInput): Promise<void> {
  await updateDocument('turmas', turmaId, buildClassYearFieldsUpdate(input));
}

// --- Cadastro de turma (seção 7 do plano) ---

export class ClassroomValidationError extends Error {}

export interface CreateClassroomInput {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  nome: string;
  codigoTurma?: string;
  serie: string;
  etapa: string;
  modalidade: TurmaModalidade;
  turno: string;
  oferta: string;
  cargaHoraria?: number;
  matriculaInicial: number;
  ativa: boolean;
  actingUserEmail: string;
  now: string;
}

export function validateCreateClassroomInput(input: CreateClassroomInput): void {
  if (!input.nome.trim()) {
    throw new ClassroomValidationError('Informe o nome da turma.');
  }
  if (!isNonNegativeInteger(input.matriculaInicial)) {
    throw new ClassroomValidationError('Matrícula inicial deve ser um número inteiro maior ou igual a zero.');
  }
  if (input.cargaHoraria !== undefined && !isNonNegativeInteger(input.cargaHoraria)) {
    throw new ClassroomValidationError('Carga horária deve ser um número inteiro maior ou igual a zero.');
  }
}

// Mesma escola (schoolId/escolaId), mesmo ano letivo e mesmo nome
// normalizado (seção 7 do plano — nunca duplicar turma). Usa a mesma
// normalização de schoolIdentity.ts (caixa/espaço/acento tolerantes).
export function isDuplicateClassroom(
  turmas: readonly Pick<Turma, 'schoolId' | 'escolaId' | 'anoLetivo' | 'nome'>[],
  candidate: { schoolId: string; anoLetivo: number; nome: string }
): boolean {
  const targetNome = normalizeSchoolName(candidate.nome);
  return turmas.some(t =>
    (t.schoolId === candidate.schoolId || t.escolaId === candidate.schoolId) &&
    t.anoLetivo === candidate.anoLetivo &&
    normalizeSchoolName(t.nome) === targetNome
  );
}

// Núcleo puro: monta o documento completo de uma turma nova, preservando
// compatibilidade com os campos legados exigidos por NotasView/CdgView
// (escolaId, escolaNome, nome, ano, periodo, lancamentosBimestre,
// mediaBimestre, alunosSinalizados) ao lado dos campos novos da Fase 2A.
export function buildClassroomPayload(input: CreateClassroomInput, id: string): Turma {
  validateCreateClassroomInput(input);
  return {
    id,
    // --- Campos legados ---
    escolaId: input.schoolId,
    escolaNome: input.escolaNome,
    nome: input.nome,
    ano: input.serie,
    periodo: input.turno,
    alunosSinalizados: 0,
    // --- Campos novos (Fase 2A) ---
    schoolId: input.schoolId,
    codInep: input.codInep,
    anoLetivo: input.anoLetivo,
    serie: input.serie,
    etapa: input.etapa,
    modalidade: input.modalidade,
    turno: input.turno,
    oferta: input.oferta,
    matriculaInicial: input.matriculaInicial,
    matriculaAtual: input.matriculaInicial,
    ativa: input.ativa,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.actingUserEmail,
    updatedBy: input.actingUserEmail,
    // codigoTurma/cargaHoraria são opcionais no tipo Turma — omitidos por
    // completo (não `undefined`) quando ausentes, porque o SDK do
    // Firestore rejeita `undefined` como valor de campo em setDoc().
    ...(input.codigoTurma !== undefined ? { codigoTurma: input.codigoTurma } : {}),
    ...(input.cargaHoraria !== undefined ? { cargaHoraria: input.cargaHoraria } : {}),
  };
}

export async function createClassroom(
  input: CreateClassroomInput,
  existingTurmas: readonly Turma[]
): Promise<Turma> {
  validateCreateClassroomInput(input);
  if (isDuplicateClassroom(existingTurmas, input)) {
    throw new ClassroomValidationError('Já existe uma turma com este nome nesta escola e ano letivo.');
  }
  const ref = doc(collection(db, 'turmas'));
  const payload = buildClassroomPayload(input, ref.id);
  await setDoc(ref, payload);
  return payload;
}
