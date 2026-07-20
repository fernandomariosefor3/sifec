#!/usr/bin/env node
// Fase 1G — Parte D: backup do documento administrativo ANTES de qualquer
// atualização controlada. Só leitura no Firestore; a única escrita deste
// script é um arquivo local em backups/ (fora do Git — já coberto por
// /backups/ e **/backups/ em .gitignore).
//
// Segurança: mesmo padrão de scripts/migrate-ativo-field.mjs — sem
// credencial no código, aborta se projectId != sifec-sefor3, e-mail sempre
// mascarado no console. `nome`/`cargo` (dados pessoais) nunca vão para o
// console — só para o arquivo de backup local, que é o propósito dele.
//
// Uso:
//   node scripts/backup-superintendent-doc.mjs
//   node scripts/backup-superintendent-doc.mjs --email=outro@dominio.com

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const EXPECTED_PROJECT_ID = 'sifec-sefor3';
const DEFAULT_ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const COLLECTION = 'superintendentes';

const args = process.argv.slice(2);
const emailArg = args.find((a) => a.startsWith('--email='));
const targetEmail = (emailArg ? emailArg.slice('--email='.length) : DEFAULT_ADMIN_EMAIL).trim().toLowerCase();

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
    console.log('Credenciais: arquivo apontado por GOOGLE_APPLICATION_CREDENTIALS.');
  } else {
    console.log('Credenciais: Application Default Credentials (gcloud auth application-default login).');
  }
  return applicationDefault();
}

// Forma canônica fixa e reprodutível para o hash: chaves de topo ordenadas
// alfabeticamente, sem espaçamento variável. A ordem interna do array
// `escolas` é preservada como está (não ordenada) — é o valor real gravado,
// não um conjunto.
function canonicalJson(data) {
  const sortedKeys = Object.keys(data).sort();
  const ordered = {};
  for (const key of sortedKeys) ordered[key] = data[key];
  return JSON.stringify(ordered);
}

async function main() {
  const projectId = resolveProjectId();
  if (projectId !== EXPECTED_PROJECT_ID) {
    console.error(`ABORTADO: projectId resolvido é "${projectId}", esperado "${EXPECTED_PROJECT_ID}". Nada foi lido.`);
    process.exitCode = 1;
    return;
  }

  initializeApp({ credential: getCredential(), projectId });
  const db = getFirestore();

  console.log(`Projeto: ${projectId}`);
  console.log(`Coleção: ${COLLECTION}`);
  console.log(`Documento (mascarado): ${maskEmail(targetEmail)}`);
  console.log('');

  const ref = db.collection(COLLECTION).doc(targetEmail);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`ABORTADO: documento ${maskEmail(targetEmail)} não existe. Nada foi gravado.`);
    process.exitCode = 1;
    return;
  }

  const data = snap.data();
  const json = canonicalJson(data);
  const sha256 = createHash('sha256').update(json).digest('hex');
  const timestamp = new Date().toISOString();

  const backupDir = new URL('../backups/', import.meta.url);
  mkdirSync(backupDir, { recursive: true });
  const fileName = `superintendentes-admin-${timestamp.replace(/[:.]/g, '-')}.json`;
  const filePath = new URL(fileName, backupDir);
  writeFileSync(filePath, JSON.stringify({ timestamp, projectId, docId: targetEmail, sha256, data }, null, 2));

  console.log(`Backup gravado em: backups/${fileName}`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Campos existentes no documento: ${Object.keys(data).sort().join(', ')}`);
  console.log(`role: ${data.role}`);
  console.log(`ativo: ${data.ativo}`);
  console.log(`escolas (valor anterior, ${Array.isArray(data.escolas) ? data.escolas.length : 0} entrada(s)):`);
  (Array.isArray(data.escolas) ? data.escolas : []).forEach((nome) => console.log(`  - ${nome}`));
  console.log('');
  console.log('(nome/cargo não são impressos aqui — dado pessoal; ficam só no arquivo de backup local, fora do Git)');
}

main().catch((err) => {
  console.error('Erro no backup:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
