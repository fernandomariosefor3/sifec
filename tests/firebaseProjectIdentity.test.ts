// Hotfix — SIFEC exibia um painel referenciando o projeto Firebase
// "emdiafinanceiro-13483" (de outro sistema). O texto era hardcoded e nunca
// vinha da config real (ver src/components/NotasView.tsx), mas para garantir
// que isso nunca se torne uma conexão de verdade, src/lib/firebase.ts agora
// falha rápido se firebase-applet-config.json não apontar para sifec-sefor3.
import { describe, expect, it } from 'vitest';
import {
  assertExpectedFirebaseProjectId,
  EXPECTED_FIREBASE_PROJECT_ID,
} from '../src/lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';

describe('identidade do projeto Firebase', () => {
  it('EXPECTED_FIREBASE_PROJECT_ID é sifec-sefor3', () => {
    expect(EXPECTED_FIREBASE_PROJECT_ID).toBe('sifec-sefor3');
  });

  it('firebase-applet-config.json (config oficial usada em produção) aponta para sifec-sefor3', () => {
    expect(firebaseConfig.projectId).toBe('sifec-sefor3');
  });

  it('aceita o projectId oficial sem lançar erro', () => {
    expect(() => assertExpectedFirebaseProjectId('sifec-sefor3')).not.toThrow();
  });

  it('rejeita qualquer projectId diferente do oficial (fail-fast)', () => {
    expect(() => assertExpectedFirebaseProjectId('emdiafinanceiro-13483')).toThrow(
      /projectId esperado "sifec-sefor3"/
    );
  });

  it('rejeita string vazia', () => {
    expect(() => assertExpectedFirebaseProjectId('')).toThrow();
  });
});
