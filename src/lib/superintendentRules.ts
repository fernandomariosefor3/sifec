// Lógica pura de normalização, validação e permissão do cadastro de
// superintendentes — sem nenhum import do Firebase, para poder ser testada
// isoladamente (unit tests não precisam inicializar o app/Firestore).
// A fonte real de verdade de segurança é firestore.rules; o que
// está aqui é só a camada de conveniência da UI (esconder/desabilitar
// controles antes mesmo de tentar a chamada ao Firestore).

import { schoolNamesMatch } from './schoolIdentity';

// Re-exportado para quem já importa tudo daqui (e de superintendentService.ts,
// que re-exporta este arquivo por completo — ver comentário lá).
export * from './schoolIdentity';

export type SuperintendentRole = 'admin' | 'superintendent';

export interface Superintendent {
  id: string;        // slug for UI state (e.g. 'fernando-mario')
  nome: string;
  cargo: string;
  email: string;     // Google account email — used as Firestore document key
  escolas: string[]; // school names assigned to this superintendent
  ativo: boolean;
  role: SuperintendentRole;
}

// Root/bootstrap admin — identity kept fixed so there's always a recovery
// path into the platform, mirrored in isPlatformAdmin() in firestore.rules.
// Other admins are ordinary Firestore records with
// role: 'admin', granted only by an existing admin.
export const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// True only for the fixed bootstrap/recovery identity — mirrors
// isPlatformAdmin() in firestore.rules.
export function isRootAdminEmail(email: string | null | undefined): boolean {
  return !!email && normalizeEmail(email) === ADMIN_EMAIL.toLowerCase();
}

// Legacy records cached before ativo/role existed: normalize in memory
// only (never rewritten to Firestore from here). The bootstrap admin is
// always recognized as role: admin regardless of what was cached.
export function normalizeLegacyRecord(s: Partial<Superintendent> & { id: string; nome: string; email: string }): Superintendent {
  const isBootstrapAdmin = normalizeEmail(s.email) === ADMIN_EMAIL.toLowerCase();
  return {
    id: s.id,
    nome: s.nome,
    cargo: s.cargo || 'Superintendente Regional',
    email: s.email,
    escolas: Array.isArray(s.escolas) ? s.escolas : [],
    ativo: typeof s.ativo === 'boolean' ? s.ativo : true,
    role: isBootstrapAdmin ? 'admin' : (s.role === 'admin' ? 'admin' : 'superintendent'),
  };
}

export interface SuperintendentFormInput {
  nome: string;
  cargo: string;
  email: string;
  escolas: string[];
  ativo: boolean;
  role: SuperintendentRole;
}

export function defaultSuperintendentFormInput(): SuperintendentFormInput {
  return { nome: '', cargo: '', email: '', escolas: [], ativo: true, role: 'superintendent' };
}

export interface SuperintendentValidationError {
  field: 'nome' | 'email' | 'escolas' | 'duplicate';
  message: string;
}

// editingEmail: when editing an existing record, its own (unchanged) email
// is excluded from the duplicate check.
export function validateSuperintendentInput(
  input: SuperintendentFormInput,
  existing: Superintendent[],
  editingEmail?: string
): SuperintendentValidationError | null {
  if (!input.nome.trim()) {
    return { field: 'nome', message: 'Informe o nome do superintendente.' };
  }
  const email = normalizeEmail(input.email);
  if (!isValidEmailFormat(email)) {
    return { field: 'email', message: 'Informe um e-mail Google válido.' };
  }
  const editingNormalized = editingEmail ? normalizeEmail(editingEmail) : undefined;
  const duplicate = existing.some(s => normalizeEmail(s.email) === email && normalizeEmail(s.email) !== editingNormalized);
  if (duplicate) {
    return { field: 'duplicate', message: 'Já existe um cadastro com este e-mail.' };
  }
  if (input.role === 'superintendent' && input.escolas.length === 0) {
    return { field: 'escolas', message: 'Um superintendente precisa de pelo menos uma escola vinculada.' };
  }
  return null;
}

