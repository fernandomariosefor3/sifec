// Fase 2B — SchoolFlowService: resultado anual agregado de fluxo escolar
// (aprovados/reprovados/abandono) por escola+ano letivo. A parte pura
// (validação + montagem do payload) fica em funções exportadas sem nenhuma
// chamada ao Firestore, testável sem emulador — as funções assíncronas no
// fim do arquivo só orquestram a leitura/escrita.
import { collection, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { SchoolFlowResult, SchoolFlowStatus, SchoolFlowSourceSystem } from '../types/schoolFlow';
import { buildSchoolFlowResultId } from './deterministicIds';
import { calculateTotalResultados, type SchoolFlowCounts } from './schoolFlowCalculations';
import { isNonNegativeInteger } from './enrollmentCalculations';
import { queueAuditLog } from './auditService';

const COLLECTION = 'school_flow_results';
const MAX_OBSERVACAO_LENGTH = 500;

export class SchoolFlowResultValidationError extends Error {}

export interface SaveSchoolFlowResultInput extends SchoolFlowCounts {
  schoolId: string;
  codInep: string;
  escolaNome: string;
  anoLetivo: number;
  status: SchoolFlowStatus;
  observacao?: string;
  sourceSystem?: SchoolFlowSourceSystem;
  sourceReportTitle?: string;
  sourceFileName?: string;
  sourceFileHash?: string;
  importBatchId?: string;
  actingUserEmail: string;
  now: string;
}

// Lança SchoolFlowResultValidationError na primeira violação encontrada —
// chamado sempre antes de montar o payload, nunca depois. Não valida
// schoolId/codInep/escolaNome contra a escola canônica (mesmo padrão de
// validateSaveSchoolYearInput/validateEnrollmentSnapshotInput): essa
// verificação é responsabilidade de firestore.rules (isCanonicalSchoolMatch),
// não desta camada pura.
export function validateSchoolFlowResultInput(input: SaveSchoolFlowResultInput): void {
  if (!Number.isInteger(input.anoLetivo) || input.anoLetivo < 2000 || input.anoLetivo > 2100) {
    throw new SchoolFlowResultValidationError('Ano letivo inválido — use um ano entre 2000 e 2100.');
  }
  if (
    !isNonNegativeInteger(input.aprovados) ||
    !isNonNegativeInteger(input.reprovados) ||
    !isNonNegativeInteger(input.abandono)
  ) {
    throw new SchoolFlowResultValidationError(
      'Aprovados, reprovados e abandono devem ser números inteiros maiores ou iguais a zero.'
    );
  }
  // Rascunho pode ter total zero (ainda em preenchimento); confirmado exige
  // pelo menos um resultado — nunca inventa quantitativo ausente.
  if (input.status === 'confirmado' && calculateTotalResultados(input) <= 0) {
    throw new SchoolFlowResultValidationError(
      'Um resultado confirmado precisa ter total de resultados (aprovados + reprovados + abandono) maior que zero.'
    );
  }
  if (input.observacao != null && input.observacao.length > MAX_OBSERVACAO_LENGTH) {
    throw new SchoolFlowResultValidationError(`Observação limitada a ${MAX_OBSERVACAO_LENGTH} caracteres.`);
  }
}

// Núcleo puro: monta o documento exato que será gravado, dado o resultado
// existente (se houver, para preservar createdAt/createdBy e metadados de
// origem não reenviados nesta chamada). Não toca Firestore. Campos opcionais
// ausentes são OMITIDOS por completo (nunca `campo: undefined`) — o SDK do
// Firestore rejeita `undefined` como valor de campo em setDoc() (mesmo
// cuidado de buildClassroomPayload em classService.ts).
export function buildSchoolFlowResultPayload(
  input: SaveSchoolFlowResultInput,
  existing?: SchoolFlowResult
): SchoolFlowResult {
  validateSchoolFlowResultInput(input);

  const observacao = input.observacao !== undefined ? input.observacao : existing?.observacao;
  const sourceSystem = input.sourceSystem !== undefined ? input.sourceSystem : existing?.sourceSystem;
  const sourceReportTitle = input.sourceReportTitle !== undefined ? input.sourceReportTitle : existing?.sourceReportTitle;
  const sourceFileName = input.sourceFileName !== undefined ? input.sourceFileName : existing?.sourceFileName;
  const sourceFileHash = input.sourceFileHash !== undefined ? input.sourceFileHash : existing?.sourceFileHash;
  const importBatchId = input.importBatchId !== undefined ? input.importBatchId : existing?.importBatchId;

  return {
    id: buildSchoolFlowResultId(input.schoolId, input.anoLetivo),
    schoolId: input.schoolId,
    codInep: input.codInep,
    escolaNome: input.escolaNome,
    anoLetivo: input.anoLetivo,
    aprovados: input.aprovados,
    reprovados: input.reprovados,
    abandono: input.abandono,
    status: input.status,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    createdBy: existing?.createdBy ?? input.actingUserEmail,
    updatedBy: input.actingUserEmail,
    ...(observacao !== undefined ? { observacao } : {}),
    ...(sourceSystem !== undefined ? { sourceSystem } : {}),
    ...(sourceReportTitle !== undefined ? { sourceReportTitle } : {}),
    ...(sourceFileName !== undefined ? { sourceFileName } : {}),
    ...(sourceFileHash !== undefined ? { sourceFileHash } : {}),
    ...(importBatchId !== undefined ? { importBatchId } : {}),
  };
}

// Consulta por schoolId+anoLetivo em vez de getDoc(id determinístico) —
// mesmo padrão já corrigido em getSchoolYear()/getEnrollmentSnapshot()
// (hotfix de estabilização): getDoc direto num documento que ainda não
// existe força a regra de segurança a avaliar resource.data contra um
// resource nulo, o que sempre falha como "Missing or insufficient
// permissions" mesmo com acesso legítimo. Uma query que não bate com nenhum
// documento simplesmente retorna vazia, sem erro de permissão.
export async function getSchoolFlowResult(
  schoolId: string,
  anoLetivo: number
): Promise<SchoolFlowResult | null> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('schoolId', '==', schoolId),
      where('anoLetivo', '==', anoLetivo),
      limit(1)
    )
  );
  return snap.empty ? null : (snap.docs[0].data() as SchoolFlowResult);
}

