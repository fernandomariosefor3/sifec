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

// Rótulo de exibição padrão quando o dado ainda não existe — nunca
// renderizar 0 como se fosse um valor confirmado (seção 10 do plano).
export function formatEnrollmentValue(value: number | null | undefined): string {
  return value == null ? 'Não informado' : String(value);
}

export interface TurmaMatriculaLike extends TurmaAtivaLike {
  matriculaAtual?: number | null;
}

// Matrícula atual da escola = soma da matrícula atual das turmas ATIVAS que
// já têm o dado preenchido. Retorna null quando nenhuma turma ativa tem
// matriculaAtual conhecida (nunca soma 0 turmas como se fosse "zero alunos").
export function calculateSchoolMatriculaAtual(
  turmas: readonly TurmaMatriculaLike[]
): number | null {
  const known = turmas.filter(t => t.ativa !== false && t.matriculaAtual != null);
  if (known.length === 0) return null;
  return known.reduce((sum, t) => sum + (t.matriculaAtual as number), 0);
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

// Matrícula atual da escola a partir do histórico mensal (seção 8 do
// plano): soma matriculaFimMes do snapshot MAIS RECENTE de cada turma
// ATIVA — nunca soma todos os meses, e turma inativa nunca entra na soma
// mesmo que tenha snapshot recente. Retorna null quando nenhuma turma
// ativa tem snapshot algum (o chamador decide o fallback — ver precedência
// de exibição no hook/painel).
export function calculateCurrentSchoolEnrollmentFromSnapshots<T extends SnapshotLike>(
  snapshots: readonly T[],
  turmas: readonly TurmaAtivaIdLike[]
): number | null {
  const latestByTurma = getLatestSnapshotPerClass(snapshots);
  const activeTurmaIds = new Set(turmas.filter(t => t.ativa !== false).map(t => t.id));

  let total = 0;
  let matchCount = 0;
  for (const [turmaId, snapshot] of latestByTurma) {
    if (!activeTurmaIds.has(turmaId)) continue;
    total += snapshot.matriculaFimMes;
    matchCount += 1;
  }
  return matchCount === 0 ? null : total;
}
