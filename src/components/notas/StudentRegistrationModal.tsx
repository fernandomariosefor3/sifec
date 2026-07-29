// Fase 2C — seção 13 do plano: cadastro manual de estudante. studentKey é
// sempre gerado por crypto.randomUUID() aqui (nunca derivado do nome —
// StudentRosterService não gera studentKey sozinho, é responsabilidade do
// chamador). Sem exclusão comum — só create/update via
// saveStudentRosterEntry (atômico com a auditoria).
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { saveStudentRosterEntry, StudentRosterValidationError } from '../../lib/studentRosterService';
import type { Turma } from '../../types/classroom';

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface StudentRegistrationModalProps {
  school: SchoolLike;
  turmas: readonly Turma[];
  anoLetivo: number;
  defaultTurmaId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function StudentRegistrationModal({
  school, turmas, anoLetivo, defaultTurmaId, onClose, onSaved,
}: StudentRegistrationModalProps) {
  const [studentName, setStudentName] = useState('');
  // Nunca escolhe a primeira turma da lista automaticamente (revisão do
  // PR #15) — só usa defaultTurmaId quando ele de fato existe na lista
  // recebida; caso contrário, começa vazio e exige seleção explícita.
  const [turmaId, setTurmaId] = useState(
    defaultTurmaId && turmas.some(t => t.id === defaultTurmaId) ? defaultTurmaId : ''
  );
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para cadastrar estudantes.');
      return;
    }
    const turma = turmas.find(t => t.id === turmaId);
    if (!turma) {
      setFormError('Selecione uma turma.');
      return;
    }

    setSaving(true);
    try {
      await saveStudentRosterEntry({
        studentKey: crypto.randomUUID(),
        schoolId: school.id,
        codInep: school.codInep,
        escolaNome: school.nome,
        turmaId: turma.id,
        turmaNome: turma.nome,
        anoLetivo,
        studentName,
        active: true,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof StudentRosterValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao cadastrar estudante: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Cadastrar estudante</h3>
            <p className="text-[10px] text-slate-500 font-normal mt-0.5">{school.nome} — {anoLetivo}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3">
          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
          )}

          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] rounded-lg">
            Cadastre somente as informações necessárias ao acompanhamento pedagógico.
          </div>

          <div className="space-y-1">
            <label htmlFor="student-registration-nome" className="text-[9px] font-black uppercase text-slate-600 block">Nome *</label>
            <input
              id="student-registration-nome"
              type="text" required value={studentName} onChange={e => setStudentName(e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="student-registration-turma" className="text-[9px] font-black uppercase text-slate-600 block">Turma *</label>
            {/* Sem `required`: a validação de "turma selecionada" já é
                explícita no handleSubmit ("Selecione uma turma.") — a
                validação nativa do navegador bloqueia o submit ANTES do
                handler rodar, escondendo essa mensagem própria do app
                atrás de um tooltip nativo inconsistente entre navegadores. */}
            <select
              id="student-registration-turma"
              value={turmaId} onChange={e => setTurmaId(e.target.value)}
              className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg"
            >
              <option value="">Selecione</option>
              {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="student-registration-ano" className="text-[9px] font-black uppercase text-slate-600 block">Ano letivo</label>
            <input
              id="student-registration-ano"
              type="text" disabled value={anoLetivo}
              className="w-full p-2 bg-slate-100 border border-slate-250 text-xs rounded-lg text-slate-500"
            />
          </div>

          <button
            type="submit" disabled={saving}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Cadastrar estudante'}
          </button>
        </form>
      </div>
    </div>
  );
}
