// Reestruturação SIFEC — Recomposição: formulário livre para a escola
// registrar o próprio plano de recomposição de aprendizagens. Substitui o
// protótipo anterior (planos padrão gerados automaticamente + progresso
// numérico) por um registro descritivo simples: prazo, área/disciplina,
// turno e descrição em texto livre.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Award, Pencil, Plus, Trash2, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import {
  getSuperintendents,
  getActiveSuperintendentId,
  getAdminSchoolScope,
  getSchoolsForCurrentScope,
  getSchoolScopeLabel,
  hasSchoolWriteAccess,
} from '../lib/superintendentService';
import { buildAnoLetivoOptions } from '../lib/anoLetivoOptions';
import {
  RecomposicaoPlanValidationError,
  deleteRecomposicaoPlan,
  listRecomposicaoPlansForSchool,
  saveRecomposicaoPlan,
} from '../lib/recomposicaoPlanService';
import { RECOMPOSICAO_TURNOS, type RecomposicaoPlan, type RecomposicaoTurno } from '../types/recomposicaoPlan';
import { DEMO_RECOMPOSICAO_PLANOS } from '../data/demoRecomposicaoPlan';
import { DEMO_ANO_LETIVO, DEMO_BIMESTRE, DEMO_SCHOOL_ID } from '../data/demoGradeEntryMonitoring';
import type { Bimestre } from '../types/gradeEntryMonitoring';

const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);

interface SchoolLike { id: string; nome: string; codInep: string; }

function emptyDraft() {
  return { prazo: '', areaDisciplina: '', turno: 'Matutino' as RecomposicaoTurno, descricao: '' };
}

