// Correção funcional pós-PR #17 — uma linha (turma) do fluxo "Registrar
// relatório do SIGE". Cálculo em tempo real (soma de estudantes, percentual,
// situação resultante, erros matemáticos) usando as MESMAS funções puras de
// GradeEntryMonitoringFormModal.tsx — nunca duplica a lógica de
// classificação. Nunca aceita nome de estudante, nota individual ou
// matrícula individual — só os totais agregados por turma.
import { CheckCircle2, HelpCircle, PlusCircle, Search, Trash2 } from 'lucide-react';
import {
  calculateCompletionPercentage,
  classifyTurmaGradeEntryStatus,
  type TurmaGradeEntryStatus,
} from '../../lib/gradeEntryMonitoringCalculations';
import { matchTurmaForReportRow } from '../../lib/sigeReportMatching';
import type { Turma } from '../../types/classroom';
import type { GradeEntryMonitoringStatus } from '../../types/gradeEntryMonitoring';

const RESULTING_STATUS_INFO: Record<TurmaGradeEntryStatus, { label: string; className: string }> = {
  nao_informado: { label: 'Não informado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  sem_preenchimento: { label: 'Sem preenchimento', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  parcial: { label: 'Preenchimento parcial', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completo: { label: 'Preenchimento completo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inconsistente: { label: 'Inconsistente', className: 'bg-orange-50 text-orange-700 border-orange-300' },
};

export interface SigeReportRowDraft {
  turmaNome: string;
  turno: string;
  matriculaAtual: string;
  totalStudents: string;
  studentsWithCompleteGrades: string;
  studentsWithPartialGrades: string;
  studentsWithoutGrades: string;
  expectedGradeEntries: string;
  completedGradeEntries: string;
  status: GradeEntryMonitoringStatus;
  // '' = ainda sem escolha manual; '__nova__' = usuário escolheu "nenhuma —
  // é uma turma nova" entre os candidatos; um ID real = turma escolhida
  // manualmente entre os candidatos ambíguos.
  selectedTurmaId: string;
  // Checkbox de confirmação humana explícita — só importa quando a
  // correspondência não é automática (nao_cadastrada, ou
  // possivel_correspondencia + selectedTurmaId === '__nova__').
  confirmNovaTurma: boolean;
}

export function buildEmptyRowDraft(): SigeReportRowDraft {
  return {
    turmaNome: '', turno: '', matriculaAtual: '',
    totalStudents: '', studentsWithCompleteGrades: '', studentsWithPartialGrades: '', studentsWithoutGrades: '',
    expectedGradeEntries: '', completedGradeEntries: '',
    status: 'rascunho',
    selectedTurmaId: '', confirmNovaTurma: false,
  };
}

function parseCount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return NaN;
  return Number(trimmed);
}

export interface RowResolution {
  // Turma real já resolvida (encontrada automaticamente ou escolhida
  // manualmente) — null enquanto pendente ou quando será uma turma nova.
  resolvedTurmaId: string | null;
  // true só quando o usuário confirmou explicitamente a criação — nunca
  // por padrão.
  isNovaTurmaConfirmada: boolean;
  // true quando a linha ainda precisa de uma decisão humana (ambígua sem
  // escolha, ou nova sem confirmação) antes de poder ser salva.
  needsUserChoice: boolean;
}

