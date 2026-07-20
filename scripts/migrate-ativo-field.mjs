#!/usr/bin/env node
// Migração aditiva do campo `ativo` na coleção `superintendentes`.
//
// O que faz: para documentos que JÁ EXISTEM e ainda não têm o campo
// booleano `ativo`, propõe (ou grava, se autorizado) `ativo: true` — nada
// além disso. Não cria superintendentes novos, não altera `role`, não
// altera `escolas`, não toca em nome/cargo/email.
//
// Por que isso existe: firestore.rules.proposed passou a tratar `ativo`
// como fail-closed (ausente ou false == bloqueado). Sem rodar isto antes de
// publicar aquelas regras, qualquer superintendente que não seja o admin
// raiz perde acesso.
//
// Segurança:
// - Nenhuma credencial no código. Usa Application Default Credentials do
//   Admin SDK — rode `gcloud auth application-default login` uma vez, ou
//   aponte a env var GOOGLE_APPLICATION_CREDENTIALS para um arquivo de
//   service account local (esse arquivo nunca deve ser commitado — os
//   padrões service-account*.json / firebase-adminsdk*.json já estão no
//   .gitignore deste repo).
// - Modo dry-run é o padrão absoluto: só grava se --write E --confirm
//   forem passados juntos. Qualquer outra combinação (nenhuma flag,
//   --dry-run, só --write, só --confirm) é dry-run.
// - Interrompe imediatamente se o projectId resolvido (lido do mesmo
//   firebase-applet-config.json que o app usa, nunca hardcoded aqui) não
//   for exatamente "sifec-sefor3".
// - Nunca imprime e-mail completo, sempre mascarado.
//
// Uso:
//   node scripts/migrate-ativo-field.mjs                     # dry-run
//   node scripts/migrate-ativo-field.mjs --dry-run            # dry-run (explícito)
//   node scripts/migrate-ativo-field.mjs --write --confirm    # grava de verdade

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const EXPECTED_PROJECT_ID = 'sifec-sefor3';
const COLLECTION = 'superintendentes';

const args = process.argv.slice(2);
const wantsWrite = args.includes('--write');
const confirms = args.includes('--confirm');
const isDryRun = !(wantsWrite && confirms);

function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!domain) return '***';
  const maskedUser =
    user.length <= 2 ? `${user[0]}*` : `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}`;
  return `${maskedUser}@${domain}`;
}

function resolveProjectId() {
  const configPath = new URL('../firebase-applet-config.json', import.meta.url);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  return config.projectId;
}

function getCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`Credenciais: arquivo apontado por GOOGLE_APPLICATION_CREDENTIALS.`);
  } else {
    console.log('Credenciais: Application Default Credentials (gcloud auth application-default login).');
  }
  return applicationDefault();
}

async function main() {
  const projectId = resolveProjectId();
  if (projectId !== EXPECTED_PROJECT_ID) {
    console.error(`ABORTADO: projectId resolvido é "${projectId}", esperado "${EXPECTED_PROJECT_ID}". Nada foi lido ou gravado.`);
    process.exitCode = 1;
    return;
  }

  initializeApp({ credential: getCredential(), projectId });
  const db = getFirestore();

  console.log(`Projeto: ${projectId}`);
  console.log(`Coleção: ${COLLECTION}`);
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (nenhuma gravação será feita)' : 'GRAVAÇÃO REAL (--write --confirm confirmados)'}`);
  console.log('');

  const snap = await db.collection(COLLECTION).get();
  console.log(`Documentos encontrados: ${snap.size}`);

  const missing = [];
  let alreadySetCount = 0;
  snap.forEach((doc) => {
    const data = doc.data();
    if (typeof data.ativo === 'boolean') {
      alreadySetCount += 1;
    } else {
      missing.push(doc.id);
    }
  });

  console.log(`Já têm o campo 'ativo': ${alreadySetCount}`);
  console.log(`SEM o campo 'ativo' (candidatos à migração): ${missing.length}`);
  if (missing.length > 0) {
    console.log("E-mails (mascarados) que receberiam 'ativo: true':");
    missing.forEach((id) => console.log(`  - ${maskEmail(id)}`));
  }

  if (isDryRun) {
    console.log('\nDRY-RUN: nenhuma gravação foi feita.');
    console.log('Para aplicar de verdade: node scripts/migrate-ativo-field.mjs --write --confirm');
    return;
  }

  if (missing.length === 0) {
    console.log('\nNada para gravar — todos os documentos já têm o campo ativo.');
    return;
  }

  console.log(`\nGravando ativo: true em ${missing.length} documento(s)...`);
  const batch = db.batch();
  for (const id of missing) {
    const ref = db.collection(COLLECTION).doc(id);
    // update() (não set()) — falha se o documento tiver sido removido entre
    // a leitura e a escrita, em vez de recriar algo. Só o campo `ativo`.
    batch.update(ref, { ativo: true });
  }
  await batch.commit();
  console.log(`Concluído: ${missing.length} documento(s) atualizado(s) com ativo: true.`);
}

main().catch((err) => {
  console.error('Erro na migração:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
