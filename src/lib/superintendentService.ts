import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  Superintendent,
  SuperintendentRole,
  ADMIN_EMAIL,
  normalizeEmail,
  normalizeLegacyRecord,
  isRootAdminEmail,
} from './superintendentRules';

// Re-export the pure, Firebase-free layer (types, normalization,
// validation, permission helpers) so existing imports keep working —
// see superintendentRules.ts for the implementations and their unit tests.
export * from './superintendentRules';

// Local-only demonstration data for the logged-out / not-yet-synced state.
// Never written to Firestore automatically (no call site below passes this
// array to saveSuperintendentToFirestore) and never treated as an
// authorization source: real access always requires a genuine Firestore
// document with ativo: true, enforced by firestore.rules. Once the
// admin's real Firestore record syncs in, syncSuperintendentsFromFirestore()
// replaces this local cache wholesale, so it never persists alongside the
// real record.
const DEFAULT_SUPERINTENDENTS: Superintendent[] = [
  {
    id: 'fernando-mario',
    nome: 'Fernando Mário Martins',
    cargo: 'Superintendente de Regulação Seduc',
    email: 'fernandomariodasmartins@gmail.com',
    escolas: [
      'EEM Diva Cabral',
      'EEM Figueiredo Correia',
      'EEM José Leopoldino da Silva',
      'EEM São Francisco Canindezinho',
      'EEMTI Anísio Teixeira',
      'EEMTI Estado do Amazonas',
      'EEMTI Senador Osires Pontes'
    ],
    ativo: true,
    role: 'admin'
  }
];

// ---- Local cache (localStorage) ----

export function getSuperintendents(): Superintendent[] {
  const data = localStorage.getItem('sefor3_superintendents');
  if (!data) {
    localStorage.setItem('sefor3_superintendents', JSON.stringify(DEFAULT_SUPERINTENDENTS));
    return DEFAULT_SUPERINTENDENTS;
  }
  try {
    const parsed = JSON.parse(data) as Array<Partial<Superintendent> & { id: string; nome: string; email: string }>;
    return parsed.map(normalizeLegacyRecord);
  } catch {
    return DEFAULT_SUPERINTENDENTS;
  }
}

export function saveSuperintendents(list: Superintendent[]): void {
  localStorage.setItem('sefor3_superintendents', JSON.stringify(list));
  window.dispatchEvent(new Event('sefor3_superintendents_change'));
}

// ---- Firestore operations ----

function docToSuperintendent(id: string, data: Record<string, unknown>): Superintendent {
  return normalizeLegacyRecord({
    id: (data.id as string) || id,
    nome: (data.nome as string) || '',
    cargo: (data.cargo as string) || 'Superintendente Regional',
    email: (data.email as string) || id,
    escolas: Array.isArray(data.escolas) ? (data.escolas as string[]) : [],
    ativo: data.ativo as boolean | undefined,
    role: data.role as SuperintendentRole | undefined,
  });
}

// Load all superintendent records (admin only — non-admins use getCurrentUserSuperRecord)
export async function loadSuperintendentsFromFirestore(): Promise<Superintendent[]> {
  try {
    const snap = await getDocs(collection(db, 'superintendentes'));
    return snap.docs.map(d => docToSuperintendent(d.id, d.data()));
  } catch {
    return [];
  }
}

// Get only the currently logged-in user's record from Firestore
export async function getCurrentUserSuperRecord(): Promise<Superintendent | null> {
  const user = auth.currentUser;
  if (!user?.email) return null;
  try {
    const snap = await getDoc(doc(db, 'superintendentes', user.email.toLowerCase()));
    if (!snap.exists()) return null;
    return docToSuperintendent(snap.id, snap.data());
  } catch {
    return null;
  }
}

// Sync from Firestore into localStorage cache. Admins (root or role: admin)
// load the full authoritative list — this REPLACES the local cache, so a
// real Firestore admin record always prevails over DEFAULT_SUPERINTENDENTS
// and never ends up duplicated alongside it. Non-admins only have
// Firestore read access to their own document (see firestore.rules),
// so their sync merges just that one record into the local cache.
export async function syncSuperintendentsFromFirestore(): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) return;

  const myRecord = await getCurrentUserSuperRecord();
  const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() || myRecord?.role === 'admin';

  if (isAdmin) {
    const list = await loadSuperintendentsFromFirestore();
    if (list.length > 0) {
      saveSuperintendents(list);
    }
  } else if (myRecord) {
    const existing = getSuperintendents();
    const idx = existing.findIndex(s => s.email?.toLowerCase() === user.email!.toLowerCase());
    const updated = idx >= 0
      ? existing.map((s, i) => (i === idx ? myRecord : s))
      : [...existing, myRecord];
    saveSuperintendents(updated);
  }
}

