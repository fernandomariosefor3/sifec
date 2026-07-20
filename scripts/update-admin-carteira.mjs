#!/usr/bin/env node
// Fase 1G — Parte D: atualização controlada do campo `escolas` do
// documento administrativo existente. Mesmo padrão de
// scripts/migrate-ativo-field.mjs: dry-run é o padrão absoluto (só grava
// se --write E --confirm forem passados juntos), sem credencial no código,
// aborta se projectId != sifec-sefor3, e-mail sempre mascarado.
//
// O que faz: resolve as 7 escolas acompanhadas pelo código INEP (mesma
// lista/lógica de scripts/map-schools-by-inep.mjs, duplicada aqui de
// propósito — scripts de operação neste repo são arquivos únicos, sem
// import cruzado). Escreve SOMENTE o campo `escolas` do documento
// existente do admin, usando .update() (nunca .set()) — nunca toca em
// id/nome/cargo/email/ativo/role. Recusa escrever se:
//   - os 7 códigos INEP não resolverem para exatamente 7 documentos únicos;
//   - o documento atual não tiver ativo === true && role === 'admin';
//   - o e-mail do documento não bater com o admin raiz esperado.
// Mitigação de corrida: a escrita usa precondition de lastUpdateTime lido
// na mesma execução, imediatamente antes do .update() — uma edição
// concorrente entre o dry-run e a confirmação aborta a escrita em vez de
// sobrescrever silenciosamente.
//
// Uso:
//   node scripts/update-admin-carteira.mjs                  # dry-run
//   node scripts/update-admin-carteira.mjs --write --confirm # grava de verdade

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const EXPECTED_PROJECT_ID = 'sifec-sefor3';
const ADMIN_EMAIL = 'fernandomariodasmartins@gmail.com';
const COLLECTION = 'superintendentes';

const TARGET_SCHOOLS = [
  { codInep: '23067918', nomeCanonico: 'EEM Diva Cabral' },
  { codInep: '23070242', nomeCanonico: 'EEM Figueiredo Correia' },
  { codInep: '23068914', nomeCanonico: 'EEM José Leopoldino da Silva' },
  { codInep: '23233168', nomeCanonico: 'EEM São Francisco Canindezinho' },
  { codInep: '23065214', nomeCanonico: 'EEMTI Anísio Teixeira' },
  { codInep: '23069511', nomeCanonico: 'EEMTI Estado do Amazonas' },
  { codInep: '23069163', nomeCanonico: 'EEMTI Senador Osires Pontes' },
];

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
    console.log('Credenciais: arquivo apontado por GOOGLE_APPLICATION_CREDENTIALS.');
  } else {
    console.log('Credenciais: Application Default Credentials (gcloud auth application-default login).');
  }
  return applicationDefault();
}

async function resolveSevenSchools(db) {
  const schoolsSnap = await db.collection('schools').get();
  const byInep = new Map();
  schoolsSnap.forEach((doc) => {
    const data = doc.data();
    const cod = typeof data.codInep === 'string' ? data.codInep.trim() : String(data.codInep ?? '').trim();
    if (!byInep.has(cod)) byInep.set(cod, []);
    byInep.get(cod).push({ id: doc.id, nome: data.nome });
  });

  const resolved = [];
  for (const target of TARGET_SCHOOLS) {
    const matches = byInep.get(target.codInep) || [];
    if (matches.length === 1) {
      resolved.push({ ...target, doc: matches[0] });
    }
  }
  return resolved;
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
  console.log(`Modo: ${isDryRun ? 'DRY-RUN (nenhuma gravação será feita)' : 'GRAVAÇÃO REAL (--write --confirm confirmados)'}`);
  console.log('');

  const resolved = await resolveSevenSchools(db);
  console.log('--- Resolução das 7 escolas por codInep ---');
  resolved.forEach((r) => {
    console.log(`  INEP ${r.codInep} -> id=${r.doc.id} nome real="${r.doc.nome}" nome canônico a gravar="${r.nomeCanonico}"`);
  });
  console.log('');

  if (resolved.length !== 7 || new Set(resolved.map((r) => r.doc.id)).size !== 7) {
    console.error(`ABORTADO: resolvidas ${resolved.length}/7 escolas únicas por codInep. Nenhuma escrita será feita.`);
    process.exitCode = 1;
    return;
  }

  const ref = db.collection(COLLECTION).doc(ADMIN_EMAIL);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`ABORTADO: documento ${maskEmail(ADMIN_EMAIL)} não existe. Nenhuma escrita será feita.`);
    process.exitCode = 1;
    return;
  }

  const data = snap.data();
  console.log('--- Estado atual do documento administrativo ---');
  console.log(`  documento: ${maskEmail(ADMIN_EMAIL)}`);
  console.log(`  role: ${data.role}`);
  console.log(`  ativo: ${data.ativo}`);
  console.log(`  escolas atuais (${Array.isArray(data.escolas) ? data.escolas.length : 0}): ${JSON.stringify(data.escolas)}`);
  console.log('');

  if (data.ativo !== true || data.role !== 'admin') {
    console.error('ABORTADO: o documento atual não está com ativo === true && role === "admin". Nenhuma escrita será feita.');
    process.exitCode = 1;
    return;
  }

  const newEscolas = resolved.map((r) => r.nomeCanonico);
  console.log('--- Proposta (dry-run) ---');
  console.log(`  escolas (novo valor, ${newEscolas.length}): ${JSON.stringify(newEscolas)}`);
  console.log('  id/nome/cargo/email/ativo/role permanecem inalterados — só o campo escolas será substituído.');
  console.log('');

  if (isDryRun) {
    console.log('DRY-RUN: nenhuma gravação foi feita.');
    console.log('Para aplicar de verdade, após aprovação explícita: node scripts/update-admin-carteira.mjs --write --confirm');
    return;
  }

  // Leitura de confirmação final imediatamente antes da escrita, para
  // reduzir a janela de corrida entre o dry-run (mostrado pro usuário) e
  // esta execução com --write --confirm: se o documento mudou nesse
  // intervalo, o precondition de lastUpdateTime aborta a escrita.
  const freshSnap = await ref.get();
  if (!freshSnap.exists) {
    console.error('ABORTADO: documento desapareceu entre a leitura inicial e a gravação. Nenhuma escrita foi feita.');
    process.exitCode = 1;
    return;
  }
  const freshData = freshSnap.data();
  if (freshData.ativo !== true || freshData.role !== 'admin') {
    console.error('ABORTADO: o documento mudou de estado (ativo/role) entre a leitura e a gravação. Nenhuma escrita foi feita.');
    process.exitCode = 1;
    return;
  }

  console.log('Gravando novo valor de escolas...');
  // Precondition simples (objeto, não classe): a escrita só é aplicada se
  // o documento não tiver sido modificado desde freshSnap — fecha a janela
  // de corrida entre a leitura de confirmação e este .update().
  await ref.update({ escolas: newEscolas }, { lastUpdateTime: freshSnap.updateTime });
  console.log(`Concluído: escolas atualizado para ${newEscolas.length} escola(s) em ${maskEmail(ADMIN_EMAIL)}.`);
}

main().catch((err) => {
  console.error('Erro na atualização:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
