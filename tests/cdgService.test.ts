// Reestruturação SIFEC — Ciclo de Gestão (CdG) simplificado: núcleo puro,
// sem Firestore.
import { describe, expect, it } from 'vitest';
import {
  CdgValidationError,
  buildCdgPlanPayload,
  buildCdgTaskPayload,
  isCdgTaskOverdue,
  validateCdgPlanInput,
  validateCdgTaskInput,
  type SaveCdgPlanInput,
  type SaveCdgTaskInput,
} from '../src/lib/cdgService';

function basePlanInput(overrides: Partial<SaveCdgPlanInput> = {}): SaveCdgPlanInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    situacao: 'Ativo',
    statusExecucao: 'Em execução',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

function baseTaskInput(overrides: Partial<SaveCdgTaskInput> = {}): SaveCdgTaskInput {
  return {
    schoolId: 'diva-cabral',
    codInep: '23067918',
    escolaNome: 'EEM Diva Cabral',
    anoLetivo: 2026,
    acao: 'Reunião de alinhamento',
    responsavel: 'Coordenação pedagógica',
    prazo: '2026-03-20',
    status: 'Em Andamento',
    actingUserEmail: 'super.a@example.com',
    now: '2026-03-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('validateCdgPlanInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateCdgPlanInput(basePlanInput())).not.toThrow();
  });

  it('rejeita situação inválida', () => {
    expect(() => validateCdgPlanInput(basePlanInput({ situacao: 'Suspenso' as SaveCdgPlanInput['situacao'] }))).toThrow(CdgValidationError);
  });

  it('rejeita status de execução inválido', () => {
    expect(() => validateCdgPlanInput(basePlanInput({ statusExecucao: 'Pausado' as SaveCdgPlanInput['statusExecucao'] }))).toThrow(CdgValidationError);
  });
});

describe('buildCdgPlanPayload', () => {
  it('monta o ID determinístico por escola+ano', () => {
    const payload = buildCdgPlanPayload(basePlanInput());
    expect(payload.id).toBe('diva-cabral_2026');
  });
});

describe('validateCdgTaskInput', () => {
  it('aceita um input válido', () => {
    expect(() => validateCdgTaskInput(baseTaskInput())).not.toThrow();
  });

  it('rejeita ação vazia', () => {
    expect(() => validateCdgTaskInput(baseTaskInput({ acao: ' ' }))).toThrow(CdgValidationError);
  });

  it('rejeita responsável vazio', () => {
    expect(() => validateCdgTaskInput(baseTaskInput({ responsavel: '' }))).toThrow(CdgValidationError);
  });

  it('rejeita prazo fora do formato AAAA-MM-DD', () => {
    expect(() => validateCdgTaskInput(baseTaskInput({ prazo: '20-03-2026' }))).toThrow(CdgValidationError);
  });

  it('rejeita status fora da lista permitida', () => {
    expect(() => validateCdgTaskInput(baseTaskInput({ status: 'Cancelado' as SaveCdgTaskInput['status'] }))).toThrow(CdgValidationError);
  });

  it('aceita todos os seis status pedidos pelo plano', () => {
    for (const status of ['Não Iniciado', 'Previsto', 'Em Andamento', 'Concluído', 'Concluído com Atraso', 'Atrasado'] as const) {
      expect(() => validateCdgTaskInput(baseTaskInput({ status }))).not.toThrow();
    }
  });
});

describe('buildCdgTaskPayload', () => {
  it('gera um ID novo (opaco) quando não é edição', () => {
    const payload = buildCdgTaskPayload(baseTaskInput());
    expect(payload.id).toBeTruthy();
  });

  it('preserva o ID e createdAt ao editar uma tarefa existente', () => {
    const existing = buildCdgTaskPayload(baseTaskInput());
    const updated = buildCdgTaskPayload(baseTaskInput({ status: 'Concluído' }), existing);
    expect(updated.id).toBe(existing.id);
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.status).toBe('Concluído');
  });
});

describe('isCdgTaskOverdue', () => {
  const today = '2026-03-15';

  it('tarefa com prazo no passado e status não concluído está atrasada', () => {
    expect(isCdgTaskOverdue({ prazo: '2026-03-01', status: 'Em Andamento' }, today)).toBe(true);
  });

  it('tarefa com prazo no futuro nunca está atrasada, mesmo não concluída', () => {
    expect(isCdgTaskOverdue({ prazo: '2026-04-01', status: 'Não Iniciado' }, today)).toBe(false);
  });

  it('tarefa concluída (mesmo com prazo vencido) nunca conta como atrasada', () => {
    expect(isCdgTaskOverdue({ prazo: '2026-03-01', status: 'Concluído' }, today)).toBe(false);
    expect(isCdgTaskOverdue({ prazo: '2026-03-01', status: 'Concluído com Atraso' }, today)).toBe(false);
  });

  it('prazo exatamente hoje nunca está atrasado', () => {
    expect(isCdgTaskOverdue({ prazo: today, status: 'Em Andamento' }, today)).toBe(false);
  });
});