// Save a single superintendent to Firestore (admin only action, enforced by
// firestore.rules — this call throws on permission-denied instead
// of falling back to a local-only save; callers must not swallow the error).
export async function saveSuperintendentToFirestore(s: Superintendent): Promise<void> {
  const docId = normalizeEmail(s.email);
  await setDoc(doc(db, 'superintendentes', docId), {
    id: s.id,
    nome: s.nome,
    cargo: s.cargo,
    email: docId,
    escolas: s.escolas,
    ativo: s.ativo,
    role: s.role,
  });
}

// Delete a superintendent from Firestore by email (root admin only action,
// enforced by firestore.rules — the root's own record is rejected
// server-side even if this is called with the root's email).
export async function deleteSuperintendentFromFirestore(email: string): Promise<void> {
  await deleteDoc(doc(db, 'superintendentes', normalizeEmail(email)));
}

// ---- Active workspace ----

export function getActiveSuperintendentId(): string {
  const superintendents = getSuperintendents();
  const stored = localStorage.getItem('sefor3_active_superintendent_id');
  if (stored && stored !== 'all') return stored;
  return superintendents.length > 0 ? superintendents[0].id : '';
}

export function setActiveSuperintendentId(id: string): void {
  const toSave = id === 'all'
    ? (getSuperintendents().length > 0 ? getSuperintendents()[0].id : '')
    : id;
  localStorage.setItem('sefor3_active_superintendent_id', toSave);
  window.dispatchEvent(new Event('sefor3_active_superintendent_change'));
  window.dispatchEvent(new Event('sefor3_filter_change'));
}

// ---- Access control helpers (client-side convenience only — the real
// authorization boundary is firestore.rules; these mirror it so
// the UI can hide/disable controls, never to be relied on for security). ----

// True only for the fixed bootstrap/recovery identity (isPlatformAdmin() in rules).
export function isRootAdmin(): boolean {
  return isRootAdminEmail(auth.currentUser?.email);
}

// True for the root admin OR any active, registered superintendent whose
// own record has role: admin.
export function isCurrentUserAdmin(): boolean {
  const user = auth.currentUser;
  if (!user?.email) return false;
  if (isRootAdmin()) return true;
  const mine = getSuperintendents().find(s => s.email?.toLowerCase() === user.email!.toLowerCase());
  return !!mine && mine.ativo === true && mine.role === 'admin';
}

export function isSchoolVisible(schoolName: string): boolean {
  const activeId = getActiveSuperintendentId();
  const superintendents = getSuperintendents();
  const active = superintendents.find(s => s.id === activeId);
  if (!active) return false;
  return active.escolas.includes(schoolName);
}

export function filterSchoolsByActiveSuperintendent<T extends { nome: string }>(schools: T[]): T[] {
  const activeId = getActiveSuperintendentId();
  const superintendents = getSuperintendents();
  const active = superintendents.find(s => s.id === activeId);
  if (!active) return [];
  return schools.filter(s => active.escolas.includes(s.nome));
}

// Returns true if the currently signed-in user can write to this school.
export function hasSchoolWriteAccess(schoolName: string): boolean {
  const user = auth.currentUser;
  if (!user?.email) return false;
  if (isRootAdmin()) return true;
  const myRecord = getSuperintendents().find(s => s.email?.toLowerCase() === user.email!.toLowerCase());
  if (!myRecord || myRecord.ativo === false) return false;
  if (myRecord.role === 'admin') return true;
  return myRecord.escolas.includes(schoolName);
}

export function addSchoolToLoggedInSuperintendent(schoolName: string): boolean {
  const user = auth.currentUser;
  if (!user?.email) return false;
  const list = getSuperintendents();
  const idx = list.findIndex(s => s.email?.toLowerCase() === user.email!.toLowerCase());
  if (idx === -1) return false;
  if (list[idx].escolas.includes(schoolName)) return false;
  const newList = list.map((s, i) =>
    i === idx ? { ...s, escolas: [...s.escolas, schoolName] } : s
  );
  saveSuperintendents(newList);
  return true;
}