function slugify(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Builds the exact Firestore payload, applying the documented defaults
// (ativo: true, role: 'superintendent') for anything not explicitly set.
export function buildSuperintendentPayload(
  input: SuperintendentFormInput,
  existingId?: string
): Superintendent {
  const email = normalizeEmail(input.email);
  return {
    id: existingId || slugify(input.nome) || email,
    nome: input.nome.trim(),
    cargo: input.cargo.trim() || 'Superintendente Regional',
    email,
    escolas: input.escolas,
    ativo: input.ativo,
    role: input.role,
  };
}

// Would this write leave the root admin's own record deactivated, demoted,
// or otherwise tampered with? Mirrors the root-protection branch of
// firestore.rules so the UI can disable the controls before the
// request ever reaches Firestore.
export function isRootProtectedEdit(targetEmail: string, incoming: { ativo: boolean; role: SuperintendentRole }): boolean {
  return normalizeEmail(targetEmail) === ADMIN_EMAIL.toLowerCase() &&
    (incoming.ativo !== true || incoming.role !== 'admin');
}

// Which roles the acting user is allowed to assign to a NEW or edited record.
export function assignableRoles(actingUserIsRoot: boolean): SuperintendentRole[] {
  return actingUserIsRoot ? ['admin', 'superintendent'] : ['superintendent'];
}

export function canGrantAdminRole(actingUserIsRoot: boolean): boolean {
  return actingUserIsRoot;
}

// Can the acting user open/save an edit on this target record?
export function canEditTarget(
  actingUserIsRoot: boolean,
  targetRole: SuperintendentRole,
  targetEmail: string,
  actingUserEmail: string
): boolean {
  if (normalizeEmail(targetEmail) === normalizeEmail(actingUserEmail)) {
    return actingUserIsRoot;
  }
  if (actingUserIsRoot) return true;
  return targetRole === 'superintendent';
}

export function canDeleteTarget(actingUserIsRoot: boolean, targetEmail: string): boolean {
  if (!actingUserIsRoot) return false;
  return normalizeEmail(targetEmail) !== ADMIN_EMAIL.toLowerCase();
}

// ---- School visibility/write access (hotfix: admin global access) ----
// Mirrors isAdmin()/canWriteEscola() in firestore.rules: an active admin
// (role: 'admin', ativo: true) has access to every school regardless of
// what — if anything — is in their own `escolas` list. `escolas: []` on an
// admin record means "acesso global", never "nenhuma escola".
//
// isAuthenticated must be false for the pre-login/demo state (no real
// Firebase user signed in) so DEFAULT_SUPERINTENDENTS — a local-only demo
// record that also happens to carry role: 'admin' — keeps showing only its
// own seeded school list instead of being treated as a real global admin.
// A genuinely authenticated admin always passes isAuthenticated: true.
export function superintendentCanAccessSchool(
  schoolName: string,
  record: Pick<Superintendent, 'ativo' | 'role' | 'escolas'> | null | undefined,
  isAuthenticated: boolean
): boolean {
  if (!record || record.ativo !== true) return false;
  if (isAuthenticated && record.role === 'admin') return true;
  // Tolerante a caixa/espaço/acento (Fase 1G) — a escola pode estar
  // gravada com grafia levemente diferente entre o documento real de
  // `schools` e a lista `escolas` do superintendente; ver schoolIdentity.ts.
  return record.escolas.some(e => schoolNamesMatch(e, schoolName));
}

export function filterSchoolsForSuperintendent<T extends { nome: string }>(
  schools: T[],
  record: Pick<Superintendent, 'ativo' | 'role' | 'escolas'> | null | undefined,
  isAuthenticated: boolean
): T[] {
  if (!record || record.ativo !== true) return [];
  if (isAuthenticated && record.role === 'admin') return schools;
  return schools.filter(s => record.escolas.some(e => schoolNamesMatch(e, s.nome)));
}

// "Carteira acompanhada": as escolas da própria lista `escolas` do
// registro, resolvidas por nome normalizado — SEMPRE, mesmo para um admin
// (que tem acesso global via role, mas cuja carteira/acompanhamento é a
// lista curada de `escolas`, não o universo inteiro). Reaproveita
// filterSchoolsForSuperintendent forçando isAuthenticated: false, o que
// pula deliberadamente o atalho "admin autenticado vê tudo" e cai direto no
// match por `escolas` — é o mesmo comportamento já coberto pelo teste do
// "modo demonstração" abaixo. Se a lógica de isAuthenticated em
// filterSchoolsForSuperintendent/getAccessibleSchoolCount ganhar algum dia
// um segundo significado, revisar este reaproveitamento.
export function getWatchedSchools<T extends { nome: string }>(
  schools: T[],
  record: Pick<Superintendent, 'ativo' | 'role' | 'escolas'> | null | undefined
): T[] {
  return filterSchoolsForSuperintendent(schools, record, false);
}

export interface AccessibleSchoolCountInput {
  superintendent: Pick<Superintendent, 'ativo' | 'role' | 'escolas'> | null | undefined;
  allSchoolNames: string[];
  isAuthenticated: boolean;
}

// How many schools does this record effectively have access to? An
// authenticated, active admin always counts the FULL universe
// (allSchoolNames.length) — escolas: [] never means zero for an admin, it
// means "acesso global". A superintendent (or the pre-login demo record,
// isAuthenticated: false) is counted only by the subset of their own
// escolas that actually match a real school name — stale/renamed entries
// don't inflate the count. An empty allSchoolNames simply yields 0 (nothing
// loaded yet), never mistaken for access being denied.
export function getAccessibleSchoolCount({
  superintendent,
  allSchoolNames,
  isAuthenticated,
}: AccessibleSchoolCountInput): number {
  if (!superintendent || superintendent.ativo !== true) return 0;
  if (isAuthenticated && superintendent.role === 'admin') return allSchoolNames.length;
  // Tolerante a caixa/espaço/acento (Fase 1G) — ver schoolNamesMatch.
  return superintendent.escolas.filter(nome => allSchoolNames.some(real => schoolNamesMatch(real, nome))).length;
}

// "Carteira acompanhada" em número — mesma escolha de getWatchedSchools
// (isAuthenticated: false força o match por `escolas`, ignorando o atalho
// de acesso global do admin).
export function getWatchedSchoolCount(input: AccessibleSchoolCountInput): number {
  return getAccessibleSchoolCount({ ...input, isAuthenticated: false });
}

// Short display label for the workspace selector / header badges.
export function getAccessibleSchoolLabel(input: AccessibleSchoolCountInput): string {
  const { superintendent, isAuthenticated } = input;
  if (isAuthenticated && superintendent?.ativo === true && superintendent.role === 'admin') {
    return 'Acesso global';
  }
  return `${getAccessibleSchoolCount(input)} Esc.`;
}
