import { describe, it, expect } from 'vitest';
import {
  montarRelatorioCarteira,
  detectarMetaSuspeita,
  formatarDataRelatorio,
  type SchoolLike,
} from '../src/lib/relatorioCarteira';

// Carteira real da SEFOR 3 em 08/08/2026 — usada como fixture porque os
// totais são conhecidos e conferidos contra o SIGE Escola (Mapa de
// Enturmação, atendimento "Unidade Escolar"): 3.009 matrículas e 117 turmas.
const CARTEIRA: SchoolLike[] = [
  { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918', cidade: 'Fortaleza', regiao: '5ª', matriculas: 821, idebMedio: 4.7, metaIdeb: 5.0, status: 'Ativo' },
  { id: 'figueiredo', nome: 'EEM FIGUEIREDO CORREIA', codInep: '23070242', cidade: 'Fortaleza', regiao: '4ª', matriculas: 286, idebMedio: 5.2, metaIdeb: 5.0, status: 'Ativo' },
  { id: 'leopoldino', nome: 'EEM JOSÉ LEOPOLDINO DA SILVA', codInep: '23068914', cidade: 'Fortaleza', regiao: '5ª', matriculas: 552, idebMedio: 3.8, metaIdeb: 5.0, status: 'Ativo' },
  { id: 'canindezinho', nome: 'EEM SÃO FRANCISCO CANINDEZINHO', codInep: '23233168', cidade: 'Fortaleza', regiao: '5ª', matriculas: 479, idebMedio: 3.6, metaIdeb: 5.0, status: 'Ativo' },
  { id: 'anisio', nome: 'EEMTI ANISIO TEIXEIRA', codInep: '23065214', cidade: 'Fortaleza', regiao: '4ª', matriculas: 276, idebMedio: 4.0, metaIdeb: 5.0, status: 'Ativo' },
  { id: 'amazonas', nome: 'EEMTI ESTADO DO AMAZONAS', codInep: '23069511', cidade: 'Fortaleza', regiao: '4ª', matriculas: 243, idebMedio: 4.9, metaIdeb: 5.0, status: 'Ativo' },
  { id: 'osires', nome: 'EEMTI SENADOR OSIRES PONTES', codInep: '23069163', cidade: 'Fortaleza', regiao: '5ª', matriculas: 352, idebMedio: 4.7, metaIdeb: 5.5, status: 'Ativo' },
];

const TURMAS: Record<string, number> = {
  'diva-cabral': 21, figueiredo: 35, leopoldino: 14, canindezinho: 18,
  anisio: 9, amazonas: 7, osires: 13,
};

describe('montarRelatorioCarteira — totais', () => {
  it('soma matrículas e turmas da carteira', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    expect(r.resumo.totalUnidades).toBe(7);
    expect(r.resumo.totalMatriculas).toBe(3009);
    expect(r.resumo.totalTurmas).toBe(117);
    expect(r.resumo.unidadesAtivas).toBe(7);
  });

  it('distribui as unidades por região', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    expect(r.resumo.unidadesPorRegiao).toEqual({ quarta: 3, quinta: 4, naoInformada: 0 });
  });

  it('identifica maior e menor unidade', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    expect(r.resumo.maiorUnidade).toEqual({ nome: 'EEM Diva Cabral', matriculas: 821 });
    expect(r.resumo.menorUnidade).toEqual({ nome: 'EEMTI ESTADO DO AMAZONAS', matriculas: 243 });
  });

  it('ordena as linhas por matrícula decrescente', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    const mats = r.linhas.map((l) => l.matriculas);
    expect(mats).toEqual([...mats].sort((a, b) => b - a));
  });
});

