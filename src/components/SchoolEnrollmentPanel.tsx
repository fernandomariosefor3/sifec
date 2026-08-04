// Reestruturação SIFEC — Gestão de Escolas simplificada: este painel deixa
// de guiar um fluxo de 3 passos (configuração do ano letivo → turmas →
// registro mensal) com KPIs de movimentação e histórico. Mantém somente:
// A) Resumo, B) Matrícula por bimestre (1º ao 4º — substitui o registro
// mensal por turma), C) Turmas da escola. Configuração do ano letivo,
// formulário de movimentação mensal e histórico foram removidos da
// interface — enrollment_snapshots/school_years continuam existindo no
// Firestore só porque a Sala de Situação ainda os lê para seus próprios
// indicadores, mas este painel não escreve mais neles.
import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, CalendarRange } from 'lucide-react';
import { auth } from '../lib/firebase';
import { hasSchoolWriteAccess, isCurrentUserAuthorized } from '../lib/superintendentService';
import { getClassroomsForSchool, saveClassYearFields } from '../lib/classService';
import {
  BimonthlyEnrollmentValidationError,
  listBimonthlyEnrollmentsForSchool,
  saveBimonthlyEnrollment,
} from '../lib/bimonthlyEnrollmentService';
import ClassroomFormModal from './ClassroomFormModal';
import ClassroomsSection from './ClassroomsSection';
import type { Turma } from '../types/classroom';
import type { BimonthlyEnrollment } from '../types/bimonthlyEnrollment';
import type { Bimestre } from '../types/gradeEntryMonitoring';

const ANO_LETIVO = 2026;
const BIMESTRES: Bimestre[] = [1, 2, 3, 4];

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface SchoolEnrollmentPanelProps {
  school: SchoolLike;
  turmas: Turma[];
  isFirebaseMode: boolean;
  onClose: () => void;
  // Chamado depois de qualquer gravação (matrícula por bimestre, turma) para
  // a tabela principal (EscolasView/SchoolsTable) atualizar sem exigir
  // reload manual.
  onDataChanged?: () => void;
}

