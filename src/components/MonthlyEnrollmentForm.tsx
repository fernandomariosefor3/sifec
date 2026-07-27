// Seção "Registro mensal" do painel de matrículas — extraído de
// SchoolEnrollmentPanel.tsx para manter os arquivos de componente sob o
// limite de 500 linhas do projeto. Nenhuma lógica de gravação mudou nesta
// extração: handleSaveSnapshot continua no painel, este componente só
// recebe os valores/setters e renderiza o formulário.
import React from 'react';
import { Save, Lock, AlertTriangle, Plus } from 'lucide-react';
import type { Turma } from '../types/classroom';

interface MovementField {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface MonthlyEnrollmentFormProps {
  sectionId: string;
  canWrite: boolean;
  isFirebaseMode: boolean;
  turmasDaEscola: Turma[];
  anoLetivo: number;
  formError: string;
  formSuccess: string;
  turmaId: string;
  onTurmaIdChange: (value: string) => void;
  mesReferencia: string;
  onMesReferenciaChange: (value: string) => void;
  movementFields: MovementField[];
  matriculaFimMes: string;
  onMatriculaFimMesChange: (value: string) => void;
  observacao: string;
  onObservacaoChange: (value: string) => void;
  calculoPreview: number;
  divergente: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCreateFirstClassroom: () => void;
}

export default function MonthlyEnrollmentForm({
  sectionId, canWrite, isFirebaseMode, turmasDaEscola, anoLetivo, formError, formSuccess,
  turmaId, onTurmaIdChange, mesReferencia, onMesReferenciaChange, movementFields,
  matriculaFimMes, onMatriculaFimMesChange, observacao, onObservacaoChange,
  calculoPreview, divergente, onSubmit, onCreateFirstClassroom,
}: MonthlyEnrollmentFormProps) {
  const semTurma = turmasDaEscola.length === 0;

  return (
    <section id={sectionId}>
      <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
        <Save size={14} /> Registro mensal
      </h4>
      {!canWrite ? (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
          <Lock size={12} className="text-amber-500" /> Sem permissão para registrar matrícula mensal desta escola.
        </div>
      ) : !isFirebaseMode ? (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
          Modo demonstração — faça login para registrar matrícula mensal real.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
          {/* Sem turma cadastrada: os campos abaixo ficam desabilitados
              (fieldset nativo) e o caminho fica explícito — nunca um
              seletor vazio sem explicação (correção de usabilidade,
              seção 8). */}
          {semTurma && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 flex items-center justify-between gap-3 flex-wrap">
              <span>Cadastre pelo menos uma turma para liberar o registro mensal.</span>
              <button
                type="button"
                onClick={onCreateFirstClassroom}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shrink-0 whitespace-nowrap"
              >
                <Plus size={12} /> Cadastrar primeira turma
              </button>
            </div>
          )}
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
          )}
          {formSuccess && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg font-bold">{formSuccess}</div>
          )}
          <fieldset disabled={semTurma} className="space-y-3 disabled:opacity-50">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-600 block">Turma *</label>
                <select value={turmaId} onChange={e => onTurmaIdChange(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" required>
                  {semTurma ? (
                    <option value="">Nenhuma turma cadastrada</option>
                  ) : (
                    <>
                      <option value="">Selecione</option>
                      {turmasDaEscola.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </>
                  )}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-600 block">Mês de referência *</label>
                <input
                  type="month" value={mesReferencia} onChange={e => onMesReferenciaChange(e.target.value)}
                  min={`${anoLetivo}-01`} max={`${anoLetivo}-12`}
                  className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" required
                />
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {movementFields.map(field => (
                <div key={field.label} className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-600 block">{field.label}</label>
                  <input
                    type="number" min={0} step={1} value={field.value}
                    onChange={e => field.onChange(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-600 block">Matrícula final *</label>
                <input
                  type="number" min={0} step={1} value={matriculaFimMes}
                  onChange={e => onMatriculaFimMesChange(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
                />
              </div>
              <div className="text-[10px] text-slate-500">Cálculo esperado: <strong>{calculoPreview}</strong></div>
            </div>
            {divergente && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] rounded-lg flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                Matrícula final diverge do cálculo esperado ({calculoPreview}). Informe uma observação para salvar mesmo assim.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Observação {divergente ? '*' : ''}</label>
              <textarea value={observacao} onChange={e => onObservacaoChange(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" rows={2} />
            </div>
            <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition">
              Salvar registro mensal
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
