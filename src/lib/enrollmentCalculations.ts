// Fase 2A — cálculos puros de matrícula mensal, turmas ativas e totais.
// Sem import do Firebase (mesmo padrão de schoolIdentity.ts): toda a
// validação/aritmética fica aqui, testável sem emulador; os serviços em
// src/lib/*Service.ts só chamam estas funções antes de gravar.

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// Formato exigido para `mesReferencia`: YYYY-MM, mês entre 01 e 12.
const MONTH_REFERENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidMonthReference(value: string): boolean {
  return MONTH_REFERENCE_PATTERN.test(value);
}

// O ano de `mesReferencia` (prefixo YYYY) precisa bater com `anoLetivo` —
// evita lançar um mês de 2027 dentro do ano letivo de 2026 (ou vice-versa).
// Só compara o ano quando o formato já é válido; formato inválido é
// responsabilidade de isValidMonthReference.
export function isMonthWithinSchoolYear(mesReferencia: string, anoLetivo: number): boolean {
  return isValidMonthReference(mesReferencia) && Number(mesReferencia.slice(0, 4)) === anoLetivo;
}

export interface EnrollmentMonthMovement {
  matriculaInicioMes: number;
  novasMatriculas: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
  abandono: number;
  outrasSaidas: number;
}

// matriculaCalculada = matriculaInicioMes + novasMatriculas +
// transferenciasEntrada - transferenciasSaida - abandono - outrasSaidas
export function calculateMatriculaFimMes(movement: EnrollmentMonthMovement): number {
  return (
    movement.matriculaInicioMes +
    movement.novasMatriculas +
    movement.transferenciasEntrada -
    movement.transferenciasSaida -
    movement.abandono -
    movement.outrasSaidas
  );
}

// Divergência = matrícula calculada difere da matrícula final informada.
// Nunca corrige automaticamente — só sinaliza para o registro pedir
// observação (ver EnrollmentSnapshotService/UI).
export function hasEnrollmentDivergence(
  movement: EnrollmentMonthMovement,
  matriculaFimMesInformada: number
): boolean {
  return calculateMatriculaFimMes(movement) !== matriculaFimMesInformada;
}

// Todos os seis campos de movimento devem ser inteiros >= 0 antes de
// calcular ou gravar qualquer coisa.
export function isValidEnrollmentMovement(movement: EnrollmentMonthMovement): boolean {
  return (
    isNonNegativeInteger(movement.matriculaInicioMes) &&
    isNonNegativeInteger(movement.novasMatriculas) &&
    isNonNegativeInteger(movement.transferenciasEntrada) &&
    isNonNegativeInteger(movement.transferenciasSaida) &&
    isNonNegativeInteger(movement.abandono) &&
    isNonNegativeInteger(movement.outrasSaidas)
  );
}

export interface TurmaAtivaLike {
  ativa?: boolean;
}

// Turmas legadas (sem o campo `ativa`, anteriores à Fase 2A) contam como
// ativas por padrão — só `ativa: false` explícito as exclui da contagem.
export function countActiveTurmas(turmas: readonly TurmaAtivaLike[]): number {
  return turmas.filter(t => t.ativa !== false).length;
}

// Média de alunos por turma — null quando não há turmas ativas ou a
// matrícula atual ainda não é conhecida (nunca dividir por zero, nunca
// mostrar 0 como se fosse um dado real).
export function calculateAverageStudentsPerClass(
  matriculaAtual: number | null | undefined,
  turmasAtivas: number
): number | null {
  if (matriculaAtual == null || turmasAtivas <= 0) return null;
  return matriculaAtual / turmasAtivas;
}

// Variação = matrícula atual - matrícula inicial. null quando qualquer um
// dos dois lados ainda não foi informado.
export function calculateEnrollmentVariation(
  matriculaInicial: number | null | undefined,
  matriculaAtual: number | null | undefined
): number | null {
  if (matriculaInicial == null || matriculaAtual == null) return null;
  return matriculaAtual - matriculaInicial;
}

