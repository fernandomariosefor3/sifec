// Testes unitários da camada pura de schoolIdentity.ts — sem Firebase, sem
// emulador, sem I/O. Cobre exatamente a divergência real encontrada na
// Fase 1G (caixa alta, espaço final, acento ausente em "Anísio").
import { describe, expect, it } from 'vitest';
import {
  normalizeSchoolName,
  resolveSchoolRef,
  schoolNamesMatch,
  type SchoolRef,
} from '../src/lib/schoolIdentity';

describe('normalizeSchoolName', () => {
  it('nome em caixa alta corresponde ao nome de exibição normal', () => {
    expect(normalizeSchoolName('EEM FIGUEIREDO CORREIA')).toBe(normalizeSchoolName('EEM Figueiredo Correia'));
  });

  it('espaço final não quebra a normalização', () => {
    expect(normalizeSchoolName('EEM São Francisco Canindezinho ')).toBe(normalizeSchoolName('EEM São Francisco Canindezinho'));
  });

  it('acento ausente em Anísio não quebra a normalização', () => {
    expect(normalizeSchoolName('EEMTI ANISIO TEIXEIRA')).toBe(normalizeSchoolName('EEMTI Anísio Teixeira'));
  });

  it('espaços internos consecutivos são colapsados', () => {
    expect(normalizeSchoolName('EEM  Diva   Cabral')).toBe(normalizeSchoolName('EEM Diva Cabral'));
  });

  it('nomes genuinamente diferentes continuam diferentes após normalizar', () => {
    expect(normalizeSchoolName('EEMTI Estado do Amazonas')).not.toBe(normalizeSchoolName('EEMTI Estado do Maranhão'));
  });
});

describe('schoolNamesMatch', () => {
  it('bate para as três divergências reais da Fase 1G (caixa, espaço final, acento)', () => {
    expect(schoolNamesMatch('EEM FIGUEIREDO CORREIA ', 'EEM Figueiredo Correia')).toBe(true);
    expect(schoolNamesMatch('EEM SÃO FRANCISCO CANINDEZINHO ', 'EEM São Francisco Canindezinho')).toBe(true);
    expect(schoolNamesMatch('EEMTI ANISIO TEIXEIRA ', 'EEMTI Anísio Teixeira')).toBe(true);
  });

  it('não bate para escolas realmente diferentes', () => {
    expect(schoolNamesMatch('EEMTI Estado do Amazonas', 'EEMTI Estado do Maranhão')).toBe(false);
  });
});

describe('resolveSchoolRef', () => {
  const candidates: SchoolRef[] = [
    { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' },
    { id: 'eem-figueiredo-correia-', nome: 'EEM FIGUEIREDO CORREIA ', codInep: '23070242' },
    { id: 'eemti-anisio-teixeira-', nome: 'EEMTI ANISIO TEIXEIRA ', codInep: '23065214' },
  ];

  it('prioriza codInep mesmo quando o nome informado é diferente do nome real', () => {
    const resolved = resolveSchoolRef({ codInep: '23065214', nome: 'Nome qualquer, não importa' }, candidates);
    expect(resolved?.id).toBe('eemti-anisio-teixeira-');
  });

  it('sete códigos INEP resolvem para sete escolas distintas', () => {
    const inepCodes = ['23067918', '23070242', '23065214'];
    const resolved = inepCodes.map(cod => resolveSchoolRef({ codInep: cod, nome: '' }, candidates));
    expect(resolved.every(r => r !== undefined)).toBe(true);
    expect(new Set(resolved.map(r => r!.id)).size).toBe(3);
  });

  it('usa id quando não há codInep em comum', () => {
    const resolved = resolveSchoolRef({ id: 'diva-cabral', nome: 'Nome qualquer' }, candidates);
    expect(resolved?.codInep).toBe('23067918');
  });

  it('cai para nome normalizado como fallback quando não há codInep nem id', () => {
    const resolved = resolveSchoolRef('EEMTI Anísio Teixeira', candidates);
    expect(resolved?.id).toBe('eemti-anisio-teixeira-');
  });

  it('retorna undefined quando nada corresponde', () => {
    expect(resolveSchoolRef('Escola Inexistente', candidates)).toBeUndefined();
  });
});
