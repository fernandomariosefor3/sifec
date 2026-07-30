// Fase 2D — pendências operacionais (sem Firestore). Cada pendência deve
// explicar o que falta, de qual período, de qual coleção e qual ação
// resolve (seção 9 do plano) — nunca um rótulo genérico de julgamento.
import { describe, expect, it } from 'vitest';
import { buildPendingItems, type PendingItemsInput } from '../src/lib/schoolSituationPendencies';
import type {
  EnrollmentMovementIndicators,
  GradeFillIndicators,
  SchoolFlowIndicators,
  SchoolStructureIndicators,
  VisitIndicators,
} from '../src/types/schoolSituation';

const ESTRUTURA_OK: SchoolStructureIndicators = {
  turmasCadastradas: 2, turmasAtivas: 2, matriculaInicial: 50, matriculaAtual: 48,
  mediaAlunosPorTurma: 24, anoLetivoConfigurado: true, dataQuality: 'atualizado',
};
const MATRICULA_OK: EnrollmentMovementIndicators = {
  matriculaInicial: 50, novasMatriculas: 0, transferenciasEntrada: 0, transferenciasSaida: 0,
  abandono: 0, outrasSaidas: 0, matriculaFinalCalculada: 48, ultimoMesPreenchido: '2026-03',
  quantidadeMesesRegistrados: 3, quantidadeMesesPendentes: 0, dataQuality: 'atualizado',
};
const FLUXO_CONFIRMADO: SchoolFlowIndicators = {
  aprovados: 40, reprovados: 5, abandono: 3, totalInformado: 48,
  percentualAprovacao: 83.3, percentualReprovacao: 10.4, percentualAbandono: 6.3,
  status: 'confirmado', dataQuality: 'atualizado',
};
const NOTAS_COMPLETAS: GradeFillIndicators = {
  estudantesAtivos: 10, completos: 10, parciais: 0, semNotas: 0, abaixoReferencia: 0,
  percentualPreenchimento: 100, turmasComPreenchimentoCompleto: 1, turmasComPendencia: 0, dataQuality: 'atualizado',
};
const VISITA_OK: VisitIndicators = {
  quantidadeVisitasNoAno: 1, dataUltimaVisita: '2026-03-01', semVisitaNoAno: false, dataQuality: 'atualizado',
};

function baseInput(overrides: Partial<PendingItemsInput> = {}): PendingItemsInput {
  return {
    schoolId: 'esc1',
    anoLetivo: 2026,
    estrutura: ESTRUTURA_OK,
    matricula: MATRICULA_OK,
    fluxo: FLUXO_CONFIRMADO,
    notas: NOTAS_COMPLETAS,
    visitas: VISITA_OK,
    turmasSemAnoLetivo: 0,
    ...overrides,
  };
}

describe('buildPendingItems', () => {
  it('escola totalmente em dia não gera nenhuma pendência', () => {
    expect(buildPendingItems(baseInput())).toEqual([]);
  });

  it('ano letivo não configurado gera pendência com período e coleção de origem', () => {
    const items = buildPendingItems(baseInput({
      estrutura: { ...ESTRUTURA_OK, anoLetivoConfigurado: false },
    }));
    const item = items.find(i => i.type === 'ano_letivo_nao_configurado');
    expect(item).toBeDefined();
    expect(item?.period).toBe('2026');
    expect(item?.sourceCollection).toBe('school_years');
    expect(item?.resolutionAction).toBeTruthy();
  });

  it('nenhuma turma cadastrada gera pendência própria', () => {
    const items = buildPendingItems(baseInput({
      estrutura: { ...ESTRUTURA_OK, turmasCadastradas: 0 },
    }));
    expect(items.some(i => i.type === 'nenhuma_turma_cadastrada')).toBe(true);
  });

  it('turma sem ano letivo gera pendência distinta de "nenhuma turma cadastrada"', () => {
    const items = buildPendingItems(baseInput({ turmasSemAnoLetivo: 2 }));
    const item = items.find(i => i.type === 'turma_sem_ano_letivo');
    expect(item?.message).toContain('2');
  });

  it('registro mensal pendente aparece quando há meses sem cobertura', () => {
    const items = buildPendingItems(baseInput({
      matricula: { ...MATRICULA_OK, quantidadeMesesPendentes: 2 },
    }));
    expect(items.some(i => i.type === 'registro_mensal_pendente')).toBe(true);
  });

  it('fluxo não informado e fluxo rascunho são mutuamente exclusivos', () => {
    const naoInformado = buildPendingItems(baseInput({
      fluxo: { ...FLUXO_CONFIRMADO, status: 'nao_informado' },
    }));
    expect(naoInformado.filter(i => i.type === 'fluxo_nao_informado' || i.type === 'fluxo_rascunho')).toHaveLength(1);

    const rascunho = buildPendingItems(baseInput({
      fluxo: { ...FLUXO_CONFIRMADO, status: 'rascunho' },
    }));
    expect(rascunho.some(i => i.type === 'fluxo_rascunho')).toBe(true);
    expect(rascunho.some(i => i.type === 'fluxo_nao_informado')).toBe(false);
  });

  it('não gera pendência de notas quando notas ainda não foram carregadas (null)', () => {
    const items = buildPendingItems(baseInput({ notas: null }));
    expect(items.some(i => i.type === 'estudantes_sem_notas' || i.type === 'notas_parcialmente_preenchidas')).toBe(false);
  });

  it('estudantes sem notas e notas parciais geram pendências distintas', () => {
    const items = buildPendingItems(baseInput({
      notas: { ...NOTAS_COMPLETAS, completos: 5, parciais: 3, semNotas: 2, percentualPreenchimento: 70 },
    }));
    expect(items.some(i => i.type === 'estudantes_sem_notas')).toBe(true);
    expect(items.some(i => i.type === 'notas_parcialmente_preenchidas')).toBe(true);
  });

  it('escola sem visita no ano gera pendência', () => {
    const items = buildPendingItems(baseInput({
      visitas: { ...VISITA_OK, semVisitaNoAno: true, quantidadeVisitasNoAno: 0, dataUltimaVisita: null },
    }));
    expect(items.some(i => i.type === 'escola_sem_visita')).toBe(true);
  });

  it('nunca usa rótulos genéricos de julgamento', () => {
    const items = buildPendingItems(baseInput({
      estrutura: { ...ESTRUTURA_OK, anoLetivoConfigurado: false, turmasCadastradas: 0 },
      fluxo: { ...FLUXO_CONFIRMADO, status: 'nao_informado' },
    }));
    const forbidden = ['grave', 'ruim', 'ineficiente', 'risco'];
    for (const item of items) {
      for (const word of forbidden) {
        expect(item.message.toLowerCase()).not.toContain(word);
      }
    }
  });
});