export interface EnrollmentAccumulatedTotals {
  entradasAcumuladas: number;
  saidasAcumuladas: number;
}

// Soma de entradas (novas matrículas + transferências de entrada) e saídas
// (transferências de saída + abandono + outras saídas) por uma lista de
// snapshots mensais — usada no resumo do painel da escola.
export function calculateAccumulatedTotals(
  snapshots: readonly EnrollmentMonthMovement[]
): EnrollmentAccumulatedTotals {
  return snapshots.reduce<EnrollmentAccumulatedTotals>(
    (acc, s) => ({
      entradasAcumuladas: acc.entradasAcumuladas + s.novasMatriculas + s.transferenciasEntrada,
      saidasAcumuladas: acc.saidasAcumuladas + s.transferenciasSaida + s.abandono + s.outrasSaidas,
    }),
    { entradasAcumuladas: 0, saidasAcumuladas: 0 }
  );
}

// Última atualização real da escola (seção 9 da revisão final PR #8): a
// mais recente entre school_year (updatedAt/ultimaAtualizacao), os
// snapshots mensais e as turmas — nunca prioriza uma data antiga de
// school_year quando já existe um snapshot ou turma mais recente.
// Comparação por string funciona porque todas as datas são ISO 8601
// (new Date().toISOString()), que ordena lexicograficamente igual a
// cronologicamente.
export function calculateUltimaAtualizacao(
  schoolYear: { updatedAt?: string | null; ultimaAtualizacao?: string | null } | null | undefined,
  snapshots: readonly { updatedAt: string }[],
  turmas: readonly { updatedAt?: string | null }[]
): string | null {
  const candidates: (string | null | undefined)[] = [
    schoolYear?.updatedAt,
    schoolYear?.ultimaAtualizacao,
    ...snapshots.map(s => s.updatedAt),
    ...turmas.map(t => t.updatedAt),
  ];
  const valid = candidates.filter((c): c is string => !!c);
  if (valid.length === 0) return null;
  return valid.reduce((latest, c) => (c > latest ? c : latest));
}

// Rótulo de exibição padrão quando o dado ainda não existe — nunca
// renderizar 0 como se fosse um valor confirmado (seção 10 do plano).
export function formatEnrollmentValue(value: number | null | undefined): string {
  return value == null ? 'Não informado' : String(value);
}

export interface TurmaMatriculaLike extends TurmaAtivaLike {
  matriculaAtual?: number | null;
}

export interface SnapshotLike {
  turmaId: string;
  mesReferencia: string;
  matriculaFimMes: number;
}

// Para cada turma, seleciona só o snapshot do mês mais recente (mesReferencia
// no formato YYYY-MM ordena lexicograficamente igual a cronologicamente).
// Corrigir um mês antigo (gravado DEPOIS de um mês mais novo já existir)
// nunca "vence" o mês mais recente — a comparação é sempre por
// mesReferencia, nunca pela ordem de chegada no array.
export function getLatestSnapshotPerClass<T extends SnapshotLike>(
  snapshots: readonly T[]
): Map<string, T> {
  const latestByTurma = new Map<string, T>();
  for (const snapshot of snapshots) {
    const current = latestByTurma.get(snapshot.turmaId);
    if (!current || snapshot.mesReferencia > current.mesReferencia) {
      latestByTurma.set(snapshot.turmaId, snapshot);
    }
  }
  return latestByTurma;
}

export interface TurmaAtivaIdLike extends TurmaAtivaLike {
  id: string;
}