// Busca o resultado de VÁRIAS escolas para o mesmo ano letivo — uma consulta
// por escola (nunca a coleção inteira sem filtro: a regra de leitura só
// autoriza consultas filtradas por schoolId, ver firestore.rules). Não
// engole falha de nenhuma escola individualmente — uma falha real propaga
// normalmente; isolar falha por escola é responsabilidade do chamador
// (ver useSchoolFlowResults), não desta função.
export async function listSchoolFlowResultsForSchools(
  schoolIds: readonly string[],
  anoLetivo: number
): Promise<Record<string, SchoolFlowResult>> {
  const entries = await Promise.all(
    schoolIds.map(async schoolId => [schoolId, await getSchoolFlowResult(schoolId, anoLetivo)] as const)
  );
  return Object.fromEntries(
    entries.filter((entry): entry is [string, SchoolFlowResult] => entry[1] != null)
  );
}

// Grava o resultado do ano informado. Como o ID é determinístico por ano,
// isto nunca sobrescreve o resultado de outro ano — só corrige o mesmo ano
// quando chamado de novo com o mesmo anoLetivo. O documento principal e o
// audit_log (resumo agregado — seção 10 do plano, nunca nome de estudante
// ou outro dado pessoal, só {anoLetivo, aprovados, reprovados, abandono,
// status}) são gravados no MESMO WriteBatch: ou os dois existem, ou nenhum
// existe — nunca mais o caso de o resultado já ter sido salvo e o usuário
// ver erro só porque a auditoria falhou depois (hotfix: antes, setDoc do
// resultado e recordAuditLog da auditoria eram duas escritas separadas).
export async function saveSchoolFlowResult(
  input: SaveSchoolFlowResultInput
): Promise<SchoolFlowResult> {
  const existing = await getSchoolFlowResult(input.schoolId, input.anoLetivo);
  const payload = buildSchoolFlowResultPayload(input, existing ?? undefined);

  const summary = (r: SchoolFlowResult) => ({
    anoLetivo: r.anoLetivo,
    aprovados: r.aprovados,
    reprovados: r.reprovados,
    abandono: r.abandono,
    status: r.status,
  });

  const batch = writeBatch(db);
  batch.set(doc(db, COLLECTION, payload.id), payload);
  queueAuditLog(batch, {
    collectionName: COLLECTION,
    documentId: payload.id,
    schoolId: payload.schoolId,
    codInep: payload.codInep,
    anoLetivo: payload.anoLetivo,
    operation: existing ? 'update' : 'create',
    previousValue: existing ? summary(existing) : null,
    newValue: summary(payload),
    source: 'Manual',
    userId: input.actingUserEmail,
    userEmail: input.actingUserEmail,
    now: input.now,
  });
  await batch.commit();

  return payload;
}
