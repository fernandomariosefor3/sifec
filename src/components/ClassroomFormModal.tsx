// Fase 2A / revisão pós-PR #8 — seção 7 do plano: cadastro e edição de
// turmas. Um único formulário cobre os dois modos (create quando
// editingTurma é null, edit quando não é) para não duplicar os mesmos
// dez campos em dois componentes.
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  createClassroom,
  saveClassYearFields,
  ClassroomValidationError,
} from '../lib/classService';
import type { Turma, TurmaModalidade } from '../types/classroom';

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface ClassroomFormModalProps {
  school: SchoolLike;
  anoLetivo: number;
  existingTurmas: readonly Turma[];
  editingTurma: Turma | null;
  onClose: () => void;
  onSaved: () => void;
}

const MODALIDADE_OPTIONS: TurmaModalidade[] = [
  'Regular', 'Tempo Integral', 'Educação Profissional', 'EJA', 'Educação Especial', 'Outra',
];

export default function ClassroomFormModal({
  school, anoLetivo, existingTurmas, editingTurma, onClose, onSaved,
}: ClassroomFormModalProps) {
  const isEditing = editingTurma != null;
  const [nome, setNome] = useState(editingTurma?.nome ?? '');
  const [codigoTurma, setCodigoTurma] = useState(editingTurma?.codigoTurma ?? '');
  const [serie, setSerie] = useState(editingTurma?.serie ?? '');
  const [etapa, setEtapa] = useState(editingTurma?.etapa ?? '');
  const [modalidade, setModalidade] = useState<TurmaModalidade>(editingTurma?.modalidade ?? 'Regular');
  const [turno, setTurno] = useState(editingTurma?.turno ?? '');
  const [oferta, setOferta] = useState(editingTurma?.oferta ?? '');
  const [cargaHoraria, setCargaHoraria] = useState(editingTurma?.cargaHoraria != null ? String(editingTurma.cargaHoraria) : '');
  const [matriculaInicial, setMatriculaInicial] = useState(editingTurma?.matriculaInicial != null ? String(editingTurma.matriculaInicial) : '0');
  const [ativa, setAtiva] = useState(editingTurma?.ativa !== false);
  const [formError, setFormError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para cadastrar ou editar turmas.');
      return;
    }
    if (!serie.trim() || !etapa.trim() || !turno.trim() || !oferta.trim()) {
      setFormError('Preencha série, etapa, turno e oferta.');
      return;
    }

    const now = new Date().toISOString();

    try {
      if (isEditing && editingTurma) {
        await saveClassYearFields(editingTurma.id, {
          schoolId: editingTurma.schoolId ?? school.id,
          codInep: editingTurma.codInep ?? school.codInep,
          escolaNome: editingTurma.escolaNome,
          anoLetivo: editingTurma.anoLetivo ?? anoLetivo,
          codigoTurma: codigoTurma.trim() || undefined,
          serie,
          etapa,
          modalidade,
          turno,
          oferta,
          cargaHoraria: cargaHoraria.trim() === '' ? undefined : Number(cargaHoraria),
          matriculaInicial: matriculaInicial.trim() === '' ? undefined : Number(matriculaInicial),
          ativa,
          actingUserEmail: email,
          now,
        });
      } else {
        await createClassroom({
          schoolId: school.id,
          codInep: school.codInep,
          escolaNome: school.nome,
          anoLetivo,
          nome,
          codigoTurma: codigoTurma.trim() || undefined,
          serie,
          etapa,
          modalidade,
          turno,
          oferta,
          cargaHoraria: cargaHoraria.trim() === '' ? undefined : Number(cargaHoraria),
          matriculaInicial: Number(matriculaInicial),
          ativa,
          actingUserEmail: email,
          now,
        }, existingTurmas);
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ClassroomValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar turma: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col overflow-hidden max-h-[90vh]">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center shrink-0">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
            {isEditing ? 'Editar turma' : 'Cadastrar turma'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3 overflow-y-auto">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
          )}

          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-slate-600 block">Nome da turma *</label>
            <input
              type="text" required value={nome} onChange={e => setNome(e.target.value)}
              disabled={isEditing}
              className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Código (opcional)</label>
              <input type="text" value={codigoTurma} onChange={e => setCodigoTurma(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Série *</label>
              <input type="text" required value={serie} onChange={e => setSerie(e.target.value)} placeholder="Ex: 3º Ano" className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Etapa *</label>
              <input type="text" required value={etapa} onChange={e => setEtapa(e.target.value)} placeholder="Ex: Ensino Médio" className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Modalidade *</label>
              <select value={modalidade} onChange={e => setModalidade(e.target.value as TurmaModalidade)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg">
                {MODALIDADE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Turno *</label>
              <input type="text" required value={turno} onChange={e => setTurno(e.target.value)} placeholder="Ex: Matutino" className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Oferta *</label>
              <input type="text" required value={oferta} onChange={e => setOferta(e.target.value)} placeholder="Ex: Regular" className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Carga horária (opcional)</label>
              <input type="number" min={0} step={1} value={cargaHoraria} onChange={e => setCargaHoraria(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-600 block">Matrícula inicial *</label>
              <input type="number" min={0} step={1} required value={matriculaInicial} onChange={e => setMatriculaInicial(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-600">
            <input type="checkbox" checked={ativa} onChange={e => setAtiva(e.target.checked)} />
            Turma ativa
          </label>

          <button type="submit" className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition">
            {isEditing ? 'Salvar alterações' : 'Cadastrar turma'}
          </button>
        </form>
      </div>
    </div>
  );
}
