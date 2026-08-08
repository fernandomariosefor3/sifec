// @vitest-environment jsdom
// Correção funcional pós-PR #17, item 3: o menu lateral não pode mais
// chamar o módulo de "Lançamento de Notas" — o sistema nunca lançou notas
// individuais, só monitora o preenchimento já feito no SIGE Escola. O
// título interno da tela ("Notas Bimestrais") continua igual — só o rótulo
// do MENU muda. Integração ao PR #19: confirma que o nome "Acompanhamento
// de Notas" (já corrigido pela reestruturação) sobrevive à integração do
// fluxo assistido do relatório do SIGE. Mesmo padrão de mocks de
// tests/appAuthSync.component.test.tsx (views pesadas stubadas — só o
// rótulo do menu importa aqui).
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from '../src/App';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock('../src/lib/firebase', () => ({
  auth: { currentUser: null, onAuthStateChanged: () => () => {} },
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  EXPECTED_FIREBASE_PROJECT_ID: 'sifec-sefor3',
}));

// subscribeToCollection precisa existir no mock: App.tsx assina `schools` do
// Firestore desde o hotfix que fez o cabeçalho ler a contagem real em vez de
// SEED_SCHOOLS. Sem isso o render quebra com "No subscribeToCollection export
// is defined". Este arquivo testa o rótulo do menu de Notas, não dados de
// escola, então o stub devolve um unsubscribe no-op e nunca chama o callback.
vi.mock('../src/lib/firebaseService', () => ({
  SEED_SCHOOLS: [],
  subscribeToCollection: () => () => {},
}));

vi.mock('../src/lib/superintendentService', () => ({
  getSuperintendents: () => [],
  getActiveSuperintendentId: () => 'all',
  setActiveSuperintendentId: vi.fn(),
  syncSuperintendentsFromFirestore: () => Promise.resolve(),
  ADMIN_EMAIL: 'fernandomariodasmartins@gmail.com',
  getWatchedSchoolCount: () => 0,
  getSchoolsForCurrentScope: () => [],
  getSchoolScopeLabel: () => '',
  getAdminSchoolScope: () => 'portfolio',
  setAdminSchoolScope: vi.fn(),
  isScopedAdmin: () => false,
}));

vi.mock('../src/components/EscolasView', () => ({ default: () => <div>EscolasView (stub)</div> }));
vi.mock('../src/components/FluxoView', () => ({ default: () => <div>FluxoView (stub)</div> }));
vi.mock('../src/components/NotasView', () => ({ default: () => <div>NotasView (stub)</div> }));
vi.mock('../src/components/CdgView', () => ({ default: () => <div>CdgView (stub)</div> }));
vi.mock('../src/components/FarolEstudanteView', () => ({ default: () => <div>FarolEstudanteView (stub)</div> }));
vi.mock('../src/components/RecomposicaoView', () => ({ default: () => <div>RecomposicaoView (stub)</div> }));
vi.mock('../src/components/SuperintendentesView', () => ({ default: () => <div>SuperintendentesView (stub)</div> }));
vi.mock('../src/components/ParecerBimestralView', () => ({ default: () => <div>ParecerBimestralView (stub)</div> }));
vi.mock('../src/components/DevPanel', () => ({ default: () => <div>DevPanel (stub)</div> }));

describe('App — menu lateral', () => {
  it('menu mostra "Acompanhamento de Notas", nunca mais "Lançamento de Notas"', () => {
    render(<App />);
    expect(screen.getByText('Acompanhamento de Notas')).toBeInTheDocument();
    expect(screen.queryByText('Lançamento de Notas')).not.toBeInTheDocument();
  });
});
