// Fase 2A — EnrollmentSnapshotService: matrícula mensal por turma.
// A parte pura (validação + montagem do payload) fica em funções exportadas
// sem nenhuma chamada ao Firestore, para serem testadas sem emulador — as
// funções assíncronas no fim do arquivo só orquestram a leitura/escrita.
//
// Snapshots são imutáveis por mês (ver seção 9 do plano): salvar março
// nunca sobrescreve fevereiro porque o ID é determinístico por
// schoolId+turmaId+mesReferencia (buildEnrollmentSnapshotId). Não existe
// função de exclusão aqui de propósito — snapshots não podem ser excluídos
// por usuários comuns.
import { collection, doc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import type { EnrollmentSnapshot, EnrollmentReviewStatus } from '../types/enrollment';
import { buildEnrollmentSnapshotId } from './deterministicIds';
import {
  calculateMatriculaFimMes,
  hasEnrollmentDivergence,
  isMonthWithinSchoolYear,
  isNonNegativeInteger,
  isValidEnrollmentMovement,
  isValidMonthReference,
  type EnrollmentMonthMovement,
} from './enrollmentCalculations';

const COLLECTION = 'enrollment_snapshots';

export class EnrollmentSnapshotValidationError extends Error {}

export interface SaveEnrollmentSnapshotInput extends EnrollmentMonthMovement {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  mesReferencia: string;
  matriculaFimMes: number;
  observacao?: string;
  actingUserEmail: string;
  now: string;
}

// Lança EnrollmentSnapshotValidationError na primeira violação encontrada —
// chamado sempre antes de montar o payload, nunca depois.
export function validateEnrollmentSnapshotInput(input: SaveEnrollmentSnapshotInput): void {
  if (!isValidMonthReference(input.mesReferencia)) {
    throw new EnrollmentSnapshotValidationError(
      'Mês de referência inválido — use o formato YYYY-MM.'
    );
  }
  if (!isMonthWithinSchoolYear(input.mesReferencia, input.anoLetivo)) {
    throw new EnrollmentSnapshotValidationError(
      `Mês de referência (${input.mesReferencia}) não pertence ao ano letivo ${input.anoLetivo}.`
    );
  }
  if (!isValidEnrollmentMovement(input) || !isNonNegativeInteger(input.matriculaFimMes)) {
    throw new EnrollmentSnapshotValidationError(
      'Todos os valores de matrícula devem ser números inteiros maiores ou iguais a zero.'
    );
  }
  if (hasEnrollmentDivergence(input, input.matriculaFimMes) && !input.observacao?.trim()) {
    throw new EnrollmentSnapshotValidationError(
      'Matrícula final diverge do cálculo esperado — informe uma observação para salvar mesmo assim.'
    );
  }
}

function resolveReviewStatus(
  input: SaveEnrollmentSnapshotInput,
  existing: EnrollmentSnapshot | undefined
): EnrollmentReviewStatus {
  if (hasEnrollmentDivergence(input, input.matriculaFimMes)) return 'divergencia';
  return existing ? 'corrigido' : 'manual';
}

// Núcleo puro: monta o documento exato que será gravado, dado o snapshot
// existente (se houver, para preservar createdAt/createdBy). Não toca
// Firestore — é isto que os testes unitários exercitam diretamente.
export function buildEnrollmentSnapshotPayload(
  input: SaveEnrollmentSnapshotInput,
  existing?: EnrollmentSnapshot
): EnrollmentSnapshot {
  validateEnrollmentSnapshotInput(input);
  return {
    id: buildEnrollmentSnapshotId(input.schoolId, input.turmaId, input.mesReferencia),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    turmaId: input.turmaId,
    turmaNome: input.turmaNome,
    anoLetivo: input.anoLetivo,
    mesReferencia: input.mesReferencia,
    matriculaInicioMes: input.matriculaInicioMes,
    novasMatriculas: input.novasMatriculas,
    transferenciasEntrada: input.transferenciasEntrada,
    transferenciasSaida: input.transferenciasSaida,
    abandono: input.abandono,
    outrasSaidas: input.outrasSaidas,
    matriculaFimMes: input.matriculaFimMes,
    observacao: input.observacao,
    reviewStatus: resolveReviewStatus(input, existing),
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
  };
}

// Consulta por schoolId+turmaId+mesReferencia em vez de getDoc(id
// determinístico): mesmo padrão já corrigido em getSchoolYear()
// (schoolYearService.ts). A regra de segurança (`allow read` em
// enrollment_snapshots) só consegue provar que uma consulta é segura quando
// ela é filtrada pelo mesmo campo (schoolId) usado na regra. Um getDoc
// direto por ID pede um documento específico — quando o primeiro registro
// mensal daquela turma/mês ainda não existe, o Firestore precisa avaliar a
// regra contra um resource nulo, o que sempre falha e aparece para o
// usuário como "Missing or insufficient permissions" mesmo com acesso
// legítimo, e o setDoc em saveEnrollmentSnapshot nunca é alcançado. Uma
// query que não bate com nenhum documento simplesmente retorna vazia, sem
// erro de permissão.
export async function getEnrollmentSnapshot(
  schoolId: string,
  turmaId: string,
  mesReferencia: string
): Promise<EnrollmentSnapshot | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('turmaId', '==', turmaId),
      where('mesReferencia', '==', mesReferencia),
      limit(1)
    )
  );
  return snap.empty ? null : (snap.docs[0].data() as EnrollmentSnapshot);
}

// Grava o snapshot do mês informado. Como o ID é determinístico por mês,
// isto nunca sobrescreve o snapshot de outro mês — só corrige o mesmo mês
// quando chamado de novo com o mesmo mesReferencia.
export async function saveEnrollmentSnapshot(
  input: SaveEnrollmentSnapshotInput
): Promise<EnrollmentSnapshot> {
  const existing = await getEnrollmentSnapshot(input.schoolId, input.turmaId, input.mesReferencia);
  const payload = buildEnrollmentSnapshotPayload(input, existing ?? undefined);
  await setDoc(doc(db, COLLECTION, payload.id), payload);
  return payload;
}

// Histórico de uma escola, em ordem cronológica (YYYY-MM ordena
// lexicograficamente igual a cronologicamente). anoLetivo é opcional só
// para não quebrar chamadas existentes, mas deve ser sempre informado a
// partir do momento em que mais de um ano letivo tiver dados — sem isso, a
// partir de 2027 esta função passaria a misturar snapshots de anos
// diferentes da mesma escola (ver revisão pré-PR).
export async function listEnrollmentSnapshotsForSchool(
  schoolId: string,
  anoLetivo?: number
): Promise<EnrollmentSnapshot[]> {
  const constraints = [where('schoolId', '==', schoolId)];
  if (anoLetivo != null) {
    constraints.push(where('anoLetivo', '==', anoLetivo));
  }
  const snap = await getDocs(query(collection(db, COLLECTION), ...constraints));
  return snap.docs
    .map(d => d.data() as EnrollmentSnapshot)
    .sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));
}
