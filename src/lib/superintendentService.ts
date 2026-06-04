import { auth } from './firebase';

export interface Superintendent {
  id: string;
  nome: string;
  cargo: string;
  email: string; // Associated email address for authorization
  escolas: string[]; // List of school names of SEFOR 3 assigned to them
}

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
  },
  {
    id: 'ana-lucia',
    nome: 'Profa. Ana Lúcia - Superintendência B',
    cargo: 'Superintendente de Acompanhamento Escolar',
    email: 'ana.lucia@seduc.ce.gov.br',
    escolas: [
      'EEEP JOAQUIM MOREIRA DE SOUSA',
      'EEEP JUAREZ TÁVORA',
      'EEEP PAULO VI',
      'EEM GOVERNADOR ADAUTO BEZERRA',
      'EEFM JOAQUIM ALVES'
    ]
  }
];

export function getSuperintendents(): Superintendent[] {
  const data = localStorage.getItem('sefor3_superintendents');
  if (!data) {
    localStorage.setItem('sefor3_superintendents', JSON.stringify(DEFAULT_SUPERINTENDENTS));
    return DEFAULT_SUPERINTENDENTS;
  }
  try {
    const parsed = JSON.parse(data) as Superintendent[];
    // Auto-migrate by injecting emails for the default ones if missing
    let changed = false;
    const migrated = parsed.map(s => {
      const def = DEFAULT_SUPERINTENDENTS.find(d => d.id === s.id);
      if (def && (!s.email || s.email !== def.email)) {
        changed = true;
        return { ...s, email: s.email || def.email };
      }
      return s;
    });
    if (changed) {
      localStorage.setItem('sefor3_superintendents', JSON.stringify(migrated));
    }
    return migrated;
  } catch (e) {
    return DEFAULT_SUPERINTENDENTS;
  }
}

export function saveSuperintendents(list: Superintendent[]): void {
  localStorage.setItem('sefor3_superintendents', JSON.stringify(list));
  window.dispatchEvent(new Event('sefor3_superintendents_change'));
}

export function getActiveSuperintendentId(): string {
  const superintendents = getSuperintendents();
  const stored = localStorage.getItem('sefor3_active_superintendent_id');
  if (stored && stored !== 'all') {
    return stored;
  }
  return superintendents.length > 0 ? superintendents[0].id : '';
}

export function setActiveSuperintendentId(id: string): void {
  const toSave = id === 'all' ? (getSuperintendents().length > 0 ? getSuperintendents()[0].id : '') : id;
  localStorage.setItem('sefor3_active_superintendent_id', toSave);
  window.dispatchEvent(new Event('sefor3_active_superintendent_change'));
  // Trigger general filter change to force lists to refresh
  window.dispatchEvent(new Event('sefor3_filter_change'));
}

// Check if a school is filtered by the active superintendent
export function isSchoolVisible(schoolName: string): boolean {
  const activeId = getActiveSuperintendentId();
  const superintendents = getSuperintendents();
  const active = superintendents.find(s => s.id === activeId);
  if (!active) return false;
  
  return active.escolas.includes(schoolName);
}

// Get filtered list of schools based on the active superintendent
export function filterSchoolsByActiveSuperintendent<T extends { nome: string }>(schools: T[]): T[] {
  const activeId = getActiveSuperintendentId();
  const superintendents = getSuperintendents();
  const active = superintendents.find(s => s.id === activeId);
  if (!active) return [];
  
  return schools.filter(s => active.escolas.includes(s.nome));
}

// Check if current user has permission to edit/interact with a school
export function hasSchoolWriteAccess(schoolName: string): boolean {
  // Configured to be fully editable in all sections until the end of the year as requested by user
  return true;
}

// Append new school to the logged-in superintendent's jurisdiction
export function addSchoolToLoggedInSuperintendent(schoolName: string): boolean {
  const user = auth.currentUser;
  if (!user || !user.email) return false;

  const list = getSuperintendents();
  const superIndex = list.findIndex(s => s.email?.toLowerCase() === user.email?.toLowerCase());
  if (superIndex === -1) return false;

  if (!list[superIndex].escolas.includes(schoolName)) {
    const updatedEscolas = [...list[superIndex].escolas, schoolName];
    // Create new list
    const newList = list.map((s, idx) => idx === superIndex ? { ...s, escolas: updatedEscolas } : s);
    saveSuperintendents(newList);
    return true;
  }
  return false;
}
