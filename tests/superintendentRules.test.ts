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
  isRootAdminEmail,
  isRootProtectedEdit,
  isValidEmailFormat,
  normalizeEmail,
  normalizeLegacyRecord,
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
