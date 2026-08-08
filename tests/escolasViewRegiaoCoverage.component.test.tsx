// @vitest-environment jsdom
// Auditoria da reestruturação SIFEC, seção 4: Gestão de Escolas precisa
// mostrar quantas escolas do escopo visível têm região informada (4ª/5ª) e
// quantas não têm — nunca calcular a proporção 4ª/5ª sobre o total
// (que inclui "não informado" como se fosse uma das duas regiões) e nunca
// apresentar essa cobertura parcial como se fosse o total da carteira.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EscolasView from '../src/components/EscolasView';

afterEach(cleanup);

// vi.mock factories são hoisted para o topo do arquivo — SCHOOLS precisa
// nascer dentro de vi.hoisted() para existir antes da factory rodar (mesmo
// padrão de mockAuth/authStateListeners nos demais testes de componente).
const { SCHOOLS } = vi.hoisted(() => ({
  SCHOOLS: [
    { id: 'a', nome: 'Escola A', codInep: '00000001', cidade: 'Fortaleza', regiao: '4ª' as const, matriculas: 100, idebMedio: 6, metaIdeb: 6.5, status: 'Ativo' as const },
    { id: 'b', nome: 'Escola B', codInep: '00000002', cidade: 'Fortaleza', regiao: '4ª' as const, matriculas: 100, idebMedio: 6, metaIdeb: 6.5, status: 'Ativo' as const },
    { id: 'c', nome: 'Escola C', codInep: '00000003', cidade: 'Fortaleza', regiao: '5ª' as const, matriculas: 100, idebMedio: 6, metaIdeb: 6.5, status: 'Ativo' as const },
    { id: 'd', nome: 'Escola D', codInep: '00000004', cidade: 'Fortaleza', matriculas: 100, idebMedio: 6, metaIdeb: 6.5, status: 'Ativo' as const },
    { id: 'e', nome: 'Escola E', codInep: '00000005', cidade: 'Fortaleza', matriculas: 100, idebMedio: 6, metaIdeb: 6.5, status: 'Ativo' as const },
  ],
}));

vi.mock('../src/lib/firebase', () => ({ auth: { currentUser: null, onAuthStateChanged: () => () => {} } }));

vi.mock('../src/lib/firebaseService', () => ({
  subscribeToCollection: () => () => {},
  addDocument: vi.fn(),
  updateDocument: vi.fn(),
  SEED_SCHOOLS: SCHOOLS,
  SEED_TURMAS: [],
}));

vi.mock('../src/lib/superintendentService', () => ({
  isSchoolVisible: () => true,
  getActiveSuperintendentId: () => 'all',
  addSchoolToLoggedInSuperintendent: vi.fn(),
  isCurrentUserAdmin: () => false,
}));

vi.mock('../src/lib/classService', () => ({
  getClassroomsForSchool: () => [],
  getActiveClassroomCount: () => 0,
}));

describe('EscolasView — cobertura de região (auditoria da reestruturação, seção 4)', () => {
  it('mostra contagem separada de 4ª/5ª e destaca escolas sem região informada, sem misturar os totais', () => {
    render(<EscolasView />);

    expect(screen.getByText('Cobertura de Região')).toBeInTheDocument();
    // 2 escolas com 4ª, 1 com 5ª — nunca soma "não informado" nessas contagens.
    expect(screen.getByText('4ª: 2 · 5ª: 1')).toBeInTheDocument();
    // 2 escolas (D, E) sem região — mostrado à parte, nunca como se fossem uma terceira "região".
    expect(screen.getByText('2 escola(s) sem região informada')).toBeInTheDocument();
  });
});
