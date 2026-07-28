import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// O SIFEC deve conectar exclusivamente ao projeto sifec-sefor3. Falha rápida
// e explícita evita que uma reconfiguração acidental (ou config copiada de
// outro sistema) conecte a produção a um projeto Firebase incorreto. Extraída
// como função pura (em vez de um if solto) para poder ser testada sem
// inicializar o SDK do Firebase de verdade.
export const EXPECTED_FIREBASE_PROJECT_ID = 'sifec-sefor3';

export function assertExpectedFirebaseProjectId(projectId: string): void {
  if (projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
    throw new Error(
      `Firebase mal configurado: projectId esperado "${EXPECTED_FIREBASE_PROJECT_ID}", mas firebase-applet-config.json aponta para "${projectId}". Inicialização interrompida para evitar conexão com projeto Firebase incorreto.`
    );
  }
}

assertExpectedFirebaseProjectId(firebaseConfig.projectId);

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// --- App Check (Fase 0 — etapa 1: monitoramento, sem enforcement) ---------
// Fica inativo até que VITE_RECAPTCHA_SITE_KEY seja configurado (não
// inventamos uma chave aqui). Depois de registrar o app em App Check no
// Firebase Console e definir essa env var, os tokens passam a ser anexados
// às chamadas do Firestore automaticamente. Isso sozinho NÃO bloqueia
// nenhum tráfego: o bloqueio (enforcement) é uma configuração separada,
// feita manualmente no Firebase Console por coleção/serviço, e só deve ser
// ativada depois de observar as métricas de App Check por um tempo e
// confirmar que usuários legítimos não estão sendo marcados como inválidos.
// Em desenvolvimento local, defina self.FIREBASE_APPCHECK_DEBUG_TOKEN antes
// de chamar initializeAppCheck (ver README/Firebase Console para o token de
// depuração) para não precisar resolver reCAPTCHA a cada reload.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Interactive helper to authenticate
export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Erro ao fazer login com Google:", error);
    throw error;
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
    throw error;
  }
}
