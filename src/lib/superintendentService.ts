import {
  collection, doc, getDocs, setDoc, deleteDoc, getDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';

export interface Superintendent {
  id: string;        // slug for UI state (e.g. 'fernando-mario')
  nome: string;
  cargo: string;
  email: string;     // Google account email — used as Firestore document key
  escolas: string[]; // school names assigned to this superintendent
}

// The single admin email — must match the value in firestore.rules
export const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';

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
    ]
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
    return JSON.parse(data) as Superintendent[];
  } catch {
    return DEFAULT_SUPERINTENDENTS;
  }
}

export function saveSuperintendents(list: Superintendent[]): void {
  localStorage.setItem('sefor3_superintendents', JSON.stringify(list));
  window.dispatchEvent(new Event('sefor3_superintendents_change'));
}

// ---- Firestore operations ----

// Load all superintendent records (admin only — non-admins use getCurrentUserSuperRecord)
export async function loadSuperintendentsFromFirestore(): Promise<Superintendent[]> {
  try {
    const snap = await getDocs(collection(db, 'superintendentes'));
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: (data.id as string) || d.id,
        nome: (data.nome as string) || '',
        cargo: (data.cargo as string) || 'Superintendente Regional',
        email: (data.email as string) || d.id,
        escolas: Array.isArray(data.escolas) ? (data.escolas as string[]) : []
      };
    });
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
    const data = snap.data();
    return {
      id: (data.id as string) || user.email.toLowerCase(),
      nome: (data.nome as string) || user.displayName || 'Superintendente',
      cargo: (data.cargo as string) || 'Superintendente Regional',
      email: (data.email as string) || user.email,
      escolas: Array.isArray(data.escolas) ? (data.escolas as string[]) : []
    };
  } catch {
    return null;
  }
}

// Sync from Firestore into localStorage cache. Admins load all records; others load only their own.
export async function syncSuperintendentsFromFirestore(): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) return;

  const isAdmin = user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  if (isAdmin) {
    const list = await loadSuperintendentsFromFirestore();
    if (list.length > 0) {
      saveSuperintendents(list);
    }
  } else {
    const myRecord = await getCurrentUserSuperRecord();
    if (myRecord) {
      const existing = getSuperintendents();
      const idx = existing.findIndex(s => s.email?.toLowerCase() === user.email!.toLowerCase());
      const updated = idx >= 0
        ? existing.map((s, i) => i === idx ? myRecord : s)
        : [...existing, myRecord];
      saveSuperintendents(updated);
    }
  }
}

// Save a single superintendent to Firestore (admin only action)
export async function saveSuperintendentToFirestore(s: Superintendent): Promise<void> {
  const docId = s.email.toLowerCase().trim();
  await setDoc(doc(db, 'superintendentes', docId), {
    id: s.id,
    nome: s.nome,
    cargo: s.cargo,
    email: s.email.toLowerCase().trim(),
    escolas: s.escolas
  });
}

// Delete a superintendent from Firestore by email (admin only action)
export async function deleteSuperintendentFromFirestore(email: string): Promise<void> {
  await deleteDoc(doc(db, 'superintendentes', email.toLowerCase().trim()));
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

// ---- Access control helpers ----

export function isCurrentUserAdmin(): boolean {
  return auth.currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
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
  if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) return true;
  const list = getSuperintendents();
  const myRecord = list.find(s => s.email?.toLowerCase() === user.email!.toLowerCase());
  return myRecord ? myRecord.escolas.includes(schoolName) : false;
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
