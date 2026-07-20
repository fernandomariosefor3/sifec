// Testes unitários da camada pura de superintendentRules.ts — sem Firebase,
// sem emulador, sem I/O. Nenhum dado pessoal real é usado; e-mails e nomes
// são fictícios (domínio example.com).
import { describe, expect, it } from 'vitest';
import {
  ADMIN_EMAIL,
  assignableRoles,
  buildSuperintendentPayload,
  canDeleteTarget,
  canEditTarget,
  canGrantAdminRole,
  defaultSuperintendentFormInput,
  filterSchoolsForSuperintendent,
  getAccessibleSchoolCount,
  getAccessibleSchoolLabel,
  getWatchedSchoolCount,
  getWatchedSchools,
  isRootAdminEmail,
  isRootProtectedEdit,
  isValidEmailFormat,
  normalizeEmail,
  normalizeLegacyRecord,
  superintendentCanAccessSchool,
  validateSuperintendentInput,
  type Superintendent,
  type SuperintendentFormInput,
} from '../src/lib/superintendentRules';

const EXISTING: Superintendent[] = [
  {
    id: 'super-um', nome: 'Superintendente Um (Teste)', cargo: 'Superintendente Regional',
    email: 'um@example.com', escolas: ['Escola X - Teste'], ativo: true, role: 'superintendent',
  },
];

function baseInput(overrides: Partial<SuperintendentFormInput> = {}): SuperintendentFormInput {
  return { ...defaultSuperintendentFormInput(), nome: 'Novo Superintendente (Teste)', email: 'novo@example.com', escolas: ['Escola Y - Teste'], ...overrides };
}

describe('normalizeEmail / isValidEmailFormat', () => {
  it('e-mail é normalizado (minúsculo, sem espaços nas pontas)', () => {
    expect(normalizeEmail('  Novo.Usuario@Example.COM  ')).toBe('novo.usuario@example.com');
  });

  it('e-mail inválido é rejeitado pela validação de formato', () => {
    expect(isValidEmailFormat('nao-e-email')).toBe(false);
    expect(isValidEmailFormat('sem-arroba.example.com')).toBe(false);
    expect(isValidEmailFormat('valido@example.com')).toBe(true);
  });
});

describe('defaultSuperintendentFormInput — padrão de novo cadastro', () => {
  it('novo usuário recebe ativo: true por padrão', () => {
    expect(defaultSuperintendentFormInput().ativo).toBe(true);
  });

  it('novo usuário recebe role: superintendent por padrão', () => {
    expect(defaultSuperintendentFormInput().role).toBe('superintendent');
  });
});

describe('validateSuperintendentInput', () => {
  it('e-mail inválido é rejeitado', () => {
    const error = validateSuperintendentInput(baseInput({ email: 'invalido' }), EXISTING);
    expect(error?.field).toBe('email');
  });

  it('duplicidade de e-mail é rejeitada', () => {
    const error = validateSuperintendentInput(baseInput({ email: 'UM@example.com' }), EXISTING);
    expect(error?.field).toBe('duplicate');
  });

  it('edição não acusa duplicidade contra o próprio e-mail', () => {
    const error = validateSuperintendentInput(
      baseInput({ email: 'um@example.com', nome: 'Superintendente Um Editado (Teste)' }),
      EXISTING,
      'um@example.com'
    );
    expect(error).toBeNull();
  });

  it('superintendente sem escola é rejeitado', () => {
    const error = validateSuperintendentInput(baseInput({ role: 'superintendent', escolas: [] }), EXISTING);
    expect(error?.field).toBe('escolas');
  });

  it('administrador pode possuir escolas vazias', () => {
    const error = validateSuperintendentInput(baseInput({ role: 'admin', escolas: [] }), EXISTING);
    expect(error).toBeNull();
  });

  it('nome vazio é rejeitado', () => {
    const error = validateSuperintendentInput(baseInput({ nome: '   ' }), EXISTING);
    expect(error?.field).toBe('nome');
  });
});

