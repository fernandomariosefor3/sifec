// Fase 2B — seção D/7 do plano: formulário de fluxo escolar. Abre em modal
// com o nome da escola e o ano selecionado. Percentuais e total aparecem em
// tempo real (núcleo puro de schoolFlowCalculations.ts) — nunca preenche
// aprovados/reprovados/abandono automaticamente com matrícula ou dado
// demonstrativo (seção 5/7 do plano). A divergência contra a matrícula de
// referência é só um aviso comparativo: nunca bloqueia a gravação sozinha,
// só exige uma observação antes de CONFIRMAR (rascunho pode ter divergência
// sem observação).
import React, { useEffect, useState } from 'react';
import { X, Lock, AlertTriangle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { saveSchoolFlowResult, SchoolFlowResultValidationError } from '../lib/schoolFlowService';
import { getSchoolYear } from '../lib/schoolYearService';
import {
  calculateTotalResultados,
  calculateSchoolFlowPercentuais,
  hasFlowResultDivergence,
} from '../lib/schoolFlowCalculations';
import type { SchoolFlowResult, SchoolFlowStatus } from '../types/schoolFlow';

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface SchoolFlowResultModalProps {
  school: SchoolLike;
  anoLetivo: number;
  existing: SchoolFlowResult | null;
  canWrite: boolean;
  isFirebaseMode: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function SchoolFlowResultModal({
  school, anoLetivo, existing, canWrite, isFirebaseMode, onClose, onSaved,
}: SchoolFlowResultModalProps) {
  const [aprovados, setAprovados] = useState(existing ? String(existing.aprovados) : '0');
  const [reprovados, setReprovados] = useState(existing ? String(existing.reprovados) : '0');
  const [abandono, setAbandono] = useState(existing ? String(existing.abandono) : '0');
  const [status, setStatus] = useState<SchoolFlowStatus>(existing?.status ?? 'rascunho');
  const [observacao, setObservacao] = useState(existing?.observacao ?? '');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Matrícula de referência (seção 7 do plano) — só para o aviso
  // comparativo, nunca copiada para os campos do formulário.
  const [matriculaReferencia, setMatriculaReferencia] = useState<number | null>(null);

  useEffect(() => {
    if (!isFirebaseMode) return;
    let cancelled = false;
    getSchoolYear(school.id, anoLetivo)
      .then(schoolYear => {
        if (!cancelled) setMatriculaReferencia(schoolYear?.matriculaAtual ?? schoolYear?.matriculaInicial ?? null);
      })
      .catch(() => {
        // Puramente comparativo — uma falha aqui nunca deve impedir o
        // preenchimento do resultado de fluxo, só o aviso não aparece.
      });
    return () => {
      cancelled = true;
    };
  }, [school.id, anoLetivo, isFirebaseMode]);

  const counts = {
    aprovados: Number(aprovados) || 0,
    reprovados: Number(reprovados) || 0,
    abandono: Number(abandono) || 0,
  };
  const total = calculateTotalResultados(counts);
  const percentuais = calculateSchoolFlowPercentuais(counts);
  const divergente = hasFlowResultDivergence(total, matriculaReferencia);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar o fluxo escolar.');
      return;
    }
    if (divergente && status === 'confirmado' && !observacao.trim()) {
      setFormError('O total de resultados difere da matrícula de referência — informe uma observação antes de confirmar.');
      return;
    }

    setSaving(true);
    try {
      await saveSchoolFlowResult({
        schoolId: school.id,
        codInep: school.codInep,
        escolaNome: school.nome,
        anoLetivo,
        aprovados: counts.aprovados,
        reprovados: counts.reprovados,
        abandono: counts.abandono,
        status,
        observacao: observacao.trim() || undefined,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof SchoolFlowResultValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar fluxo escolar: ' + (err instanceof Error ? err.message : String(err)));
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
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Fluxo escolar — {anoLetivo}</h3>
            <p className="text-[10px] text-slate-500 font-normal mt-0.5">{school.nome}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
            <X size={18} />
          </button>
        </div>

        {!canWrite ? (
          <div className="p-6 text-[11px] text-slate-500 flex items-center gap-2">
            <Lock size={12} className="text-amber-500" /> Sem permissão para registrar o fluxo escolar desta escola.
          </div>
        ) : !isFirebaseMode ? (
          <div className="p-6 text-[11px] text-slate-500">
            Modo demonstração — faça login para registrar o fluxo escolar real.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-3 overflow-y-auto">
            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-emerald-800 block">Aprovados</label>
                <input
                  type="number" min={0} step={1} value={aprovados} onChange={e => setAprovados(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-rose-800 block">Reprovados</label>
                <input
                  type="number" min={0} step={1} value={reprovados} onChange={e => setReprovados(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-amber-800 block">Abandono</label>
                <input
                  type="number" min={0} step={1} value={abandono} onChange={e => setAbandono(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase">Total</div>
                <div className="text-sm font-black text-slate-800 font-mono">{total}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase">Aprovação</div>
                <div className="text-sm font-black text-emerald-700 font-mono">{percentuais.percentualAprovacao.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase">Reprovação</div>
                <div className="text-sm font-black text-rose-700 font-mono">{percentuais.percentualReprovacao.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase">Abandono</div>
                <div className="text-sm font-black text-amber-700 font-mono">{percentuais.percentualAbandono.toFixed(1)}%</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Total de resultados: <strong>{total}</strong></p>

            {divergente && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] rounded-lg flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                O total de resultados difere da matrícula de referência ({matriculaReferencia}).
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Status</label>
              <select
                value={status} onChange={e => setStatus(e.target.value as SchoolFlowStatus)}
                className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
              >
                <option value="rascunho">Rascunho</option>
                <option value="confirmado">Confirmado</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">
                Observação {divergente && status === 'confirmado' ? '*' : ''}
              </label>
              <textarea
                value={observacao} onChange={e => setObservacao(e.target.value)} maxLength={500} rows={2}
                className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
              />
            </div>

            <button
              type="submit" disabled={saving}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar resultado'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