// Resolução em tempo real da correspondência — nunca associa
// automaticamente quando há ambiguidade (a própria matchTurmaForReportRow
// já garante isso); aqui só se decide o que fazer com cada status.
export function resolveRowMatch(row: SigeReportRowDraft, existingTurmas: readonly Turma[]): RowResolution {
  const match = matchTurmaForReportRow({ turmaNome: row.turmaNome, turno: row.turno || undefined }, existingTurmas);

  if (match.status === 'encontrada') {
    return { resolvedTurmaId: match.turma!.id, isNovaTurmaConfirmada: false, needsUserChoice: false };
  }
  if (match.status === 'nao_cadastrada') {
    return { resolvedTurmaId: null, isNovaTurmaConfirmada: row.confirmNovaTurma, needsUserChoice: !row.confirmNovaTurma };
  }
  // possivel_correspondencia — exige escolha manual entre os candidatos ou
  // confirmação explícita de que é uma turma nova.
  if (row.selectedTurmaId === '__nova__') {
    return { resolvedTurmaId: null, isNovaTurmaConfirmada: row.confirmNovaTurma, needsUserChoice: !row.confirmNovaTurma };
  }
  // Item 2 do code review do PR #18: selectedTurmaId só é válido quando
  // pertence aos candidatos ATUAIS — uma escolha feita para um texto
  // anterior (antes do usuário editar turmaNome/turno) nunca pode
  // "sobreviver" silenciosamente à alteração. Na prática o componente já
  // limpa selectedTurmaId sempre que turmaNome/turno mudam (ver
  // SigeReportRowEditor), mas esta checagem é a defesa em profundidade —
  // nunca confia cegamente num ID armazenado.
  if (row.selectedTurmaId && match.candidates.some(c => c.id === row.selectedTurmaId)) {
    return { resolvedTurmaId: row.selectedTurmaId, isNovaTurmaConfirmada: false, needsUserChoice: false };
  }
  return { resolvedTurmaId: null, isNovaTurmaConfirmada: false, needsUserChoice: true };
}

// Turma canônica (objeto completo, não só o ID) já resolvida para esta
// linha — null enquanto pendente ou quando será uma turma nova. Usado pela
// UI para mostrar dados REAIS da turma (ex.: matrícula atual cadastrada),
// nunca o texto solto digitado pelo usuário.
export function resolveRowTurma(row: SigeReportRowDraft, existingTurmas: readonly Turma[]): Turma | null {
  const resolution = resolveRowMatch(row, existingTurmas);
  if (!resolution.resolvedTurmaId) return null;
  return existingTurmas.find(t => t.id === resolution.resolvedTurmaId) ?? null;
}

// Correção da integração ao PR #19, seção 7: matrícula atual para turma
// NOVA é obrigatória — vazio é rejeitado (mesmo zero explícito sendo
// aceito). Só dígitos (nunca negativo, nunca decimal). Sempre `true`
// quando a linha não é uma turma nova (o campo é só informativo nesse
// caso — ver matriculaAtual disabled no editor abaixo), então nunca
// bloqueia uma linha de turma existente.
function isMatriculaValidForNewTurma(row: SigeReportRowDraft, isNovaTurmaConfirmada: boolean): boolean {
  if (!isNovaTurmaConfirmada) return true;
  return /^\d+$/.test(row.matriculaAtual.trim());
}

export interface RowComputed {
  match: ReturnType<typeof matchTurmaForReportRow>;
  resolution: RowResolution;
  allFieldsFilled: boolean;
  sumMatches: boolean;
  entriesConsistent: boolean;
  studentsSum: number;
  percentage: number | null;
  resultingStatus: TurmaGradeEntryStatus;
  isMathematicallyValid: boolean;
  matriculaValid: boolean;
  isFullyResolved: boolean;
}

export function computeRow(row: SigeReportRowDraft, existingTurmas: readonly Turma[]): RowComputed {
  const parsed = {
    totalStudents: parseCount(row.totalStudents),
    studentsWithCompleteGrades: parseCount(row.studentsWithCompleteGrades),
    studentsWithPartialGrades: parseCount(row.studentsWithPartialGrades),
    studentsWithoutGrades: parseCount(row.studentsWithoutGrades),
    expectedGradeEntries: parseCount(row.expectedGradeEntries),
    completedGradeEntries: parseCount(row.completedGradeEntries),
  };
  const allFieldsFilled = Object.values(parsed).every(v => !Number.isNaN(v));
  const studentsSum = parsed.studentsWithCompleteGrades + parsed.studentsWithPartialGrades + parsed.studentsWithoutGrades;
  const sumMatches = allFieldsFilled && studentsSum === parsed.totalStudents;
  const entriesConsistent = allFieldsFilled && parsed.completedGradeEntries <= parsed.expectedGradeEntries;
  const percentage = allFieldsFilled ? calculateCompletionPercentage(parsed) : null;
  const resultingStatus: TurmaGradeEntryStatus = allFieldsFilled ? classifyTurmaGradeEntryStatus(parsed) : 'nao_informado';
  const match = matchTurmaForReportRow({ turmaNome: row.turmaNome, turno: row.turno || undefined }, existingTurmas);
  const resolution = resolveRowMatch(row, existingTurmas);
  const isMathematicallyValid = allFieldsFilled && sumMatches && entriesConsistent;
  const matriculaValid = isMatriculaValidForNewTurma(row, resolution.isNovaTurmaConfirmada);
  const isFullyResolved = row.turmaNome.trim() !== '' && !resolution.needsUserChoice &&
    (resolution.resolvedTurmaId != null || resolution.isNovaTurmaConfirmada) && matriculaValid;

  return { match, resolution, allFieldsFilled, sumMatches, entriesConsistent, studentsSum, percentage, resultingStatus, isMathematicallyValid, matriculaValid, isFullyResolved };
}