describe('buildSuperintendentPayload', () => {
  it('normaliza o e-mail no payload final', () => {
    const payload = buildSuperintendentPayload(baseInput({ email: '  Novo@Example.COM ' }));
    expect(payload.email).toBe('novo@example.com');
  });

  it('edição preserva ativo e role informados no formulário', () => {
    const payload = buildSuperintendentPayload(
      baseInput({ email: 'um@example.com', ativo: false, role: 'admin', escolas: [] }),
      'super-um'
    );
    expect(payload.ativo).toBe(false);
    expect(payload.role).toBe('admin');
    expect(payload.id).toBe('super-um');
  });

  it('aplica cargo padrão quando não informado', () => {
    const payload = buildSuperintendentPayload(baseInput({ cargo: '' }));
    expect(payload.cargo).toBe('Superintendente Regional');
  });
});

describe('normalizeLegacyRecord', () => {
  it('registro legado sem ativo/role recebe ativo: true e role: superintendent', () => {
    const normalized = normalizeLegacyRecord({ id: 'legado', nome: 'Legado (Teste)', email: 'legado@example.com' });
    expect(normalized.ativo).toBe(true);
    expect(normalized.role).toBe('superintendent');
  });

  it('o admin raiz é sempre reconhecido como role: admin, mesmo em cache legado', () => {
    const normalized = normalizeLegacyRecord({ id: 'root', nome: 'Admin Raiz (Teste)', email: ADMIN_EMAIL, role: 'superintendent' as any });
    expect(normalized.role).toBe('admin');
  });
});

describe('proteção do administrador raiz', () => {
  it('administrador raiz não pode ser desativado', () => {
    expect(isRootProtectedEdit(ADMIN_EMAIL, { ativo: false, role: 'admin' })).toBe(true);
  });

  it('administrador raiz não pode ser rebaixado', () => {
    expect(isRootProtectedEdit(ADMIN_EMAIL, { ativo: true, role: 'superintendent' })).toBe(true);
  });

  it('manter o admin raiz ativo e admin não é bloqueado', () => {
    expect(isRootProtectedEdit(ADMIN_EMAIL, { ativo: true, role: 'admin' })).toBe(false);
  });

  it('a proteção não se aplica a outros usuários', () => {
    expect(isRootProtectedEdit('outro@example.com', { ativo: false, role: 'superintendent' })).toBe(false);
  });

  it('administrador raiz não pode ser excluído (nem por ele mesmo)', () => {
    expect(canDeleteTarget(true, ADMIN_EMAIL)).toBe(false);
  });

  it('isRootAdminEmail identifica só o e-mail raiz', () => {
    expect(isRootAdminEmail(ADMIN_EMAIL)).toBe(true);
    expect(isRootAdminEmail('outro@example.com')).toBe(false);
    expect(isRootAdminEmail(null)).toBe(false);
  });
});

describe('permissões do administrador cadastrado (não-raiz)', () => {
  it('não consegue promover ninguém a admin', () => {
    expect(canGrantAdminRole(false)).toBe(false);
    expect(assignableRoles(false)).toEqual(['superintendent']);
  });

  it('administrador raiz pode definir qualquer perfil, incluindo admin', () => {
    expect(canGrantAdminRole(true)).toBe(true);
    expect(assignableRoles(true)).toEqual(['admin', 'superintendent']);
  });

  it('pode editar um superintendente comum', () => {
    expect(canEditTarget(false, 'superintendent', 'alguem@example.com', 'admin.cadastrado@example.com')).toBe(true);
  });

  it('não pode editar outro administrador', () => {
    expect(canEditTarget(false, 'admin', 'outro-admin@example.com', 'admin.cadastrado@example.com')).toBe(false);
  });

  it('não pode editar o próprio cadastro', () => {
    expect(canEditTarget(false, 'admin', 'admin.cadastrado@example.com', 'admin.cadastrado@example.com')).toBe(false);
  });

  it('não pode excluir ninguém', () => {
    expect(canDeleteTarget(false, 'alguem@example.com')).toBe(false);
  });
});

