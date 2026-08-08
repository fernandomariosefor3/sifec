// Correção funcional pós-PR #17 — "Registrar relatório do SIGE": fluxo em
// etapas que permite registrar VÁRIAS turmas de um relatório do SIGE Escola
// de uma vez, criando a turma automaticamente (com confirmação humana
// explícita) quando ainda não está cadastrada. O usuário não precisa mais
// sair para Gestão de Escolas antes de registrar o acompanhamento.
//
// Etapa 1 — identificação do relatório (ano/bimestre/data/título/arquivo/
// observação). Etapa 2 — turmas do relatório (uma ou mais linhas, cada uma
// com correspondência de turma e cálculo em tempo real). Etapa 3 — preview
// agregado antes de salvar. Nada é gravado antes de "Confirmar registro".
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ClipboardCheck, Plus, X } from 'lucide-react';
import { auth } from '../../lib/firebase';
import {
  saveSigeReport,
  SigeReportPartialSaveError,
  SigeReportValidationError,
  type CreatedTurmaInfo,
  type SigeReportRowInput,
} from '../../lib/sigeReportService';
import { GradeEntryMonitoringValidationError } from '../../lib/gradeEntryMonitoringService';
import { ClassroomValidationError } from '../../lib/classService';
import { calculateCompletionPercentage } from '../../lib/gradeEntryMonitoringCalculations';
import SigeReportRowEditor, { buildEmptyRowDraft, computeRow, type SigeReportRowDraft } from './SigeReportRowEditor';
import type { Turma } from '../../types/classroom';
import type { Bimestre, GradeEntryMonitoring } from '../../types/gradeEntryMonitoring';

interface SchoolLike {
  id: string;
  codInep: string;
  nome: string;
}

interface SigeReportModalProps {
  school: SchoolLike;
  anoLetivo: number;
  bimestre: Bimestre;
  existingTurmas: readonly Turma[];
  existingMonitoringByTurmaId: ReadonlyMap<string, GradeEntryMonitoring>;
  onClose: () => void;
  onSaved: () => void;
  // Chamado quando a fase 1 (turmas novas) foi commitada mas a fase 2
  // falhou — o modal PRECISA de dados atualizados (existingTurmas) antes de
  // liberar uma nova tentativa, para nunca recriar a mesma turma (item 3 do
  // code review do PR #18).
  onRefreshSources: () => void;
}

type Step = 1 | 2 | 3;

// Nova identidade visual, seção 8: stepper visual das três etapas — só
// apresentação, nunca altera a lógica de navegação/validação já existente
// (goToStep2/goToStep3/handleConfirm, abaixo, continuam intocados).
const STEPPER_STEPS: { number: Step; label: string }[] = [
  { number: 1, label: 'Identificação' },
  { number: 2, label: 'Turmas' },
  { number: 3, label: 'Revisão' },
];

function toRowInput(row: SigeReportRowDraft, existingTurmas: readonly Turma[]): SigeReportRowInput {
  const { resolution } = computeRow(row, existingTurmas);
  const isExistingTurma = resolution.resolvedTurmaId != null;
  return {
    turmaId: resolution.resolvedTurmaId ?? undefined,
    turmaNome: row.turmaNome.trim(),
    turno: row.turno.trim() === '' ? undefined : row.turno.trim(),
    // Item 6 do code review do PR #18: matrícula atual só é enviada (e só
    // tem efeito) ao criar uma turma NOVA — para turma existente o campo é
    // só informativo na interface (ver SigeReportRowEditor), então nunca é
    // enviado, mesmo que reste algum valor digitado antes de a linha
    // resolver para uma turma já cadastrada.
    matriculaAtual: isExistingTurma || row.matriculaAtual.trim() === '' ? undefined : Number(row.matriculaAtual),
    isNovaTurmaConfirmada: resolution.isNovaTurmaConfirmada,
    totalStudents: Number(row.totalStudents),
    studentsWithCompleteGrades: Number(row.studentsWithCompleteGrades),
    studentsWithPartialGrades: Number(row.studentsWithPartialGrades),
    studentsWithoutGrades: Number(row.studentsWithoutGrades),
    expectedGradeEntries: Number(row.expectedGradeEntries),
    completedGradeEntries: Number(row.completedGradeEntries),
    status: row.status,
  };
}

