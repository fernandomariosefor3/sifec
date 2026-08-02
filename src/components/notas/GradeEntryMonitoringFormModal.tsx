// Fase 2C.1 — seção 10 do plano: formulário de registro do acompanhamento
// agregado de preenchimento de notas, transcrito do relatório do SIGE
// Escola. Nunca pede nem aceita nome de estudante — só totais. Turma/ano
// letivo/bimestre já vêm fixados pela linha da tabela (nunca editáveis
// aqui); correções da mesma turma/ano/bimestre atualizam o mesmo documento
// determinístico (saveGradeEntryMonitoring já resolve isso).
import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { auth } from '../../lib/firebase';
import {
  saveGradeEntryMonitoring,
  GradeEntryMonitoringValidationError,
} from '../../lib/gradeEntryMonitoringService';
import {
  calculateCompletionPercentage,
  calculatePendingStudents,
  classifyTurmaGradeEntryStatus,
  type TurmaGradeEntryStatus,
} from '../../lib/gradeEntryMonitoringCalculations';
import type { Bimestre, GradeEntryMonitoring, GradeEntryMonitoringStatus } from '../../types/gradeEntryMonitoring';

// Mesmos rótulos/cores de STATUS_BADGE em GradeEntryMonitoringTable.tsx,
// exceto 'nao_informado': aqui significa "ainda não há dados suficientes
// para classificar" (formulário em edição), não "nenhum relatório
// informado" (que já não se aplica dentro do próprio formulário de
// registro) — revisão do code review do PR #17, seção 7.
const RESULTING_STATUS_INFO: Record<TurmaGradeEntryStatus, { label: string; className: string }> = {
  nao_informado: { label: 'Não informado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
  sem_preenchimento: { label: 'Sem preenchimento', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  parcial: { label: 'Preenchimento parcial', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  completo: { label: 'Preenchimento completo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  inconsistente: { label: 'Inconsistente', className: 'bg-orange-50 text-orange-700 border-orange-300' },
};

interface SchoolLike {
  id: string;
  codInep: string;
  nome: string;
}

interface GradeEntryMonitoringFormModalProps {
  school: SchoolLike;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  existing: GradeEntryMonitoring | null;
  onClose: () => void;
  onSaved: () => void;
}

type NumericField =
  | 'totalStudents'
  | 'studentsWithCompleteGrades'
  | 'studentsWithPartialGrades'
  | 'studentsWithoutGrades'
  | 'expectedGradeEntries'
  | 'completedGradeEntries';

const NUMERIC_FIELDS: { key: NumericField; label: string }[] = [
  { key: 'totalStudents', label: 'Total de estudantes' },
  { key: 'studentsWithCompleteGrades', label: 'Estudantes com notas completas' },
  { key: 'studentsWithPartialGrades', label: 'Estudantes com preenchimento parcial' },
  { key: 'studentsWithoutGrades', label: 'Estudantes sem notas' },
  { key: 'expectedGradeEntries', label: 'Total de lançamentos esperados' },
  { key: 'completedGradeEntries', label: 'Total de lançamentos realizados' },
];

// Só dígitos, vazio vira NaN (nunca 0 silencioso) — o submit bloqueia
// qualquer campo ainda não preenchido, mesmo que zero seja um valor real
// aceito quando digitado explicitamente.
function parseCount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return NaN;
  return Number(trimmed);
}

function initialInputs(existing: GradeEntryMonitoring | null): Record<NumericField, string> {
  return {
    totalStudents: existing ? String(existing.totalStudents) : '',
    studentsWithCompleteGrades: existing ? String(existing.studentsWithCompleteGrades) : '',
    studentsWithPartialGrades: existing ? String(existing.studentsWithPartialGrades) : '',
    studentsWithoutGrades: existing ? String(existing.studentsWithoutGrades) : '',
    expectedGradeEntries: existing ? String(existing.expectedGradeEntries) : '',
    completedGradeEntries: existing ? String(existing.completedGradeEntries) : '',
  };
}

export default function GradeEntryMonitoringFormModal({
  school, turmaId, turmaNome, anoLetivo, bimestre, existing, onClose, onSaved,
}: GradeEntryMonitoringFormModalProps) {
  const [inputs, setInputs] = useState<Record<NumericField, string>>(initialInputs(existing));
  const [referenceDate, setReferenceDate] = useState(existing?.referenceDate ?? '');
  const [sourceReportTitle, setSourceReportTitle] = useState(existing?.sourceReportTitle ?? '');
  const [sourceFileName, setSourceFileName] = useState(existing?.sourceFileName ?? '');
  const [observation, setObservation] = useState(existing?.observation ?? '');
  const [status, setStatus] = useState<GradeEntryMonitoringStatus>(existing?.status ?? 'rascunho');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = {
    totalStudents: parseCount(inputs.totalStudents),
    studentsWithCompleteGrades: parseCount(inputs.studentsWithCompleteGrades),
    studentsWithPartialGrades: parseCount(inputs.studentsWithPartialGrades),
    studentsWithoutGrades: parseCount(inputs.studentsWithoutGrades),
    expectedGradeEntries: parseCount(inputs.expectedGradeEntries),
    completedGradeEntries: parseCount(inputs.completedGradeEntries),
  };
  const allFieldsFilled = NUMERIC_FIELDS.every(f => !Number.isNaN(parsed[f.key]));
  const studentsSum = parsed.studentsWithCompleteGrades + parsed.studentsWithPartialGrades + parsed.studentsWithoutGrades;
  const sumMatches = allFieldsFilled && studentsSum === parsed.totalStudents;
  const entriesConsistent = allFieldsFilled && parsed.completedGradeEntries <= parsed.expectedGradeEntries;
  const percentage = allFieldsFilled ? calculateCompletionPercentage(parsed) : null;
  const pendingStudents = allFieldsFilled ? calculatePendingStudents(parsed) : null;
  // Mesma função pura usada por GradeEntryMonitoringTable — nunca duplicada
  // aqui (seção 7 do code review do PR #17). Antes de todos os campos
  // preenchidos, `parsed` tem NaN nos campos ainda vazios; em vez de deixar
  // isMathematicallyConsistent classificar isso como "inconsistente" (o que
  // seria enganoso enquanto o usuário ainda está digitando), o próprio
  // formulário usa 'nao_informado' — a mesma semântica que a função já usa
  // para "nenhum documento ainda".
  const resultingStatus: TurmaGradeEntryStatus = allFieldsFilled ? classifyTurmaGradeEntryStatus(parsed) : 'nao_informado';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar o acompanhamento.');
      return;
    }
    if (!allFieldsFilled) {
      setFormError('Preencha todos os totais — nenhum campo pode ficar em branco.');
      return;
    }
    if (referenceDate.trim() === '') {
      setFormError('Informe a data de referência do relatório.');
      return;
    }

    setSaving(true);
    try {
      await saveGradeEntryMonitoring({
        schoolId: school.id,
        codInep: school.codInep,
        escolaNome: school.nome,
        turmaId,
        turmaNome,
        anoLetivo,
        bimestre,
        ...parsed,
        status,
        referenceDate: referenceDate.trim(),
        // null (nunca undefined) quando o campo é enviado vazio — garante
        // que um título/nome de arquivo/observação já existente é REMOVIDO,
        // nunca preservado por engano (revisão do code review do PR #17,
        // seção 6, estendida de `observation` para os três metadados de
        // origem — ver buildGradeEntryMonitoringPayload).
        sourceReportTitle: sourceReportTitle.trim() === '' ? null : sourceReportTitle.trim(),
        sourceFileName: sourceFileName.trim() === '' ? null : sourceFileName.trim(),
        observation: observation.trim() === '' ? null : observation.trim(),
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof GradeEntryMonitoringValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar acompanhamento: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl relative flex flex-col overflow-hidden max-h-[90vh]">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Registrar dados do relatório</h3>
            <p className="text-[10px] text-slate-500 font-normal mt-0.5">
              {turmaNome} — {anoLetivo} — {bimestre}º bimestre
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3 overflow-y-auto">
          <p className="text-[11px] text-slate-500 bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-lg px-3 py-2">
            Transcreva somente os totais agregados apresentados no relatório do SIGE Escola.
          </p>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {NUMERIC_FIELDS.map(field => (
              <div key={field.key} className="space-y-1">
                <label htmlFor={`gem-${field.key}`} className="text-[9px] font-black uppercase text-slate-600 block">{field.label}</label>
                <input
                  id={`gem-${field.key}`}
                  type="text" inputMode="numeric" placeholder="0"
                  value={inputs[field.key]}
                  onChange={e => setInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="gem-reference-date" className="text-[9px] font-black uppercase text-slate-600 block">Data de referência</label>
              <input
                id="gem-reference-date"
                type="date"
                value={referenceDate}
                onChange={e => setReferenceDate(e.target.value)}
                className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="gem-status" className="text-[9px] font-black uppercase text-slate-600 block">Status</label>
              <select
                id="gem-status"
                value={status}
                onChange={e => setStatus(e.target.value as GradeEntryMonitoringStatus)}
                className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-bold"
              >
                <option value="rascunho">Rascunho</option>
                <option value="confirmado">Confirmado</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="gem-report-title" className="text-[9px] font-black uppercase text-slate-600 block">Título do relatório (opcional)</label>
            <input
              id="gem-report-title"
              type="text"
              value={sourceReportTitle}
              onChange={e => setSourceReportTitle(e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="gem-file-name" className="text-[9px] font-black uppercase text-slate-600 block">Nome do arquivo (opcional)</label>
            <input
              id="gem-file-name"
              type="text"
              value={sourceFileName}
              onChange={e => setSourceFileName(e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Preenchimento</div>
              <div className="text-sm font-black text-brand-turquoise font-mono">
                {percentage == null ? 'Não informado' : `${percentage.toFixed(0)}%`}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Pendentes</div>
              <div className="text-sm font-black text-slate-800 font-mono">
                {pendingStudents == null ? '—' : pendingStudents}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Soma dos estudantes</div>
              <div className={`text-sm font-black font-mono ${allFieldsFilled && !sumMatches ? 'text-rose-600' : 'text-slate-800'}`}>
                {allFieldsFilled ? `${studentsSum} de ${parsed.totalStudents}` : '—'}
              </div>
            </div>
          </div>

          {/* Situação resultante: atualiza em tempo real conforme os totais
              são digitados, usando a mesma classificação de
              GradeEntryMonitoringTable (revisão do code review do PR #17,
              seção 7). */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Situação resultante</span>
            <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${RESULTING_STATUS_INFO[resultingStatus].className}`}>
              {RESULTING_STATUS_INFO[resultingStatus].label}
            </span>
          </div>

          {allFieldsFilled && !sumMatches && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              A soma de completas, parciais e sem notas precisa ser igual ao total de estudantes.
            </div>
          )}
          {allFieldsFilled && sumMatches && !entriesConsistent && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Lançamentos realizados não podem ser maiores que os lançamentos esperados.
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="gem-observation" className="text-[9px] font-black uppercase text-slate-600 block">Observação (opcional)</label>
            <textarea
              id="gem-observation"
              value={observation} onChange={e => setObservation(e.target.value)} maxLength={500} rows={2}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar acompanhamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