describe('montarRelatorioCarteira — média por turma', () => {
  it('calcula a média de cada unidade com uma casa decimal', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    const porInep = Object.fromEntries(r.linhas.map((l) => [l.codInep, l.mediaPorTurma]));
    expect(porInep['23067918']).toBe(39.1);
    expect(porInep['23068914']).toBe(39.4);
    expect(porInep['23233168']).toBe(26.6);
  });

  // A Figueiredo Correia tem 35 turmas para 286 estudantes em unidade
  // escolar. A média de 8,2 destoa das demais (26,6 a 39,4) e é justamente o
  // sinal que o relatório precisa deixar visível sem que ninguém calcule à mão.
  it('expõe a média destoante da unidade com muitas turmas pequenas', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    const figueiredo = r.linhas.find((l) => l.codInep === '23070242');
    expect(figueiredo?.mediaPorTurma).toBe(8.2);

    const demais = r.linhas.filter((l) => l.codInep !== '23070242');
    for (const l of demais) {
      expect(l.mediaPorTurma).toBeGreaterThan(20);
    }
  });

  it('não calcula média quando não há turma cadastrada', () => {
    const r = montarRelatorioCarteira(CARTEIRA, {});
    for (const l of r.linhas) {
      expect(l.turmas).toBeNull();
      expect(l.mediaPorTurma).toBeNull();
    }
    expect(r.resumo.mediaPorTurmaCarteira).toBeNull();
  });

  // Zero turmas é um fato cadastrado; ausência de chave é desconhecimento.
  // O relatório precisa distinguir os dois em vez de exibir 0 nos dois casos.
  it('distingue turma zero de turma não informada', () => {
    const semChave = montarRelatorioCarteira([CARTEIRA[0]], {});
    const comZero = montarRelatorioCarteira([CARTEIRA[0]], { 'diva-cabral': 0 });
    expect(semChave.linhas[0].turmas).toBeNull();
    expect(comZero.linhas[0].turmas).toBe(0);
    expect(comZero.linhas[0].mediaPorTurma).toBeNull();
  });
});

describe('montarRelatorioCarteira — pendências', () => {
  it('não aponta pendência quando o cadastro está completo', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    expect(r.pendencias).toEqual([]);
  });

  it('aponta região ausente', () => {
    const semRegiao = [{ ...CARTEIRA[0], regiao: undefined }];
    const r = montarRelatorioCarteira(semRegiao, { 'diva-cabral': 21 });
    expect(r.pendencias.map((p) => p.campo)).toContain('Região');
    expect(r.resumo.unidadesPorRegiao.naoInformada).toBe(1);
  });

  it('aponta matrícula zerada, turma ausente e status não ativo', () => {
    const incompleta: SchoolLike[] = [
      { id: 'x', nome: 'Escola X', codInep: '99999999', cidade: 'Fortaleza', matriculas: 0, idebMedio: 5, metaIdeb: 5, status: 'Pendente' },
    ];
    const r = montarRelatorioCarteira(incompleta, {});
    const campos = r.pendencias.map((p) => p.campo);
    expect(campos).toEqual(expect.arrayContaining(['Região', 'Turmas', 'Matrícula', 'Situação']));
  });

  it('nunca inventa valor para campo ausente', () => {
    const r = montarRelatorioCarteira([{ ...CARTEIRA[0], regiao: undefined }], {});
    expect(r.linhas[0].regiao).toBe('Não informada');
    expect(r.linhas[0].turmas).toBeNull();
  });
});

describe('montarRelatorioCarteira — carteira vazia', () => {
  it('não quebra e devolve resumo neutro', () => {
    const r = montarRelatorioCarteira([], {});
    expect(r.resumo.totalUnidades).toBe(0);
    expect(r.resumo.totalMatriculas).toBe(0);
    expect(r.resumo.maiorUnidade).toBeNull();
    expect(r.resumo.menorUnidade).toBeNull();
    expect(r.resumo.mediaPorTurmaCarteira).toBeNull();
    expect(r.linhas).toEqual([]);
    expect(r.pendencias).toEqual([]);
  });
});

describe('detectarMetaSuspeita', () => {
  // A Meta IDEB está 5,0 em seis das sete unidades — repetição que sugere
  // valor padrão, não meta pactuada por unidade. O relatório sinaliza para
  // conferência, sem afirmar que está errado.
  it('sinaliza meta repetida em mais de dois terços da carteira', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    expect(detectarMetaSuspeita(r.linhas, 'metaIdeb')).toEqual({ valor: 5, ocorrencias: 6 });
  });

  it('não sinaliza quando as metas variam', () => {
    const r = montarRelatorioCarteira(CARTEIRA, TURMAS);
    expect(detectarMetaSuspeita(r.linhas, 'metaSpaece')).toBeNull();
  });

  it('não sinaliza em carteira pequena demais para haver padrão', () => {
    const r = montarRelatorioCarteira(CARTEIRA.slice(0, 2), TURMAS);
    expect(detectarMetaSuspeita(r.linhas, 'metaIdeb')).toBeNull();
  });
});

describe('formatarDataRelatorio', () => {
  it('formata no padrão brasileiro com hora', () => {
    expect(formatarDataRelatorio(new Date(2026, 7, 8, 17, 30).toISOString()))
      .toBe('08/08/2026 às 17:30');
  });
});