describe('permissões do administrador raiz', () => {
  it('pode editar qualquer superintendente ou administrador (exceto a si mesmo, ver proteção do raiz)', () => {
    expect(canEditTarget(true, 'superintendent', 'alguem@example.com', ADMIN_EMAIL)).toBe(true);
    expect(canEditTarget(true, 'admin', 'outro-admin@example.com', ADMIN_EMAIL)).toBe(true);
  });

  it('não pode editar o próprio cadastro pela via genérica (usa isRootProtectedEdit para a proteção real)', () => {
    expect(canEditTarget(true, 'admin', ADMIN_EMAIL, ADMIN_EMAIL)).toBe(true);
  });

  it('pode excluir qualquer um, exceto a si mesmo', () => {
    expect(canDeleteTarget(true, 'alguem@example.com')).toBe(true);
    expect(canDeleteTarget(true, ADMIN_EMAIL)).toBe(false);
  });
});

describe('superintendentCanAccessSchool / filterSchoolsForSuperintendent (hotfix acesso global do admin)', () => {
  const ESCOLA_X = 'Escola X (Teste)';
  const ESCOLA_Y = 'Escola Y (Teste)';
  const TODAS_ESCOLAS = [{ nome: ESCOLA_X }, { nome: ESCOLA_Y }, { nome: 'Escola Z (Teste)' }];

  it('admin ativo com escolas: [] visualiza qualquer escola', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: [] };
    expect(superintendentCanAccessSchool(ESCOLA_X, admin, true)).toBe(true);
    expect(superintendentCanAccessSchool('Qualquer Outra Escola', admin, true)).toBe(true);
  });

  it('admin ativo com uma lista parcial ainda visualiza qualquer escola', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: [ESCOLA_X] };
    expect(superintendentCanAccessSchool(ESCOLA_Y, admin, true)).toBe(true);
  });

  it('admin inativo não recebe acesso', () => {
    const admin = { ativo: false, role: 'admin' as const, escolas: [] };
    expect(superintendentCanAccessSchool(ESCOLA_X, admin, true)).toBe(false);
  });

  it('superintendent ativo vê escola vinculada', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_X] };
    expect(superintendentCanAccessSchool(ESCOLA_X, sup, true)).toBe(true);
  });

  it('superintendent ativo não vê escola não vinculada', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_X] };
    expect(superintendentCanAccessSchool(ESCOLA_Y, sup, true)).toBe(false);
  });

  it('superintendent com escolas: [] não vê escolas (cadastro inválido)', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [] };
    expect(superintendentCanAccessSchool(ESCOLA_X, sup, true)).toBe(false);
  });

  it('registro ausente (null/undefined) não recebe acesso', () => {
    expect(superintendentCanAccessSchool(ESCOLA_X, null, true)).toBe(false);
    expect(superintendentCanAccessSchool(ESCOLA_X, undefined, true)).toBe(false);
  });

  it('filtro para admin autenticado retorna todas as escolas, mesmo com lista parcial', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: [ESCOLA_X] };
    expect(filterSchoolsForSuperintendent(TODAS_ESCOLAS, admin, true)).toEqual(TODAS_ESCOLAS);
  });

  it('filtro para superintendent retorna somente as vinculadas', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_X] };
    expect(filterSchoolsForSuperintendent(TODAS_ESCOLAS, sup, true)).toEqual([{ nome: ESCOLA_X }]);
  });

  it('modo demonstração (não autenticado) preserva o comportamento existente — admin demo só vê sua própria lista', () => {
    // Registro de demonstração (DEFAULT_SUPERINTENDENTS) também é role: 'admin',
    // mas sem autenticação real não deve ganhar acesso global — só o que já
    // está listado em escolas, exatamente como antes deste hotfix.
    const adminDemo = { ativo: true, role: 'admin' as const, escolas: [ESCOLA_X, ESCOLA_Y] };
    expect(superintendentCanAccessSchool(ESCOLA_X, adminDemo, false)).toBe(true);
    expect(superintendentCanAccessSchool('Escola Z (Teste)', adminDemo, false)).toBe(false);
    expect(filterSchoolsForSuperintendent(TODAS_ESCOLAS, adminDemo, false)).toEqual([
      { nome: ESCOLA_X },
      { nome: ESCOLA_Y },
    ]);
  });
});

