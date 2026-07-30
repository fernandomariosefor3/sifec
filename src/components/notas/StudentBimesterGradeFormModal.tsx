// Fase 2C — seção 14 do plano: formulário de preenchimento de notas
// bimestrais. Aceita vírgula decimal (pt-BR) e converte para número antes
// de validar/salvar (seção 8 do plano) — nunca envia string ao serviço.
// Sem botão de exclusão. Correções do mesmo estudante/ano/bimestre/turma
// atualizam o mesmo documento determinístico (saveStudentBimesterGrade já
// resolve isso via rosterId+bimestre).
import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { saveStudentBimesterGrade, StudentBimesterGradeValidationError } from '../../lib/studentBimesterGradeService';
import {
  calculateFillPercentage,
  calculatePartialAverage,
  countFilledScores,
  isBelowReferenceAverage,
  TOTAL_SUBJECTS,
} from '../../lib/studentGradeCalculations';
import type { Bimestre, BimesterScores } from '../../types/studentBimesterGrade';

interface SchoolLike {
  id: string;
  codInep: string;
  nome: string;
}

interface StudentBimesterGradeFormModalProps {
  school: SchoolLike;
  turmaId: string;
  turmaNome: string;
  anoLetivo: number;
  bimestre: Bimestre;
  studentKey: string;
  studentName: string;
  existingScores: BimesterScores | null;
  existingObservacao?: string;
  onClose: () => void;
  onSaved: () => void;
}

// Vírgula ou ponto decimal, com no máximo duas casas; vazio vira null;
// qualquer outro formato (mais de duas casas como "7,123", notação
// científica como "1e1", texto) vira NaN — bloqueado no submit, nunca
// enviado ao serviço. Nunca arredonda silenciosamente: o regex já garante
// no máximo duas casas antes de converter para número, em vez de aceitar
// qualquer texto numérico e arredondar depois (o que escondia do usuário
// que "7,123" virou "7,12" sem aviso).
const GRADE_INPUT_PATTERN = /^\d+([.,]\d{1,2})?$/;

function parseGradeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (!GRADE_INPUT_PATTERN.test(trimmed)) return NaN;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatGradeInput(value: number | null | undefined): string {
  return value == null ? '' : String(value).replace('.', ',');
}

const SUBJECT_FIELDS: { key: keyof BimesterScores; label: string }[] = [
  { key: 'linguaPortuguesa', label: 'Língua Portuguesa' },
  { key: 'matematica', label: 'Matemática' },
  { key: 'cienciasNatureza', label: 'Ciências da Natureza' },
  { key: 'cienciasHumanas', label: 'Ciências Humanas' },
];

export default function StudentBimesterGradeFormModal({
  school, turmaId, turmaNome, anoLetivo, bimestre, studentKey, studentName,
  existingScores, existingObservacao, onClose, onSaved,
}: StudentBimesterGradeFormModalProps) {
  const [inputs, setInputs] = useState<Record<keyof BimesterScores, string>>({
    linguaPortuguesa: formatGradeInput(existingScores?.linguaPortuguesa),
    matematica: formatGradeInput(existingScores?.matematica),
    cienciasNatureza: formatGradeInput(existingScores?.cienciasNatureza),
    cienciasHumanas: formatGradeInput(existingScores?.cienciasHumanas),
  });
  const [observacao, setObservacao] = useState(existingObservacao ?? '');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const parsedByField = {
    linguaPortuguesa: parseGradeInput(inputs.linguaPortuguesa),
    matematica: parseGradeInput(inputs.matematica),
    cienciasNatureza: parseGradeInput(inputs.cienciasNatureza),
    cienciasHumanas: parseGradeInput(inputs.cienciasHumanas),
  };
  // Para a pré-visualização ao vivo, um campo inválido (NaN) conta como
  // ainda não preenchido — o bloqueio real acontece só no submit.
  const previewScores: BimesterScores = {
    linguaPortuguesa: Number.isNaN(parsedByField.linguaPortuguesa) ? null : parsedByField.linguaPortuguesa,
    matematica: Number.isNaN(parsedByField.matematica) ? null : parsedByField.matematica,
    cienciasNatureza: Number.isNaN(parsedByField.cienciasNatureza) ? null : parsedByField.cienciasNatureza,
    cienciasHumanas: Number.isNaN(parsedByField.cienciasHumanas) ? null : parsedByField.cienciasHumanas,
  };
  const filledCount = countFilledScores(previewScores);
  const fillPercentage = calculateFillPercentage(previewScores);
  const partialAverage = calculatePartialAverage(previewScores);
  const belowReference = isBelowReferenceAverage(previewScores);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar notas.');
      return;
    }

    const invalidField = SUBJECT_FIELDS.find(f => Number.isNaN(parsedByField[f.key]));
    if (invalidField) {
      setFormError(
        `Nota de ${invalidField.label} inválida — use um número entre 0 e 10, com até duas casas decimais, ou deixe em branco.`
      );
      return;
    }

    // O formulário é sempre o dono explícito da observação: o valor atual
    // da caixa de texto (mesmo vazio) É a observação a partir de agora —
    // nunca `undefined` aqui, porque buildStudentBimesterGradePayload trata
    // `undefined` como "não fornecido, preservar o valor existente" (uso
    // reservado a um futuro fluxo de importação que não toca observacao).
    // `null` sinaliza remoção explícita, para limpar o campo não reviver o
    // texto antigo quando setDoc substitui o documento inteiro.
    const trimmedObservacao = observacao.trim();

    setSaving(true);
    try {
      await saveStudentBimesterGrade({
        schoolId: school.id,
        codInep: school.codInep,
        escolaNome: school.nome,
        turmaId,
        turmaNome,
        anoLetivo,
        studentKey,
        bimestre,
        scores: previewScores,
        observacao: trimmedObservacao === '' ? null : trimmedObservacao,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof StudentBimesterGradeValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar notas: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col overflow-hidden max-h-[90vh]">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Preencher notas — {bimestre}º bimestre</h3>
            <p className="text-[10px] text-slate-500 font-normal mt-0.5">{studentName} — {turmaNome}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3 overflow-y-auto">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {SUBJECT_FIELDS.map(field => (
              <div key={field.key} className="space-y-1">
                <label htmlFor={`student-grade-${field.key}`} className="text-[9px] font-black uppercase text-slate-600 block">{field.label}</label>
                <input
                  id={`student-grade-${field.key}`}
                  type="text" inputMode="decimal" placeholder="0 a 10"
                  value={inputs[field.key]}
                  onChange={e => setInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
                />
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Preenchidas</div>
              <div className="text-sm font-black text-slate-800 font-mono">{filledCount} de {TOTAL_SUBJECTS}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Percentual</div>
              <div className="text-sm font-black text-brand-turquoise font-mono">{fillPercentage.toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Média parcial</div>
              <div className="text-sm font-black text-slate-800 font-mono">
                {partialAverage == null ? 'Não informado' : partialAverage.toFixed(1)}
              </div>
            </div>
          </div>

          {belowReference && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Abaixo da média de referência para monitoramento.
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="student-grade-observacao" className="text-[9px] font-black uppercase text-slate-600 block">Observação (opcional)</label>
            <textarea
              id="student-grade-observacao"
              value={observacao} onChange={e => setObservacao(e.target.value)} maxLength={500} rows={2}
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
              {saving ? 'Salvando...' : 'Salvar notas'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
