// @vitest-environment jsdom
// Hotfix estabilização — seção 7: o SIFEC deve funcionar exclusivamente no
// endereço oficial da Vercel (https://sifec-sand.vercel.app/); GitHub Pages
// continua publicado, mas mostra só o aviso (CanonicalHostNotice) em vez de
// rodar o app duplicado. src/lib/canonicalHost.test.ts já cobre a lógica
// pura de isGithubPagesHostname; este teste cobre o comportamento real do
// App() no host — a decisão é lida de window.location.hostname em tempo de
// carga do módulo, então o hostname precisa ser definido ANTES de importar
// App em cada teste (daí vi.resetModules() + import dinâmico).
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.resetModules();
});

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  });
}

vi.mock('../src/lib/firebase', () => ({
  auth: { currentUser: null, onAuthStateChanged: () => () => {} },
  loginWithGoogle: vi.fn(),
  logout: vi.fn(),
  EXPECTED_FIREBASE_PROJECT_ID: 'sifec-sefor3',
}));

// subscribeToCollection precisa existir no mock: App.tsx assina `schools` do
// Firestore desde o hotfix que fez o cabeçalho ler a contagem real em vez de
// SEED_SCHOOLS. Sem isso o render quebra com "No subscribeToCollection export
// is defined". Este arquivo testa o aviso de host canônico, não dados de
// escola, então o stub devolve um unsubscribe no-op e nunca chama o callback.
vi.mock('../src/lib/firebaseService', () => ({
  SEED_SCHOOLS: [],
  subscribeToCollection: () => () => {},
}));

vi.mock('../src/lib/superintendentService', () => ({
  getSuperintendents: () => [],
  getActiveSuperintendentId: () => 'all',
  setActiveSuperintendentId: vi.fn(),
  syncSuperintendentsFromFirestore: vi.fn(),
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
vi.mock('../src/components/SalaDeSituacaoView', () => ({ default: () => <div>SalaDeSituacaoView (stub)</div> }));
vi.mock('../src/components/DevPanel', () => ({ default: () => <div>DevPanel (stub)</div> }));

describe('App — endereço canônico único', () => {
  it('GitHub Pages (*.github.io) mostra somente o aviso, nunca o painel do SIFEC', async () => {
    setHostname('fernandomariosefor3.github.io');
    const { default: App } = await import('../src/App');
    render(<App />);

    expect(screen.getByText('Este endereço não é mais usado pelo SIFEC')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Acessar o SIFEC oficial/ })).toHaveAttribute(
      'href',
      'https://sifec-sand.vercel.app/'
    );
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).not.toBeInTheDocument();
    expect(screen.queryByText('EscolasView (stub)')).not.toBeInTheDocument();
  });

  it('endereço oficial da Vercel roda o painel normalmente, não o aviso', async () => {
    setHostname('sifec-sand.vercel.app');
    const { default: App } = await import('../src/App');
    render(<App />);

    expect(screen.queryByText('Este endereço não é mais usado pelo SIFEC')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });
});