// Sugestão de matriculaInicioMes para continuidade mensal (seção 9 do
// plano): matriculaFimMes do snapshot mais recente ANTERIOR ao mês
// selecionado, da MESMA turma (snapshotsDaTurma já deve vir filtrado por
// turma pelo chamador). Retorna null quando não há mês anterior lançado —
// turma nova, ou é o primeiro mês da série. Só uma sugestão: o chamador
// decide se aplica (nunca sobrescrever um valor que o usuário já digitou).
export function suggestMatriculaInicioMes<T extends SnapshotLike>(
  snapshotsDaTurma: readonly T[],
  mesReferenciaSelecionado: string
): number | null {
  const anteriores = snapshotsDaTurma.filter(s => s.mesReferencia < mesReferenciaSelecionado);
  if (anteriores.length === 0) return null;
  const maisRecente = anteriores.reduce((latest, s) =>
    s.mesReferencia > latest.mesReferencia ? s : latest
  );
  return maisRecente.matriculaFimMes;
}

export interface SchoolEnrollmentCoverage {
  // Só preenchido quando complete === true — nunca um total parcial
  // apresentado como se fosse a matrícula completa da escola (revisão
  // final PR #8, seção 5).
  total: number | null;
  // Soma do que já é conhecido, mesmo quando incompleto — informação
  // auxiliar ("Parcial: X alunos em Y de Z turmas"), nunca a matrícula
  // total confirmada.
  partialTotal: number;
  activeClassCount: number;
  coveredClassCount: number;
  complete: boolean;
}

// Cobertura da matrícula atual por turma (seção 5 do plano — corrige o
// bug de apresentar um total PARCIAL como se fosse o total confirmado da
// escola). Para cada turma ATIVA, usa nesta ordem:
//   1) matriculaFimMes do snapshot mais recente da turma;
//   2) turma.matriculaAtual como fallback, quando não há snapshot;
//   3) turma sem snapshot E sem matriculaAtual não soma nada e marca a
//      cobertura como incompleta.
// `complete` só é true quando TODAS as turmas ativas foram cobertas (e há
// pelo menos uma turma ativa — 0 de 0 nunca é "completo", ver seção 6).
// `total` só é preenchido quando complete === true; caso contrário fica
// null e o chamador usa `partialTotal`/`coveredClassCount` só como
// informação auxiliar, nunca como matrícula confirmada.
export function calculateCurrentSchoolEnrollmentCoverage<T extends SnapshotLike>(
  snapshots: readonly T[],
  turmas: readonly (TurmaAtivaIdLike & TurmaMatriculaLike)[]
): SchoolEnrollmentCoverage {
  const latestByTurma = getLatestSnapshotPerClass(snapshots);
  const activeTurmas = turmas.filter(t => t.ativa !== false);

  let partialTotal = 0;
  let coveredClassCount = 0;

  for (const turma of activeTurmas) {
    const snapshot = latestByTurma.get(turma.id);
    if (snapshot != null) {
      partialTotal += snapshot.matriculaFimMes;
      coveredClassCount += 1;
    } else if (turma.matriculaAtual != null) {
      partialTotal += turma.matriculaAtual;
      coveredClassCount += 1;
    }
  }

  const activeClassCount = activeTurmas.length;
  const complete = activeClassCount > 0 && coveredClassCount === activeClassCount;

  return {
    total: complete ? partialTotal : null,
    partialTotal,
    activeClassCount,
    coveredClassCount,
    complete,
  };
}

export type EnrollmentCoverageStatus = 'completo' | 'parcial' | 'nao_informado';

// Rótulo de status da cobertura mensal (seção 6 do plano) — compartilhado
// entre SchoolEnrollmentPanel e SchoolsTable para não duplicar a mesma
// lógica de decisão em dois componentes. "0 de N" e "N de 0" nunca contam
// como "completo".
export function describeCoverageStatus(coveredClassCount: number, activeClassCount: number): EnrollmentCoverageStatus {
  if (activeClassCount === 0 || coveredClassCount === 0) return 'nao_informado';
  if (coveredClassCount === activeClassCount) return 'completo';
  return 'parcial';
}

// Rótulo em português exibido na interface — único ponto de tradução
// usado por SchoolEnrollmentPanel e SchoolsTable.
export const COVERAGE_STATUS_LABELS: Record<EnrollmentCoverageStatus, string> = {
  completo: 'Completo',
  parcial: 'Parcial',
  nao_informado: 'Não informado',
};
