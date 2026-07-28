// Hotfix — bloqueio duplo contra seed em produção. A UI (botão "Inserir
// Cópia Temp / Seed") já não existe no bundle de produção (ver
// NotasView.tsx), mas a própria função também deve recusar rodar se for
// chamada por qualquer outro caminho enquanto import.meta.env.PROD for true.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedFirestoreDatabase } from '../src/lib/firebaseService';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('seedFirestoreDatabase — bloqueio em produção', () => {
  it('recusa executar e não grava nada quando import.meta.env.PROD é true', async () => {
    vi.stubEnv('PROD', true);
    const result = await seedFirestoreDatabase();
    expect(result).toBe(false);
  });
});