describe('getAccessibleSchoolCount / getAccessibleSchoolLabel (hotfix contagem global do admin)', () => {
  const NOMES_56 = Array.from({ length: 56 }, (_, i) => `Escola ${i + 1} (Teste)`);

  it('admin autenticado com escolas: [] e allSchools com 56 → contador 56', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: [] };
    expect(getAccessibleSchoolCount({ superintendent: admin, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe(56);
  });

  it('admin autenticado com escolas: [] → rótulo Acesso global', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: [] };
    expect(getAccessibleSchoolLabel({ superintendent: admin, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe('Acesso global');
  });

  it('admin autenticado com lista parcial também recebe o total (não a lista parcial)', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: ['Escola 1 (Teste)'] };
    expect(getAccessibleSchoolCount({ superintendent: admin, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe(56);
  });

  it('superintendent com 2 escolas → contador 2', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: ['Escola 1 (Teste)', 'Escola 2 (Teste)'] };
    expect(getAccessibleSchoolCount({ superintendent: sup, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe(2);
    expect(getAccessibleSchoolLabel({ superintendent: sup, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe('2 Esc.');
  });

  it('superintendent não recebe escola não vinculada (nome inválido não conta)', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: ['Escola 1 (Teste)', 'Escola Inexistente'] };
    expect(getAccessibleSchoolCount({ superintendent: sup, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe(1);
  });

  it('usuário inativo → contador 0', () => {
    const inativo = { ativo: false, role: 'admin' as const, escolas: [] };
    expect(getAccessibleSchoolCount({ superintendent: inativo, allSchoolNames: NOMES_56, isAuthenticated: true })).toBe(0);
  });

  it('modo demonstração (não autenticado) mantém as 7 escolas do registro demo', () => {
    const adminDemo = { ativo: true, role: 'admin' as const, escolas: Array.from({ length: 7 }, (_, i) => `Escola ${i + 1} (Teste)`) };
    expect(getAccessibleSchoolCount({ superintendent: adminDemo, allSchoolNames: NOMES_56, isAuthenticated: false })).toBe(7);
    expect(getAccessibleSchoolLabel({ superintendent: adminDemo, allSchoolNames: NOMES_56, isAuthenticated: false })).toBe('7 Esc.');
  });

  it('array allSchools vazio não é confundido com acesso negado — admin ainda recebe 0, não um erro', () => {
    const admin = { ativo: true, role: 'admin' as const, escolas: [] };
    expect(getAccessibleSchoolCount({ superintendent: admin, allSchoolNames: [], isAuthenticated: true })).toBe(0);
    expect(getAccessibleSchoolLabel({ superintendent: admin, allSchoolNames: [], isAuthenticated: true })).toBe('Acesso global');
  });
});

// Fase 1G — restauração da carteira das sete escolas: o pareamento por
// nome deixa de exigir igualdade exata (era a causa raiz do incidente:
// documentos reais de `schools` com caixa/espaço/acento divergentes do que
// está gravado em `escolas`).
describe('Fase 1G — pareamento tolerante a caixa/espaço/acento', () => {
  const ESCOLA_CANONICA = 'EEMTI Anísio Teixeira';
  const ESCOLA_REAL_DIVERGENTE = 'EEMTI ANISIO TEIXEIRA '; // caixa alta + espaço final + sem acento

  it('superintendente comum acessa a escola mesmo com grafia divergente na lista escolas', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_CANONICA] };
    expect(superintendentCanAccessSchool(ESCOLA_REAL_DIVERGENTE, sup, true)).toBe(true);
  });

  it('filterSchoolsForSuperintendent reconhece a escola real divergente para um superintendente comum', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_CANONICA] };
    const todasEscolas = [{ nome: ESCOLA_REAL_DIVERGENTE }, { nome: 'Outra Escola Qualquer' }];
    expect(filterSchoolsForSuperintendent(todasEscolas, sup, true)).toEqual([{ nome: ESCOLA_REAL_DIVERGENTE }]);
  });

  it('superintendente comum continua restrito a escolas fora da sua lista, mesmo normalizando', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_CANONICA] };
    expect(superintendentCanAccessSchool('EEMTI Estado do Amazonas', sup, true)).toBe(false);
  });

  it('getAccessibleSchoolCount de um superintendente comum não subconta por causa de divergência de grafia', () => {
    const sup = { ativo: true, role: 'superintendent' as const, escolas: [ESCOLA_CANONICA] };
    expect(getAccessibleSchoolCount({ superintendent: sup, allSchoolNames: [ESCOLA_REAL_DIVERGENTE], isAuthenticated: true })).toBe(1);
  });
});