const NUMERIC_FIELDS: { key: keyof Pick<SigeReportRowDraft,
  'totalStudents' | 'studentsWithCompleteGrades' | 'studentsWithPartialGrades' | 'studentsWithoutGrades' | 'expectedGradeEntries' | 'completedGradeEntries'
>; label: string }[] = [
  { key: 'totalStudents', label: 'Total de estudantes' },
  { key: 'studentsWithCompleteGrades', label: 'Notas completas' },
  { key: 'studentsWithPartialGrades', label: 'Preenchimento parcial' },
  { key: 'studentsWithoutGrades', label: 'Sem notas' },
  { key: 'expectedGradeEntries', label: 'Lançamentos esperados' },
  { key: 'completedGradeEntries', label: 'Lançamentos realizados' },
];

interface SigeReportRowEditorProps {
  row: SigeReportRowDraft;
  index: number;
  existingTurmas: readonly Turma[];
  onChange: (index: number, next: SigeReportRowDraft) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

export default function SigeReportRowEditor({
  row, index, existingTurmas, onChange, onRemove, canRemove,
}: SigeReportRowEditorProps) {
  const computed = computeRow(row, existingTurmas);
  const { match, resolution } = computed;
  const resolvedTurma = resolveRowTurma(row, existingTurmas);

  function set<K extends keyof SigeReportRowDraft>(key: K, value: SigeReportRowDraft[K]) {
    onChange(index, { ...row, [key]: value });
  }

  // Item 2 do code review do PR #18: alterar o nome ou o turno invalida
  // qualquer escolha manual anterior — uma correspondência ou confirmação
  // feita para o texto ANTERIOR nunca pode sobreviver silenciosamente à
  // edição (resolveRowMatch também defende isso, mas aqui já evita que o
  // rascunho fique com um selectedTurmaId/confirmNovaTurma obsoleto).
  function setIdentity(key: 'turmaNome' | 'turno', value: string) {
    onChange(index, { ...row, [key]: value, selectedTurmaId: '', confirmNovaTurma: false });
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 flex-1">
          <div className="space-y-1">
            <label htmlFor={`sige-row-${index}-nome`} className="text-[9px] font-black uppercase text-slate-600 block">Nome da turma</label>
            <input
              id={`sige-row-${index}-nome`}
              type="text" value={row.turmaNome}
              onChange={e => setIdentity('turmaNome', e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`sige-row-${index}-turno`} className="text-[9px] font-black uppercase text-slate-600 block">Turno (quando disponível)</label>
            <input
              id={`sige-row-${index}-turno`}
              type="text" value={row.turno}
              onChange={e => setIdentity('turno', e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`sige-row-${index}-matricula`} className="text-[9px] font-black uppercase text-slate-600 block">Matrícula atual</label>
            <input
              id={`sige-row-${index}-matricula`}
              type="text" inputMode="numeric"
              // Item 6 do code review do PR #18: só tem efeito real ao
              // CRIAR uma turma nova. Para turma já existente, o campo
              // nunca fica "editável sem efeito" — vira somente
              // informativo, mostrando o valor REAL já cadastrado.
              value={resolvedTurma ? String(resolvedTurma.matriculaAtual ?? '—') : row.matriculaAtual}
              disabled={!!resolvedTurma}
              onChange={e => set('matriculaAtual', e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono disabled:bg-slate-100 disabled:text-slate-500"
            />
            {resolvedTurma ? (
              <p className="text-[8px] text-slate-400">Turma existente — edite a matrícula em Gestão de Escolas.</p>
            ) : resolution.isNovaTurmaConfirmada && !computed.matriculaValid ? (
              <p className="text-[8px] text-rose-600 font-bold">Obrigatória para turma nova — informe um número inteiro (zero é aceito).</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label htmlFor={`sige-row-${index}-status`} className="text-[9px] font-black uppercase text-slate-600 block">Status</label>
            <select
              id={`sige-row-${index}-status`}
              value={row.status}
              onChange={e => set('status', e.target.value as SigeReportRowDraft['status'])}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-bold"
            >
              <option value="rascunho">Rascunho</option>
              <option value="confirmado">Confirmado</option>
            </select>
          </div>
        </div>
        {canRemove && (
          <button
            type="button" onClick={() => onRemove(index)}
            aria-label={`Remover linha ${index + 1}`}
            className="text-slate-400 hover:text-rose-600 transition p-1.5 mt-4"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Correspondência de turma */}
      {row.turmaNome.trim() === '' ? null : match.status === 'encontrada' ? (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          <CheckCircle2 size={13} /> Turma encontrada — {match.turma?.nome}
        </div>
      ) : match.status === 'nao_cadastrada' ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <PlusCircle size={13} /> Turma não cadastrada — será criada ao confirmar
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-bold pl-1">
            <input
              type="checkbox" checked={row.confirmNovaTurma}
              onChange={e => set('confirmNovaTurma', e.target.checked)}
            />
            Confirmo a criação desta turma
          </label>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-300 rounded-lg px-2.5 py-1.5">
            <HelpCircle size={13} /> Possível correspondência — revisar
          </div>
          <div className="space-y-1">
            <label htmlFor={`sige-row-${index}-candidato`} className="text-[9px] font-black uppercase text-slate-600 flex items-center gap-1">
              <Search size={11} /> Escolha a turma correta
            </label>
            <select
              id={`sige-row-${index}-candidato`}
              value={row.selectedTurmaId}
              onChange={e => set('selectedTurmaId', e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-bold"
            >
              <option value="">Selecione…</option>
              {match.candidates.map(c => (
                <option key={c.id} value={c.id}>{c.nome}{c.turno ? ` — ${c.turno}` : ''}</option>
              ))}
              <option value="__nova__">Nenhuma — é uma turma nova</option>
            </select>
          </div>
          {row.selectedTurmaId === '__nova__' && (
            <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-bold pl-1">
              <input
                type="checkbox" checked={row.confirmNovaTurma}
                onChange={e => set('confirmNovaTurma', e.target.checked)}
              />
              Confirmo a criação desta turma
            </label>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {NUMERIC_FIELDS.map(field => (
          <div key={field.key} className="space-y-1">
            <label htmlFor={`sige-row-${index}-${field.key}`} className="text-[8px] font-black uppercase text-slate-600 block">{field.label}</label>
            <input
              id={`sige-row-${index}-${field.key}`}
              type="text" inputMode="numeric" placeholder="0"
              value={row[field.key]}
              onChange={e => set(field.key, e.target.value)}
              className="w-full p-1.5 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <span className="font-bold text-slate-500">
          Soma: <span className={computed.allFieldsFilled && !computed.sumMatches ? 'text-rose-600' : 'text-slate-800'}>
            {computed.allFieldsFilled ? `${computed.studentsSum} de ${parseCount(row.totalStudents)}` : '—'}
          </span>
        </span>
        <span className="font-bold text-slate-500">
          Preenchimento: <span className="text-brand-turquoise">{computed.percentage == null ? 'Não informado' : `${computed.percentage.toFixed(0)}%`}</span>
        </span>
        <span className={`inline-block px-2 py-0.5 rounded-md border font-bold whitespace-nowrap ${RESULTING_STATUS_INFO[computed.resultingStatus].className}`}>
          {RESULTING_STATUS_INFO[computed.resultingStatus].label}
        </span>
      </div>

      {computed.allFieldsFilled && !computed.sumMatches && (
        <p className="text-[10px] text-rose-600 font-bold">A soma de completas, parciais e sem notas precisa ser igual ao total de estudantes.</p>
      )}
      {computed.allFieldsFilled && computed.sumMatches && !computed.entriesConsistent && (
        <p className="text-[10px] text-rose-600 font-bold">Lançamentos realizados não podem ser maiores que os esperados.</p>
      )}
    </div>
  );
}