export default function SchoolEnrollmentPanel({ school, turmas, isFirebaseMode, onClose, onDataChanged }: SchoolEnrollmentPanelProps) {
  const [bimonthlyEnrollments, setBimonthlyEnrollments] = useState<BimonthlyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [matriculaDrafts, setMatriculaDrafts] = useState<Record<Bimestre, string>>({ 1: '', 2: '', 3: '', 4: '' });
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [savingBimestre, setSavingBimestre] = useState<Bimestre | null>(null);
  const [turmaActionError, setTurmaActionError] = useState('');
  const [classroomModalOpen, setClassroomModalOpen] = useState(false);
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null);

  const turmasDaEscola = useMemo(
    () => getClassroomsForSchool(turmas, school),
    [turmas, school]
  );
  const canWrite = hasSchoolWriteAccess(school.nome);
  const notAuthorized = isFirebaseMode && !!auth.currentUser && !isCurrentUserAuthorized();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');
      if (!isFirebaseMode) {
        if (!cancelled) {
          setBimonthlyEnrollments([]);
          setLoading(false);
        }
        return;
      }
      try {
        const loaded = await listBimonthlyEnrollmentsForSchool(school.id, ANO_LETIVO);
        if (!cancelled) {
          setBimonthlyEnrollments(loaded);
          const nextDrafts: Record<Bimestre, string> = { 1: '', 2: '', 3: '', 4: '' };
          loaded.forEach(item => { nextDrafts[item.bimestre] = String(item.matricula); });
          setMatriculaDrafts(nextDrafts);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Erro ao carregar dados da escola.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [school.id, isFirebaseMode, reloadTick]);

  async function handleSaveBimestre(bimestre: Bimestre) {
    setFormError('');
    setFormSuccess('');
    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar a matrícula.');
      return;
    }
    const raw = matriculaDrafts[bimestre].trim();
    if (raw === '') {
      setFormError('Informe a matrícula do bimestre antes de salvar.');
      return;
    }
    setSavingBimestre(bimestre);
    try {
      const existing = bimonthlyEnrollments.find(item => item.bimestre === bimestre);
      await saveBimonthlyEnrollment(
        {
          schoolId: school.id,
          codInep: school.codInep,
          escolaNome: school.nome,
          anoLetivo: ANO_LETIVO,
          bimestre,
          matricula: Number(raw),
          actingUserEmail: email,
          now: new Date().toISOString(),
        },
        existing
      );
      setFormSuccess(`Matrícula do ${bimestre}º bimestre salva com sucesso.`);
      setReloadTick(t => t + 1);
      onDataChanged?.();
    } catch (err) {
      setFormError(
        err instanceof BimonthlyEnrollmentValidationError
          ? err.message
          : 'Erro ao salvar matrícula: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSavingBimestre(null);
    }
  }

  async function handleToggleAtiva(turma: Turma) {
    setTurmaActionError('');
    const email = auth.currentUser?.email;
    if (!email) {
      setTurmaActionError('É preciso estar autenticado para ativar/inativar turmas.');
      return;
    }
    try {
      await saveClassYearFields(turma.id, {
        schoolId: turma.schoolId ?? school.id,
        codInep: turma.codInep ?? school.codInep,
        escolaNome: turma.escolaNome,
        anoLetivo: turma.anoLetivo ?? ANO_LETIVO,
        ativa: turma.ativa === false,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      onDataChanged?.();
    } catch (err) {
      setTurmaActionError('Erro ao alterar status da turma: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function openCreateClassroom() {
    setEditingTurma(null);
    setClassroomModalOpen(true);
  }

  function openEditClassroom(turma: Turma) {
    setEditingTurma(turma);
    setClassroomModalOpen(true);
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] text-emerald-700 tracking-wider uppercase font-black font-mono">Matrícula por bimestre — {ANO_LETIVO}</span>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{school.nome}</h3>
              <p className="text-[10px] text-slate-500 font-mono">INEP: {school.codInep}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {notAuthorized ? (
            <div className="py-10 text-center text-rose-600 text-xs flex flex-col items-center gap-2">
              <AlertTriangle size={18} />
              <span className="font-bold">Sua conta não está cadastrada ou está inativa no SIFEC.</span>
              <span className="text-slate-500 font-normal">Contate o administrador para liberar seu acesso.</span>
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-slate-400 text-xs">Carregando dados da escola...</div>
          ) : loadError ? (
            <div className="py-10 text-center text-rose-600 text-xs flex flex-col items-center gap-2">
              <AlertTriangle size={18} />
              <span className="font-bold">Não foi possível carregar os dados desta escola.</span>
              <span className="text-slate-500 font-normal">{loadError}</span>
              <button
                type="button"
                onClick={() => setReloadTick(tick => tick + 1)}
                className="mt-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {/* Matrícula por bimestre */}
              <section>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                  <CalendarRange size={14} /> Matrícula por bimestre
                </h4>
                {formError && (
                  <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
                )}
                {formSuccess && (
                  <div className="mb-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg font-bold">{formSuccess}</div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {BIMESTRES.map(bimestre => (
                    <div key={bimestre} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                      <label htmlFor={`matricula-bimestre-${bimestre}`} className="text-[9px] uppercase text-slate-400 font-bold tracking-wider block">
                        {bimestre}º Bimestre
                      </label>
                      <input
                        id={`matricula-bimestre-${bimestre}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        disabled={!canWrite}
                        value={matriculaDrafts[bimestre]}
                        onChange={e => setMatriculaDrafts(prev => ({ ...prev, [bimestre]: e.target.value }))}
                        className="w-full p-1.5 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => handleSaveBimestre(bimestre)}
                          disabled={savingBimestre === bimestre}
                          className="w-full py-1 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-md text-[10px] font-bold transition disabled:opacity-50"
                        >
                          {savingBimestre === bimestre ? 'Salvando...' : 'Salvar'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Turmas */}
              <ClassroomsSection
                turmasDaEscola={turmasDaEscola}
                canWrite={canWrite}
                isFirebaseMode={isFirebaseMode}
                turmaActionError={turmaActionError}
                onCreateClick={openCreateClassroom}
                onEditClick={openEditClassroom}
                onToggleAtiva={handleToggleAtiva}
              />
            </>
          )}
        </div>
      </div>

      {classroomModalOpen && (
        <ClassroomFormModal
          school={school}
          anoLetivo={ANO_LETIVO}
          existingTurmas={turmasDaEscola}
          editingTurma={editingTurma}
          onClose={() => setClassroomModalOpen(false)}
          onSaved={() => onDataChanged?.()}
        />
      )}
    </div>
  );
}