// Fase 1G — "carteira acompanhada" (getWatchedSchools/getWatchedSchoolCount):
// distinta de acesso. O admin mantém acesso global (role) e, em paralelo,
// tem uma carteira de 7 escolas curadas (escolas[]) — um número nunca
// substitui o outro.
describe('Fase 1G — carteira acompanhada do admin (getWatchedSchools/getWatchedSchoolCount)', () => {
  const SETE_NOMES_CANONICOS = [
    'EEM Diva Cabral',
    'EEM Figueiredo Correia',
    'EEM José Leopoldino da Silva',
    'EEM São Francisco Canindezinho',
    'EEMTI Anísio Teixeira',
    'EEMTI Estado do Amazonas',
    'EEMTI Senador Osires Pontes',
  ];
  // Escolas reais como estão hoje em produção: 6 delas com grafia divergente.
  const CANDIDATAS_REAIS = [
    { nome: 'EEM Diva Cabral' },
    { nome: 'EEM FIGUEIREDO CORREIA ' },
    { nome: 'EEM JOSÉ LEOPOLDINO DA SILVA ' },
    { nome: 'EEM SÃO FRANCISCO CANINDEZINHO ' },
    { nome: 'EEMTI ANISIO TEIXEIRA ' },
    { nome: 'EEMTI ESTADO DO AMAZONAS ' },
    { nome: 'EEMTI SENADOR OSIRES PONTES ' },
    { nome: 'Outra Escola Qualquer, fora da carteira' },
  ];
  const ADMIN_COM_CARTEIRA = { ativo: true, role: 'admin' as const, escolas: SETE_NOMES_CANONICOS };

  it('sete códigos INEP resolvem para sete escolas — getWatchedSchools retorna exatamente as 7, não as 8 candidatas', () => {
    const acompanhadas = getWatchedSchools(CANDIDATAS_REAIS, ADMIN_COM_CARTEIRA);
    expect(acompanhadas).toHaveLength(7);
    expect(acompanhadas.map(s => s.nome)).not.toContain('Outra Escola Qualquer, fora da carteira');
  });

  it('painel mostra 7 acompanhadas e, separadamente, Acesso global — os dois nunca se substituem', () => {
    const allSchoolNames = CANDIDATAS_REAIS.map(s => s.nome);
    const acompanhadasCount = getWatchedSchoolCount({ superintendent: ADMIN_COM_CARTEIRA, allSchoolNames, isAuthenticated: true });
    const acesso = getAccessibleSchoolLabel({ superintendent: ADMIN_COM_CARTEIRA, allSchoolNames, isAuthenticated: true });
    expect(acompanhadasCount).toBe(7);
    expect(acesso).toBe('Acesso global');
  });

  it('administrador mantém acesso global mesmo com a carteira de 7 populada (escolas não é a permissão máxima)', () => {
    const allSchoolNames = CANDIDATAS_REAIS.map(s => s.nome);
    expect(getAccessibleSchoolCount({ superintendent: ADMIN_COM_CARTEIRA, allSchoolNames, isAuthenticated: true })).toBe(allSchoolNames.length);
    expect(filterSchoolsForSuperintendent(CANDIDATAS_REAIS, ADMIN_COM_CARTEIRA, true)).toEqual(CANDIDATAS_REAIS);
  });

  it('administrador possui carteira de exatamente sete escolas, sem duplicidade', () => {
    const acompanhadas = getWatchedSchools(CANDIDATAS_REAIS, ADMIN_COM_CARTEIRA);
    const nomesUnicos = new Set(acompanhadas.map(s => s.nome));
    expect(nomesUnicos.size).toBe(7);
  });
});