export default function RecomposicaoView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  const [anoLetivo, setAnoLetivo] = useState(() => new Date().getFullYear());
  const anoLetivoOptions = buildAnoLetivoOptions();
  const [bimestre, setBimestre] = useState<Bimestre>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

  const [planos, setPlanos] = useState<RecomposicaoPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RecomposicaoPlan | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => setIsFirebaseMode(!!user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
      setAdminScope(getAdminSchoolScope());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleChange);
    window.addEventListener('sefor3_admin_scope_change', handleChange);
    handleChange();
    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handleChange);
      window.removeEventListener('sefor3_admin_scope_change', handleChange);
    };
  }, []);

  const superintendents = getSuperintendents();
  const activeSuper = superintendents.find(s => s.id === activeSuperId) || (superintendents.length > 0 ? superintendents[0] : null);
  const visibleSchools = useMemo(
    () => getSchoolsForCurrentScope({ superintendent: activeSuper, allSchools: SEED_SCHOOLS, isAuthenticated: isFirebaseMode, adminScope }),
    [activeSuper, isFirebaseMode, adminScope]
  );

  useEffect(() => {
    if (selectedSchoolId && !visibleSchools.some(s => s.id === selectedSchoolId)) {
      setSelectedSchoolId('');
    }
  }, [visibleSchools, selectedSchoolId]);

  const selectedSchool: SchoolLike | null = visibleSchools.find(s => s.id === selectedSchoolId) ?? null;
  const canWrite = selectedSchool ? hasSchoolWriteAccess(selectedSchool.nome) : false;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedSchool) {
        setPlanos([]);
        return;
      }
      if (!isFirebaseMode) {
        const isDemoMatch = selectedSchool.id === DEMO_SCHOOL_ID && anoLetivo === DEMO_ANO_LETIVO && bimestre === DEMO_BIMESTRE;
        setPlanos(isDemoMatch ? DEMO_RECOMPOSICAO_PLANOS : []);
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const loaded = await listRecomposicaoPlansForSchool(selectedSchool.id, anoLetivo);
        if (!cancelled) setPlanos(loaded.filter(p => p.bimestre === bimestre));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar os planos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedSchool, anoLetivo, bimestre, isFirebaseMode, reloadTick]);

  function openCreate() {
    setEditingPlan(null);
    setDraft(emptyDraft());
    setFormError('');
    setShowForm(true);
  }

  function openEdit(plan: RecomposicaoPlan) {
    setEditingPlan(plan);
    setDraft({ prazo: plan.prazo, areaDisciplina: plan.areaDisciplina, turno: plan.turno, descricao: plan.descricao });
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!selectedSchool) return;
    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar um plano.');
      return;
    }
    setSaving(true);
    try {
      await saveRecomposicaoPlan(
        {
          id: editingPlan?.id,
          schoolId: selectedSchool.id,
          codInep: selectedSchool.codInep,
          escolaNome: selectedSchool.nome,
          anoLetivo,
          bimestre,
          prazo: draft.prazo,
          areaDisciplina: draft.areaDisciplina,
          turno: draft.turno,
          descricao: draft.descricao,
          actingUserEmail: email,
          now: new Date().toISOString(),
        },
        editingPlan ?? undefined
      );
      setShowForm(false);
      setReloadTick(t => t + 1);
    } catch (err) {
      setFormError(
        err instanceof RecomposicaoPlanValidationError
          ? err.message
          : 'Erro ao salvar plano: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(plan: RecomposicaoPlan) {
    if (!isFirebaseMode) return;
    await deleteRecomposicaoPlan(plan.id);
    setReloadTick(t => t + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-coral tracking-wider uppercase font-black font-mono">SEFOR 3 — RECOMPOSIÇÃO DE APRENDIZAGENS</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Recomposição</h2>
          <p className="text-xs text-slate-500 font-normal max-w-2xl">
            Registro livre do plano próprio de recomposição de cada escola — prazos, áreas/disciplinas, turnos e descrição.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
            {getSchoolScopeLabel({ superintendent: activeSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: isFirebaseMode, adminScope })}
          </span>
          <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} aria-label="Escola"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs font-bold rounded-xl max-w-[220px]">
            <option value="">Selecione a escola</option>
            {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={anoLetivo} onChange={e => setAnoLetivo(Number(e.target.value))} aria-label="Ano letivo"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs font-bold rounded-xl">
            {anoLetivoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          <select value={bimestre} onChange={e => setBimestre(Number(e.target.value) as Bimestre)} aria-label="Bimestre"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs font-bold rounded-xl">
            <option value={1}>1º Bimestre</option>
            <option value={2}>2º Bimestre</option>
            <option value={3}>3º Bimestre</option>
            <option value={4}>4º Bimestre</option>
          </select>
        </div>
      </div>

      {!selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
          Selecione uma escola para ver os planos de recomposição.
        </div>
      ) : (
        <>
          {canWrite && isFirebaseMode && (
            <div className="flex justify-end">
              <button type="button" onClick={openCreate}
                className="py-1.5 px-3 bg-brand-coral hover:bg-brand-coral/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm">
                <Plus size={14} /> Registrar plano
              </button>
            </div>
          )}

          {loadError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold flex items-center justify-between gap-3">
              <span>{loadError}</span>
              <button type="button" onClick={() => setReloadTick(t => t + 1)}
                className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition shrink-0">
                Tentar novamente
              </button>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">Carregando...</div>
          ) : planos.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
              Nenhum plano de recomposição registrado para este bimestre.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {planos.map(plan => (
                <div key={plan.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-brand-coral font-black text-xs">
                      <Award size={14} /> {plan.areaDisciplina}
                    </div>
                    {canWrite && isFirebaseMode && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(plan)} className="p-1 hover:bg-slate-100 hover:text-blue-700 text-slate-400 rounded-md transition" title="Editar">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => handleDelete(plan)} className="p-1 hover:bg-slate-100 hover:text-rose-600 text-slate-400 rounded-md transition" title="Remover">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600">Turno: {plan.turno}</span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600">Prazo: {plan.prazo}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{plan.descricao}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showForm && selectedSchool && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                {editingPlan ? 'Editar plano' : 'Registrar plano de recomposição'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-650 transition"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-3">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span>{formError}</span>
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="recomp-prazo" className="text-[9px] font-black uppercase text-slate-600 block">Prazo</label>
                <input id="recomp-prazo" type="text" placeholder="Ex.: até o fim do 2º bimestre" value={draft.prazo}
                  onChange={e => setDraft({ ...draft, prazo: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs rounded-lg" />
              </div>
              <div className="space-y-1">
                <label htmlFor="recomp-area" className="text-[9px] font-black uppercase text-slate-600 block">Área / Disciplina</label>
                <input id="recomp-area" type="text" placeholder="Ex.: Língua Portuguesa e Matemática" value={draft.areaDisciplina}
                  onChange={e => setDraft({ ...draft, areaDisciplina: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs rounded-lg" />
              </div>
              <div className="space-y-1">
                <label htmlFor="recomp-turno" className="text-[9px] font-black uppercase text-slate-600 block">Turno</label>
                <select id="recomp-turno" value={draft.turno} onChange={e => setDraft({ ...draft, turno: e.target.value as RecomposicaoTurno })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs rounded-lg font-bold">
                  {RECOMPOSICAO_TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="recomp-descricao" className="text-[9px] font-black uppercase text-slate-600 block">Descrição do plano</label>
                <textarea id="recomp-descricao" value={draft.descricao} onChange={e => setDraft({ ...draft, descricao: e.target.value })} rows={5} maxLength={2000}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-coral text-xs rounded-lg" />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-brand-coral hover:bg-brand-coral/90 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar plano'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
