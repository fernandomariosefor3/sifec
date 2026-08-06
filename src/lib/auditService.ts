// Fase 2A — AuditService: trilha de auditoria (audit_logs). Nunca registrar
// senha, token ou credencial (seção 16 do plano) — assertNoSensitiveKeys
// bloqueia isso antes de qualquer gravação, na função pura, para o erro
// aparecer em teste unitário e não só em produção.
import { collection, doc, setDoc, type WriteBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { AuditLogEntry, AuditOperation } from '../types/audit';
import type { SourceSystem } from '../types/import';

const COLLECTION = 'audit_logs';

// "nome" isolado NÃO entra aqui de propósito (bloquearia campos de negócio
// legítimos como turmaNome/escolaNome) — só nomeAluno/estudanteNome, que são
// dado pessoal de estudante, são bloqueados (ver revisão pós-PR #8, seção 11
// do plano; 'estudantenome' adicionado na correção final da reestruturação,
// seção 2 — garante estruturalmente que o audit_log de arquivamento do
// Farol do Estudante nunca inclui o nome do estudante, mesmo que um
// chamador futuro esqueça de sanitizar o payload manualmente).
const FORBIDDEN_KEY_FRAGMENTS = [
  'password', 'senha', 'token', 'credential', 'credencial', 'secret',
  'matriculasige', 'idcenso', 'datanascimento', 'nascimento', 'nomealuno', 'estudantenome',
];

export class AuditPayloadError extends Error {}

// Só objetos "puros" (literais, ou vindos de JSON) são recursados — uma
// instância de classe (Date, Timestamp do Firestore, sentinelas de
// FieldValue como serverTimestamp()/arrayUnion()) tem um protótipo próprio,
// não Object.prototype, e precisa ser preservada intacta: Object.entries()
// nela não reconstruiria o objeto corretamente (ver stripUndefinedDeep).
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Remove recursivamente propriedades com valor `undefined` de objetos e
// arrays — nunca muta o valor recebido (sempre retorna uma cópia nova),
// nunca converte `undefined` em `null`, e preserva null/0/false/'' e
// qualquer objeto especial (Date/Timestamp/FieldValue) sem alteração. O SDK
// do Firestore rejeita `undefined` como valor de campo em setDoc()/
// batch.set(), mesmo aninhado dentro de outro objeto ou array — é o motivo
// do hotfix "Function setDoc() called with invalid data. Unsupported field
// value: undefined" em audit_logs quando um campo opcional (ex.:
// importBatchId) não era informado. Um `undefined` solto DENTRO de um
// array é removido (nunca vira `null`, que mudaria o dado) — é o único
// jeito de garantir que nada chega ao Firestore como undefined sem violar
// "nunca converter undefined em null"; elementos válidos do array nunca são
// tocados além dessa limpeza recursiva.
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => stripUndefinedDeep(item)) as unknown as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) continue;
    result[key] = stripUndefinedDeep(nested);
  }
  return result as T;
}

// Recursiva por objetos E arrays (revisão pós-PR #8): um campo sensível só
// aparecia bloqueado no nível raiz antes — um objeto aninhado (ex.:
// `{ aluno: { matriculaSige: '...' } }`) ou uma lista de objetos (ex.:
// `{ alunos: [{ dataNascimento: '...' }] }`) passava batido.
function assertNoSensitiveKeys(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_KEY_FRAGMENTS.some(fragment => lowerKey.includes(fragment))) {
      throw new AuditPayloadError(`Campo sensível "${key}" não pode ser registrado em ${label}.`);
    }
    assertNoSensitiveKeys(nested, `${label}.${key}`);
  }
}

export interface RecordAuditLogInput {
  collectionName: string;
  documentId: string;
  schoolId?: string;
  codInep?: string;
  anoLetivo?: number;
  operation: AuditOperation;
  previousValue: unknown;
  newValue: unknown;
  source: SourceSystem;
  importBatchId?: string;
  userId: string;
  userEmail: string;
  now: string;
}

// Núcleo puro: valida e monta o registro exato a gravar, dado um ID já
// alocado (o caller real usa um ID de documento auto-gerado do Firestore;
// os testes passam qualquer string fixa). schoolId/codInep/anoLetivo/
// importBatchId são montados por conditional spread (mesmo cuidado de
// buildClassroomPayload em classService.ts) para nunca incluir a CHAVE
// quando o valor está ausente — e stripUndefinedDeep no final é a garantia
// adicional para qualquer `undefined` aninhado dentro de previousValue/
// newValue, que são campos livres moldados por cada chamador.
export function buildAuditLogEntry(input: RecordAuditLogInput, id: string): AuditLogEntry {
  assertNoSensitiveKeys(input.previousValue, 'previousValue');
  assertNoSensitiveKeys(input.newValue, 'newValue');
  const entry: AuditLogEntry = {
    id,
    collectionName: input.collectionName,
    documentId: input.documentId,
    operation: input.operation,
    previousValue: input.previousValue,
    newValue: input.newValue,
    source: input.source,
    userId: input.userId,
    userEmail: input.userEmail,
    timestamp: input.now,
    ...(input.schoolId !== undefined ? { schoolId: input.schoolId } : {}),
    ...(input.codInep !== undefined ? { codInep: input.codInep } : {}),
    ...(input.anoLetivo !== undefined ? { anoLetivo: input.anoLetivo } : {}),
    ...(input.importBatchId !== undefined ? { importBatchId: input.importBatchId } : {}),
  };
  return stripUndefinedDeep(entry);
}

// Enfileira o audit_log num WriteBatch já aberto pelo chamador (ver
// saveSchoolFlowResult em schoolFlowService.ts) — não faz commit por conta
// própria, para que o resultado principal e a auditoria sejam gravados
// atomicamente: ou os dois documentos existem, ou nenhum existe. Gera a
// referência (ID automático) antes de montar o payload, mesmo padrão de
// recordAuditLog.
export function queueAuditLog(batch: WriteBatch, input: RecordAuditLogInput): AuditLogEntry {
  const ref = doc(collection(db, COLLECTION));
  const entry = buildAuditLogEntry(input, ref.id);
  batch.set(ref, entry);
  return entry;
}

// Grava a auditoria isoladamente — usada por serviços que ainda não
// precisam de atomicidade com outro documento. Continua disponível para
// não quebrar nenhum chamador existente; internamente usa o mesmo
// buildAuditLogEntry sanitizado.
export async function recordAuditLog(input: RecordAuditLogInput): Promise<AuditLogEntry> {
  const ref = doc(collection(db, COLLECTION));
  const entry = buildAuditLogEntry(input, ref.id);
  await setDoc(ref, entry);
  return entry;
}
