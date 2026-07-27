// Fase 2A / revisão pós-PR #8 — seção 6 do plano: "Configuração do Ano
// Letivo". Só matrícula inicial, data de início e status são digitados
// aqui — matrícula ATUAL nunca é campo manual porque é sempre calculada
// dos registros mensais (ver seção 8 / calculateCurrentSchoolEnrollmentFromSnapshots)
// e quantidadeTurmasAtivas vem computada de turmasDaEscola, nunca duplicada
// manualmente. saveSchoolYear() preserva createdAt/createdBy e nunca copia
// schools.matriculas automaticamente (ver schoolYearService.ts).
import React, { useEffect, useState } from 'react';
import { Lock, Save } from 'lucide-react';
import { auth } from '../lib/firebase';
import { saveSchoolYear, SchoolYearValidationError } from '../lib/schoolYearService';
import type { SchoolYear, SchoolYearStatus } from '../types/schoolYear';

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface SchoolYearConfigFormProps {
  school: SchoolLike;
  schoolYear: SchoolYear | null;
  anoLetivo: number;
  turmasAtivas: number;
  canWrite: boolean;
  isFirebaseMode: boolean;
  onSaved: (updated: SchoolYear) => void;
}

const STATUS_OPTIONS: { value: SchoolYearStatus; label: string }[] = [
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'encerrado', label: 'Encerrado' },
  { value: 'arquivado', label: 'Arquivado' },
];

export default function SchoolYearConfigForm({
  school, schoolYear, anoLetivo, turmasAtivas, canWrite, isFirebaseMode, onSaved,
}: SchoolYearConfigFormProps) {
  const [status, setStatus] = useState<SchoolYearStatus>('planejamento');
  const [matriculaInicial, setMatriculaInicial] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Sincroniza o formulário com o registro carregado — só quando a
  // REFERÊNCIA de schoolYear muda (carga inicial ou depois de um save bem
  // sucedido), nunca a cada render.
  useEffect(() => {
    setStatus(schoolYear?.status ?? 'planejamento');
    setMatriculaInicial(schoolYear?.matriculaInicial != null ? String(schoolYear.matriculaInicial) : '');
    setDataInicio(schoolYear?.dataInicio ?? '');
  }, [schoolYear]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para salvar a configuração do ano letivo.');
      return;
    }

    try {
      const updated = await saveSchoolYear({
        schoolId: school.id,
        codInep: school.codInep,
        escolaNome: school.nome,
        anoLetivo,
        matriculaInicial: matriculaInicial.trim() === '' ? null : Number(matriculaInicial),
        quantidadeTurmasAtivas: turmasAtivas,
        status,
        dataInicio: dataInicio.trim() === '' ? null : dataInicio,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      setFormSuccess('Configuração do ano letivo salva com sucesso.');
      onSaved(updated);
    } catch (err) {
      if (err instanceof SchoolYearValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar configuração do ano letivo: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  if (!canWrite) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
        <Lock size={12} className="text-amber-500" /> Sem permissão para configurar o ano letivo desta escola.
      </div>
    );
  }

  if (!isFirebaseMode) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
        Modo demonstração — faça login para configurar o ano letivo real.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
      {formError && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
      )}
      {formSuccess && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg font-bold">{formSuccess}</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-slate-600 block">Matrícula inicial de {anoLetivo}</label>
          <input
            type="number" min={0} step={1} value={matriculaInicial}
            onChange={e => setMatriculaInicial(e.target.value)}
            placeholder="Não informado"
            className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-slate-600 block">Data de início</label>
          <input
            type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
            className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-slate-600 block">Status</label>
          <select
            value={status} onChange={e => setStatus(e.target.value as SchoolYearStatus)}
            className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
          >
            {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>
      <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5">
        <Save size={12} /> Salvar configuração
      </button>
    </form>
  );
}
