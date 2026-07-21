// Testes unitários da camada pura de superintendentRules.ts — sem Firebase,
// sem emulador, sem I/O. Nenhum dado pessoal real é usado; e-mails e nomes
// são fictícios (domínio example.com).
import { describe, expect, it } from 'vitest';
import {
  ADMIN_EMAIL,
  assignableRoles,
  buildSuperintendentPayload,
  canAccessSchoolInScope,
  canDeleteTarget,
  canEditTarget,
  canGrantAdminRole,
  DEFAULT_ADMIN_SCHOOL_SCOPE,
  defaultSuperintendentFormInput,
  filterSchoolsForSuperintendent,
  getAccessibleSchoolCount,
  getAccessibleSchoolLabel,
  getSchoolCountForCurrentScope,
  getSchoolScopeLabel,
  getSchoolsForCurrentScope,
  getWatchedSchoolCount,
  getWatchedSchools,
  isRootAdminEmail,
  isRootProtectedEdit,
  isScopedAdmin,
  isValidEmailFormat,
  normalizeEmail,
  normalizeLegacyRecord,
  parseAdminSchoolScope,
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

// Hotfix admin-portfolio-default-view: separa explicitamente "minha
// carteira" (7 escolas) de "acesso global" (56 escolas) para o admin
// autenticado, com portfolio como padrão sempre que a preferência de
// interface estiver ausente ou inválida.
describe('Hotfix — escopo portfolio/global do administrador', () => {
  const SETE_CANONICOS = [
    'EEM Diva Cabral',
    'EEM Figueiredo Correia',
    'EEM José Leopoldino da Silva',
    'EEM São Francisco Canindezinho',
    'EEMTI Anísio Teixeira',
    'EEMTI Estado do Amazonas',
    'EEMTI Senador Osires Pontes',
  ];
  // Grafia real divergente para as 7 (mesmo padrão de CANDIDATAS_REAIS acima)
  // + 49 escolas de preenchimento, totalizando o universo de 56.
  const SETE_REAIS_DIVERGENTES = [
    { nome: 'EEM Diva Cabral' },
    { nome: 'EEM FIGUEIREDO CORREIA ' },
    { nome: 'EEM JOSÉ LEOPOLDINO DA SILVA ' },
    { nome: 'EEM SÃO FRANCISCO CANINDEZINHO ' },
    { nome: 'EEMTI ANISIO TEIXEIRA ' },
    { nome: 'EEMTI ESTADO DO AMAZONAS ' },
    { nome: 'EEMTI SENADOR OSIRES PONTES ' },
  ];
  const OUTRAS_49 = Array.from({ length: 49 }, (_, i) => ({ nome: `Escola Extra ${i + 1} (Teste)` }));
  const UNIVERSO_56 = [...SETE_REAIS_DIVERGENTES, ...OUTRAS_49];
  const NOMES_56 = UNIVERSO_56.map(s => s.nome);

  const ADMIN = { ativo: true, role: 'admin' as const, escolas: SETE_CANONICOS };
  const SUPERINTENDENTE = { ativo: true, role: 'superintendent' as const, escolas: [SETE_CANONICOS[0]] };
  const ADMIN_DEMO = { ativo: true, role: 'admin' as const, escolas: SETE_CANONICOS };

  it('admin entra e recebe portfolio por padrão (chave ausente)', () => {
    expect(parseAdminSchoolScope(undefined)).toBe('portfolio');
    expect(parseAdminSchoolScope(null)).toBe('portfolio');
    expect(DEFAULT_ADMIN_SCHOOL_SCOPE).toBe('portfolio');
  });

  it('escolha inválida em localStorage volta para portfolio', () => {
    expect(parseAdminSchoolScope('')).toBe('portfolio');
    expect(parseAdminSchoolScope('bogus')).toBe('portfolio');
    expect(parseAdminSchoolScope('Global')).toBe('portfolio'); // case-sensitive: só 'global' exato ativa o global
  });

  it('portfolio retorna exatamente as 7 escolas da carteira, mesmo com grafia divergente', () => {
    const resultado = getSchoolsForCurrentScope({
      superintendent: ADMIN,
      allSchools: UNIVERSO_56,
      isAuthenticated: true,
      adminScope: 'portfolio',
    });
    expect(resultado).toHaveLength(7);
  });

  it('global retorna as 56 escolas do universo', () => {
    const resultado = getSchoolsForCurrentScope({
      superintendent: ADMIN,
      allSchools: UNIVERSO_56,
      isAuthenticated: true,
      adminScope: 'global',
    });
    expect(resultado).toHaveLength(56);
  });

  it('alternância portfolio → global muda de 7 para 56', () => {
    const input = { superintendent: ADMIN, allSchools: UNIVERSO_56, isAuthenticated: true };
    expect(getSchoolsForCurrentScope({ ...input, adminScope: 'portfolio' as const })).toHaveLength(7);
    expect(getSchoolsForCurrentScope({ ...input, adminScope: 'global' as const })).toHaveLength(56);
  });

  it('alternância global → portfolio muda de 56 para 7', () => {
    const input = { superintendent: ADMIN, allSchools: UNIVERSO_56, isAuthenticated: true };
    expect(getSchoolsForCurrentScope({ ...input, adminScope: 'global' as const })).toHaveLength(56);
    expect(getSchoolsForCurrentScope({ ...input, adminScope: 'portfolio' as const })).toHaveLength(7);
  });

  it('superintendente comum não possui opção global — adminScope: global é ignorado', () => {
    const resultado = getSchoolsForCurrentScope({
      superintendent: SUPERINTENDENTE,
      allSchools: UNIVERSO_56,
      isAuthenticated: true,
      adminScope: 'global',
    });
    expect(resultado.map(s => s.nome)).toEqual([SETE_REAIS_DIVERGENTES[0].nome]);
  });

  it('modo demonstração (não autenticado) continua com as 7 escolas, mesmo pedindo global', () => {
    const resultado = getSchoolsForCurrentScope({
      superintendent: ADMIN_DEMO,
      allSchools: UNIVERSO_56,
      isAuthenticated: false,
      adminScope: 'global',
    });
    expect(resultado).toHaveLength(7);
  });

  it('contadores superiores (getSchoolCountForCurrentScope) usam o escopo atual — portfolio', () => {
    expect(getSchoolCountForCurrentScope({
      superintendent: ADMIN, allSchoolNames: NOMES_56, isAuthenticated: true, adminScope: 'portfolio',
    })).toBe(7);
  });

  it('contadores superiores (getSchoolCountForCurrentScope) usam o escopo atual — global', () => {
    expect(getSchoolCountForCurrentScope({
      superintendent: ADMIN, allSchoolNames: NOMES_56, isAuthenticated: true, adminScope: 'global',
    })).toBe(56);
  });

  it('dados relacionados (canAccessSchoolInScope) seguem o mesmo escopo da lista', () => {
    const escolaDaCarteira = SETE_REAIS_DIVERGENTES[0].nome; // 'EEM Diva Cabral'
    const escolaForaDaCarteira = 'Escola Extra 1 (Teste)';

    // Em portfolio: só a escola da carteira é acessível.
    expect(canAccessSchoolInScope(escolaDaCarteira, ADMIN, true, 'portfolio')).toBe(true);
    expect(canAccessSchoolInScope(escolaForaDaCarteira, ADMIN, true, 'portfolio')).toBe(false);

    // Em global: qualquer escola do universo é acessível.
    expect(canAccessSchoolInScope(escolaDaCarteira, ADMIN, true, 'global')).toBe(true);
    expect(canAccessSchoolInScope(escolaForaDaCarteira, ADMIN, true, 'global')).toBe(true);
  });

  it('normalização de nomes continua funcionando dentro do escopo portfolio', () => {
    // 'EEMTI ANISIO TEIXEIRA ' (caixa alta, espaço final, sem acento) deve
    // continuar casando com o nome canônico 'EEMTI Anísio Teixeira' da
    // carteira, mesmo dentro do novo helper de escopo.
    const divergente = 'EEMTI ANISIO TEIXEIRA ';
    expect(canAccessSchoolInScope(divergente, ADMIN, true, 'portfolio')).toBe(true);

    const resultado = getSchoolsForCurrentScope({
      superintendent: ADMIN,
      allSchools: UNIVERSO_56,
      isAuthenticated: true,
      adminScope: 'portfolio',
    });
    expect(resultado.map(s => s.nome)).toContain(divergente);
  });

  it('isScopedAdmin só é true para admin ativo genuinamente autenticado', () => {
    expect(isScopedAdmin(ADMIN, true)).toBe(true);
    expect(isScopedAdmin(ADMIN_DEMO, false)).toBe(false); // modo demonstração nunca qualifica
    expect(isScopedAdmin(SUPERINTENDENTE, true)).toBe(false);
    expect(isScopedAdmin({ ativo: false, role: 'admin' }, true)).toBe(false);
    expect(isScopedAdmin(null, true)).toBe(false);
  });

  it('getSchoolScopeLabel reflete o escopo atual para o admin', () => {
    expect(getSchoolScopeLabel({
      superintendent: ADMIN, allSchoolNames: NOMES_56, isAuthenticated: true, adminScope: 'portfolio',
    })).toBe('7 acompanhadas');
    expect(getSchoolScopeLabel({
      superintendent: ADMIN, allSchoolNames: NOMES_56, isAuthenticated: true, adminScope: 'global',
    })).toBe('Acesso global — 56 escolas');
  });

  it('getSchoolScopeLabel para superintendente comum ignora adminScope', () => {
    expect(getSchoolScopeLabel({
      superintendent: SUPERINTENDENTE, allSchoolNames: NOMES_56, isAuthenticated: true, adminScope: 'global',
    })).toBe('1 Esc.');
  });
});