export default function SigeReportModal({
  school, anoLetivo, bimestre, existingTurmas, existingMonitoringByTurmaId, onClose, onSaved, onRefreshSources,
}: SigeReportModalProps) {
  // Ano letivo e bimestre vêm bloqueados pela seleção atual da tela
  // principal (mesmo tratamento de "escola" — nunca editáveis aqui): a
  // lista de turmas recebida (existingTurmas) já vem filtrada pelo ano
  // letivo ATUAL da tela, e a correspondência de turmas depende dela — se
  // o ano fosse editável dentro do modal sem recarregar essa lista, a
  // correspondência passaria a comparar contra turmas do ano ERRADO.
  const [step, setStep] = useState<Step>(1);
  const [referenceDate, setReferenceDate] = useState('');
  const [sourceReportTitle, setSourceReportTitle] = useState('');
  const [sourceFileName, setSourceFileName] = useState('');
  const [observation, setObservation] = useState('');
  const [rows, setRows] = useState<SigeReportRowDraft[]>([buildEmptyRowDraft()]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Item 3 do code review do PR #18: quando a fase 1 (turmas novas) já foi
  // commitada mas a fase 2 falhou, o serviço lança SigeReportPartialSaveError
  // com as turmas já criadas. Enquanto isto não é null, um novo clique em
  // "Confirmar registro" fica bloqueado — só libera depois que
  // existingTurmas (atualizado pelo pai via onRefreshSources) confirmar que
  // TODAS as turmas criadas já aparecem na lista real, evitando recriá-las.
  const [partialSave, setPartialSave] = useState<{ createdTurmas: readonly CreatedTurmaInfo[] } | null>(null);

  useEffect(() => {
    if (!partialSave) return;
    const allPresent = partialSave.createdTurmas.every(ct => existingTurmas.some(t => t.id === ct.id));
    if (allPresent) {
      setPartialSave(null);
      setFormError('A lista de turmas foi atualizada — revise as linhas e confirme novamente.');
    }
  }, [existingTurmas, partialSave]);

  const computedRows = useMemo(() => rows.map(row => computeRow(row, existingTurmas)), [rows, existingTurmas]);

  const step1Valid = referenceDate.trim() !== '';
  const rowsAllResolved = rows.length > 0 && rows.every(row => row.turmaNome.trim() !== '') &&
    computedRows.every(c => c.isFullyResolved && c.isMathematicallyValid);

  const preview = useMemo(() => {
    const turmasEncontradas = computedRows.filter(c => c.resolution.resolvedTurmaId != null).length;
    const turmasNovas = computedRows.filter(c => c.resolution.isNovaTurmaConfirmada).length;
    const linhasInconsistentes = computedRows.filter(c => !c.isMathematicallyValid).length;
    const totals = rows.reduce(
      (acc, row) => ({
        expected: acc.expected + (Number(row.expectedGradeEntries) || 0),
        completed: acc.completed + (Number(row.completedGradeEntries) || 0),
      }),
      { expected: 0, completed: 0 }
    );
    const percentualGeral = calculateCompletionPercentage({ expectedGradeEntries: totals.expected, completedGradeEntries: totals.completed });
    return { turmasEncontradas, turmasNovas, linhasInconsistentes, totals, percentualGeral };
  }, [computedRows, rows]);

  function updateRow(index: number, next: SigeReportRowDraft) {
    setRows(prev => prev.map((r, i) => (i === index ? next : r)));
  }

  function addRow() {
    setRows(prev => [...prev, buildEmptyRowDraft()]);
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index));
  }

  function goToStep2() {
    setFormError('');
    if (!step1Valid) {
      setFormError('Informe a data de referência do relatório.');
      return;
    }
    setStep(2);
  }

  function goToStep3() {
    setFormError('');
    if (!rowsAllResolved) {
      setFormError('Resolva a correspondência e corrija os totais de todas as turmas antes de continuar.');
      return;
    }
    setStep(3);
  }

  async function handleConfirm() {
    setFormError('');
    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar o relatório.');
      return;
    }
    if (!rowsAllResolved) {
      setFormError('Resolva a correspondência e corrija os totais de todas as turmas antes de confirmar.');
      return;
    }
    if (partialSave) {
      // Já bloqueado pelo disabled do botão, mas nunca confia só nisso.
      setFormError('Aguarde a lista de turmas terminar de atualizar antes de tentar novamente.');
      return;
    }

    setSaving(true);
    try {
      await saveSigeReport(
        {
          schoolId: school.id,
          codInep: school.codInep,
          escolaNome: school.nome,
          anoLetivo,
          bimestre,
          referenceDate: referenceDate.trim(),
          sourceReportTitle: sourceReportTitle.trim() === '' ? undefined : sourceReportTitle.trim(),
          sourceFileName: sourceFileName.trim() === '' ? undefined : sourceFileName.trim(),
          observation: observation.trim() === '' ? undefined : observation.trim(),
          rows: rows.map(row => toRowInput(row, existingTurmas)),
          actingUserEmail: email,
          now: new Date().toISOString(),
        },
        existingMonitoringByTurmaId
      );
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof SigeReportPartialSaveError) {
        // Item 3 do code review do PR #18: nunca fecha o modal nem afirma
        // sucesso — bloqueia um novo clique e pede ao pai (NotasView) para
        // recarregar turmas/acompanhamento. O efeito acima libera o botão
        // de novo só quando existingTurmas confirmar que as turmas criadas
        // já estão na lista real (nunca antes disso).
        setPartialSave({ createdTurmas: err.createdTurmas });
        setFormError(err.message);
        onRefreshSources();
      } else if (err instanceof SigeReportValidationError || err instanceof GradeEntryMonitoringValidationError || err instanceof ClassroomValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar o relatório: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl relative flex flex-col overflow-hidden max-h-[92vh]">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 shrink-0">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Registrar relatório do SIGE</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {school.nome} — Etapa {step} de 3: {step === 1 ? 'Identificação' : step === 2 ? 'Turmas do relatório' : 'Revisão e confirmação'}
              </p>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-650 transition shrink-0">
              <X size={18} />
            </button>
          </div>
          <ol className="flex items-center">
            {STEPPER_STEPS.map((s, idx) => (
              <li key={s.number} className="flex items-center flex-1 last:flex-none">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-colors ${
                    step === s.number
                      ? 'bg-brand-turquoise text-white'
                      : step > s.number
                        ? 'bg-status-ok text-white'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step > s.number ? <Check size={12} /> : s.number}
                </span>
                <span className={`ml-1.5 text-[11px] font-bold whitespace-nowrap ${step === s.number ? 'text-slate-900' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                {idx < STEPPER_STEPS.length - 1 && <span className="flex-1 h-px bg-slate-200 mx-2" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>

        <div className="p-6 space-y-3 overflow-y-auto">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
          )}

          {partialSave && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 text-amber-800 text-[11px] rounded-lg font-bold flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Turmas já criadas: {partialSave.createdTurmas.map(t => t.nome).join(', ')}. Atualizando a lista antes
                de permitir uma nova tentativa — elas não serão recriadas.
              </span>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-lg px-3 py-2">
                Identifique o relatório do SIGE Escola antes de informar as turmas. Nenhum dado é gravado nesta etapa.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-600 block">Escola</label>
                  <div className="w-full p-2 bg-slate-100 border border-slate-200 text-xs rounded-lg font-bold text-slate-600">{school.nome}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-600 block">Ano letivo — Bimestre</label>
                  <div className="w-full p-2 bg-slate-100 border border-slate-200 text-xs rounded-lg font-bold text-slate-600 font-mono">
                    {anoLetivo} — {bimestre}º bimestre
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="sige-reference-date" className="text-[9px] font-black uppercase text-slate-600 block">Data de referência</label>
                  <input
                    id="sige-reference-date" type="date" value={referenceDate}
                    onChange={e => setReferenceDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="sige-report-title" className="text-[9px] font-black uppercase text-slate-600 block">Título do relatório (opcional)</label>
                <input
                  id="sige-report-title" type="text" value={sourceReportTitle}
                  onChange={e => setSourceReportTitle(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="sige-file-name" className="text-[9px] font-black uppercase text-slate-600 block">Nome do arquivo (opcional)</label>
                <input
                  id="sige-file-name" type="text" value={sourceFileName}
                  onChange={e => setSourceFileName(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="sige-observation" className="text-[9px] font-black uppercase text-slate-600 block">Observação geral (opcional)</label>
                <textarea
                  id="sige-observation" value={observation} onChange={e => setObservation(e.target.value)} maxLength={500} rows={2}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-lg px-3 py-2">
                Adicione uma linha por turma do relatório. Nenhum nome de estudante, nota individual ou matrícula individual é aceito aqui — só totais agregados.
              </p>
              {rows.map((row, index) => (
                <SigeReportRowEditor
                  key={index}
                  row={row}
                  index={index}
                  existingTurmas={existingTurmas}
                  onChange={updateRow}
                  onRemove={removeRow}
                  canRemove={rows.length > 1}
                />
              ))}
              <button
                type="button" onClick={addRow}
                className="w-full py-2.5 border border-dashed border-slate-300 hover:border-brand-turquoise hover:text-brand-turquoise text-slate-500 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Adicionar turma
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-lg px-3 py-2">
                Revise antes de confirmar — nada foi salvo ainda.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Escola</div>
                  <div className="text-xs font-black text-slate-800">{school.nome}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Ano / Bimestre</div>
                  <div className="text-xs font-black text-slate-800 font-mono">{anoLetivo} — {bimestre}º</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Data de referência</div>
                  <div className="text-xs font-black text-slate-800 font-mono">{referenceDate}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Total de linhas</div>
                  <div className="text-xs font-black text-slate-800 font-mono">{rows.length}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Turmas encontradas</div>
                  <div className="text-xs font-black text-emerald-700 font-mono">{preview.turmasEncontradas}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Turmas a criar</div>
                  <div className="text-xs font-black text-amber-700 font-mono">{preview.turmasNovas}</div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Linhas inconsistentes</div>
                  <div className={`text-xs font-black font-mono ${preview.linhasInconsistentes > 0 ? 'text-rose-700' : 'text-slate-800'}`}>
                    {preview.linhasInconsistentes}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Percentual geral</div>
                  <div className="text-xs font-black text-brand-turquoise font-mono">
                    {preview.percentualGeral == null ? 'Não informado' : `${preview.percentualGeral.toFixed(0)}%`}
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5">
                {rows.map((row, index) => {
                  const c = computedRows[index];
                  return (
                    <li key={index} className="flex items-center justify-between text-[11px] bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <span className="font-bold text-slate-800">{row.turmaNome || `Linha ${index + 1}`}</span>
                      <span className={c.resolution.resolvedTurmaId ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                        {c.resolution.resolvedTurmaId ? 'Turma existente' : 'Turma nova'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {preview.linhasInconsistentes > 0 && (
                <p className="text-[11px] text-rose-600 font-bold">Corrija as linhas inconsistentes antes de confirmar — volte à etapa anterior.</p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-150 px-6 py-4 flex gap-2 shrink-0">
          {step > 1 && (
            <button
              type="button" onClick={() => setStep(prev => (prev - 1) as Step)}
              className="flex-1 py-2.5 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <ArrowLeft size={14} /> Voltar e corrigir
            </button>
          )}
          {step === 1 && (
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Cancelar
            </button>
          )}
          {step < 3 ? (
            <button
              type="button" onClick={step === 1 ? goToStep2 : goToStep3}
              className="flex-1 py-2.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition flex items-center justify-center gap-1.5"
            >
              Avançar <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button" onClick={handleConfirm} disabled={saving || preview.linhasInconsistentes > 0 || !!partialSave}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <ClipboardCheck size={14} /> {saving ? 'Salvando...' : partialSave ? 'Atualizando lista...' : 'Confirmar registro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
