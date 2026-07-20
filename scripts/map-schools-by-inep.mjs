#!/usr/bin/env node
// Fase 1G — Parte A: mapeamento SOMENTE LEITURA das sete escolas acompanhadas
// pelo código INEP, contra a coleção `schools` real.
//
// O que faz: para cada um dos 7 códigos INEP informados no enunciado da
// Fase 1G, procura documentos em `schools` cujo campo `codInep` (com trim)
// bata exatamente. Reporta contagem/id/nome real/status. Gate: só é
// considerado aprovado (7/7) se TODOS os 7 códigos mapearem para exatamente
// 1 documento. Nunca escreve nada em nenhuma coleção.
//
// Extra: auditoria somente-leitura ampliada — para cada superintendente
// ATIVO (não só o admin), verifica se cada entrada de `escolas` bate por
// igualdade EXATA com algum `schools.nome` real. Não altera nada; só avisa
// se algum superintendente comum já está exposto ao mesmo tipo de
// divergência de grafia (para o relatório da Fase 1G, Parte C).
//
// Segurança: mesmo padrão de scripts/migrate-ativo-field.mjs — sem
// credencial no código (Application Default Credentials), aborta se o
// projectId resolvido não for exatamente "sifec-sefor3", nunca imprime
// e-mail completo (sempre mascarado).
//
// Uso:
//   node scripts/map-schools-by-inep.mjs

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const EXPECTED_PROJECT_ID = 'sifec-sefor3';

// As sete escolas acompanhadas (enunciado da Fase 1G) — INEP + nome de
// apresentação canônico já adotado pelo SIFEC (src/lib/firebaseService.ts).
const TARGET_SCHOOLS = [
  { codInep: '23067918', nomeCanonico: 'EEM Diva Cabral' },
  { codInep: '23070242', nomeCanonico: 'EEM Figueiredo Correia' },
  { codInep: '23068914', nomeCanonico: 'EEM José Leopoldino da Silva' },
  { codInep: '23233168', nomeCanonico: 'EEM São Francisco Canindezinho' },
  { codInep: '23065214', nomeCanonico: 'EEMTI Anísio Teixeira' },
  { codInep: '23069511', nomeCanonico: 'EEMTI Estado do Amazonas' },
  { codInep: '23069163', nomeCanonico: 'EEMTI Senador Osires Pontes' },
];

function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  if (!domain) return '***';
  const maskedUser =
    user.length <= 2 ? `${user[0]}*` : `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}`;
  return `${maskedUser}@${domain}`;
}

// Normalização só para a auditoria ampliada (não usada para o gate 7/7, que
// é por codInep) — mesma regra de src/lib/schoolIdentity.ts, duplicada aqui
// porque este script roda fora do pipeline TS/Vite (arquivo único, sem
// import cruzado, mesmo estilo de migrate-ativo-field.mjs).
function normalizeSchoolName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
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
  console.log('Modo: SOMENTE LEITURA (este script nunca escreve).');
  console.log('');

  const schoolsSnap = await db.collection('schools').get();
  console.log(`Documentos em 'schools': ${schoolsSnap.size}`);
  console.log('');

  const byInep = new Map();
  schoolsSnap.forEach((doc) => {
    const data = doc.data();
    const cod = typeof data.codInep === 'string' ? data.codInep.trim() : String(data.codInep ?? '').trim();
    if (!byInep.has(cod)) byInep.set(cod, []);
    byInep.get(cod).push({ id: doc.id, nome: data.nome, status: data.status });
  });

  console.log('--- Parte A: mapeamento das 7 escolas acompanhadas por codInep ---');
  let allResolved = true;
  const resolved = [];
  for (const target of TARGET_SCHOOLS) {
    const matches = byInep.get(target.codInep) || [];
    const ok = matches.length === 1;
    if (!ok) allResolved = false;
    if (ok) resolved.push({ ...target, doc: matches[0] });
    console.log(
      `INEP ${target.codInep} (${target.nomeCanonico}): ${matches.length} documento(s) ${ok ? 'OK' : '=> FALHA'}`
    );
    matches.forEach((m) => {
      console.log(`    id=${m.id} nome real="${m.nome}" status=${m.status}`);
    });
  }
  console.log('');
  console.log(`GATE 7/7: ${allResolved && resolved.length === 7 ? 'PASS' : 'FAIL'}`);
  if (!allResolved || resolved.length !== 7) {
    console.error('ABORTADO: nem todos os 7 códigos INEP mapearam para exatamente 1 documento. Nenhuma escrita deve ser feita.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('--- Extra: auditoria somente-leitura de superintendentes ativos vs schools.nome (igualdade exata) ---');
  const allSchoolNames = new Set(schoolsSnap.docs.map((d) => d.data().nome));
  const superSnap = await db.collection('superintendentes').get();
  let anyDrift = false;
  superSnap.forEach((doc) => {
    const data = doc.data();
    if (data.ativo !== true) return;
    const escolas = Array.isArray(data.escolas) ? data.escolas : [];
    const driftEntries = escolas.filter((nome) => !allSchoolNames.has(nome));
    if (driftEntries.length > 0) {
      anyDrift = true;
      const stillNormalizedMatch = driftEntries.filter((nome) =>
        [...allSchoolNames].some((real) => normalizeSchoolName(real) === normalizeSchoolName(nome))
      );
      console.log(
        `  ${maskEmail(doc.id)} (role=${data.role}): ${driftEntries.length} entrada(s) em 'escolas' sem match EXATO em schools.nome` +
          ` (${stillNormalizedMatch.length} delas bateria(m) por nome normalizado).`
      );
    }
  });
  if (!anyDrift) {
    console.log('  Nenhum superintendente ativo com divergência de grafia detectada.');
  }

  console.log('');
  console.log('Resumo para dry-run da Parte D (7 escolas resolvidas):');
  resolved.forEach((r) => {
    console.log(`  INEP ${r.codInep} -> id=${r.doc.id} nome real="${r.doc.nome}" nome canônico a usar="${r.nomeCanonico}"`);
  });
}

main().catch((err) => {
  console.error('Erro no mapeamento:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
