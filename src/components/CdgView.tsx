// Reestruturação SIFEC — Ciclo de Gestão (CdG) simplificado: mantém somente
// Situação do Plano (Ativo/Inativo), Status de Execução (Não iniciado/Em
// execução/Concluído) e a listagem de ações/tarefas com seu próprio status
// (Não Iniciado, Previsto, Em Andamento, Concluído, Concluído com Atraso,
// Atrasado). Remove a grade escola × 4 fases e o slider de progresso 0-100
// do protótipo anterior.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ListTodo, Pencil, Plus, Trash2, X } from 'lucide-react';
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
  CdgValidationError,
  deleteCdgTask,
  getCdgPlan,
  isCdgTaskOverdue,
  listCdgTasksForSchool,
  saveCdgPlan,
  saveCdgTask,
} from '../lib/cdgService';
import {
  CDG_EXECUTION_STATUSES, CDG_PLAN_SITUACOES, CDG_TASK_STATUSES,
  type CdgPlan, type CdgTask,
} from '../types/cdgPlan';
import { DEMO_CDG_PLAN, DEMO_CDG_TASKS } from '../data/demoCdgPlan';
import { DEMO_ANO_LETIVO, DEMO_SCHOOL_ID } from '../data/demoGradeEntryMonitoring';

const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);
const TASK_STATUS_CLASSES: Record<string, string> = {
  'Não Iniciado': 'bg-slate-100 text-slate-500 border-slate-200',
  'Previsto': 'bg-slate-100 text-slate-600 border-slate-200',
  'Em Andamento': 'bg-amber-50 text-amber-700 border-amber-200',
  'Concluído': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Concluído com Atraso': 'bg-orange-50 text-orange-700 border-orange-300',
  'Atrasado': 'bg-rose-50 text-rose-700 border-rose-200',
};

interface SchoolLike { id: string; nome: string; codInep: string; }

function emptyTaskDraft() {
  return { acao: '', responsavel: '', prazo: '', status: 'Não Iniciado' as CdgTask['status'] };
}

export default function CdgView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  const [anoLetivo, setAnoLetivo] = useState(() => new Date().getFullYear());
  const anoLetivoOptions = buildAnoLetivoOptions();
  const [selectedSchoolId, setSelectedSchoolId] = useState('');

  const [plan, setPlan] = useState<CdgPlan | null>(null);
  const [tasks, setTasks] = useState<CdgTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [planError, setPlanError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<CdgTask | null>(null);
  const [taskDraft, setTaskDraft] = useState(emptyTaskDraft());
  const [taskError, setTaskError] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

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
        setPlan(null);
        setTasks([]);
        return;
      }
      if (!isFirebaseMode) {
        const isDemoMatch = selectedSchool.id === DEMO_SCHOOL_ID && anoLetivo === DEMO_ANO_LETIVO;
        setPlan(isDemoMatch ? DEMO_CDG_PLAN : null);
        setTasks(isDemoMatch ? DEMO_CDG_TASKS : []);
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const [loadedPlan, loadedTasks] = await Promise.all([
          getCdgPlan(selectedSchool.id, anoLetivo),
          listCdgTasksForSchool(selectedSchool.id, anoLetivo),
        ]);
        if (!cancelled) {
          setPlan(loadedPlan);
          setTasks(loadedTasks);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o Ciclo de Gestão.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedSchool, anoLetivo, isFirebaseMode, reloadTick]);

  async function handleSavePlanField(field: 'situacao' | 'statusExecucao', value: string) {
    setPlanError('');
    if (!selectedSchool) return;
    const email = auth.currentUser?.email;
    if (!email) {
      setPlanError('É preciso estar autenticado para atualizar o plano.');
      return;
    }
    setSavingPlan(true);
    try {
      await saveCdgPlan(
        {
          schoolId: selectedSchool.id,
          codInep: selectedSchool.codInep,
          escolaNome: selectedSchool.nome,
          anoLetivo,
          situacao: field === 'situacao' ? (value as CdgPlan['situacao']) : (plan?.situacao ?? 'Ativo'),
          statusExecucao: field === 'statusExecucao' ? (value as CdgPlan['statusExecucao']) : (plan?.statusExecucao ?? 'Não iniciado'),
          actingUserEmail: email,
          now: new Date().toISOString(),
        },
        plan ?? undefined
      );
      setReloadTick(t => t + 1);
    } catch (err) {
      setPlanError(err instanceof CdgValidationError ? err.message : 'Erro ao salvar o plano: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingPlan(false);
    }
  }

  function openCreateTask() {
    setEditingTask(null);
    setTaskDraft(emptyTaskDraft());
    setTaskError('');
    setShowTaskForm(true);
  }

  function openEditTask(task: CdgTask) {
    setEditingTask(task);
    setTaskDraft({ acao: task.acao, responsavel: task.responsavel, prazo: task.prazo, status: task.status });
    setTaskError('');
    setShowTaskForm(true);
  }

  async function handleSubmitTask(e: React.FormEvent) {
    e.preventDefault();
    setTaskError('');
    if (!selectedSchool) return;
    const email = auth.currentUser?.email;
    if (!email) {
      setTaskError('É preciso estar autenticado para registrar uma tarefa.');
      return;
    }
    setSavingTask(true);
    try {
      await saveCdgTask(
        {
          id: editingTask?.id,
          schoolId: selectedSchool.id,
          codInep: selectedSchool.codInep,
          escolaNome: selectedSchool.nome,
          anoLetivo,
          acao: taskDraft.acao,
          responsavel: taskDraft.responsavel,
          prazo: taskDraft.prazo,
          status: taskDraft.status,
          actingUserEmail: email,
          now: new Date().toISOString(),
        },
        editingTask ?? undefined
      );
      setShowTaskForm(false);
      setReloadTick(t => t + 1);
    } catch (err) {
      setTaskError(err instanceof CdgValidationError ? err.message : 'Erro ao salvar tarefa: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingTask(false);
    }
  }

  async function handleDeleteTask(task: CdgTask) {
    if (!isFirebaseMode) return;
    await deleteCdgTask(task.id);
    setReloadTick(t => t + 1);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const visibleTasks = onlyOverdue ? tasks.filter(t => isCdgTaskOverdue(t, todayIso)) : tasks;
  const overdueCount = tasks.filter(t => isCdgTaskOverdue(t, todayIso)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 — GESTÃO DE EQUIPES</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Ciclo de Gestão (CdG)</h2>
          <p className="text-xs text-slate-500 font-normal max-w-2xl">
            Situação do plano, status de execução e ações/tarefas em acompanhamento por escola.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
            {getSchoolScopeLabel({ superintendent: activeSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: isFirebaseMode, adminScope })}
          </span>
          <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} aria-label="Escola"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl max-w-[220px]">
            <option value="">Selecione a escola</option>
            {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={anoLetivo} onChange={e => setAnoLetivo(Number(e.target.value))} aria-label="Ano letivo"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl">
            {anoLetivoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
        </div>
      </div>

      {!selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
          Selecione uma escola para ver o Ciclo de Gestão.
        </div>
      ) : loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">Carregando...</div>
      ) : loadError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={() => setReloadTick(t => t + 1)}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition shrink-0">
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <section className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase text-slate-700 mb-3 flex items-center gap-1.5">
              <CheckCircle2 size={14} /> Situação do plano
            </h3>
            {planError && <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{planError}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="cdg-situacao" className="text-[9px] font-black uppercase text-slate-600 block">Situação do plano</label>
                <select id="cdg-situacao" disabled={!canWrite || savingPlan} value={plan?.situacao ?? 'Ativo'}
                  onChange={e => handleSavePlanField('situacao', e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-bold disabled:bg-slate-100">
                  {CDG_PLAN_SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="cdg-execucao" className="text-[9px] font-black uppercase text-slate-600 block">Status de execução</label>
                <select id="cdg-execucao" disabled={!canWrite || savingPlan} value={plan?.statusExecucao ?? 'Não iniciado'}
                  onChange={e => handleSavePlanField('statusExecucao', e.target.value)}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-bold disabled:bg-slate-100">
                  {CDG_EXECUTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
                <ListTodo size={14} /> Ações e tarefas
                {overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold">
                    <AlertTriangle size={10} /> {overdueCount} atrasada{overdueCount > 1 ? 's' : ''}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOnlyOverdue(prev => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${onlyOverdue ? 'bg-rose-600 text-white border-rose-700' : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300'}`}>
                  Só atrasadas
                </button>
                {canWrite && isFirebaseMode && (
                  <button type="button" onClick={openCreateTask}
                    className="px-2.5 py-1 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition">
                    <Plus size={12} /> Nova tarefa
                  </button>
                )}
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wide">
                    <th className="py-2 px-3">Ação</th>
                    <th className="py-2 px-3">Responsável</th>
                    <th className="py-2 px-3">Prazo</th>
                    <th className="py-2 px-3">Status</th>
                    {canWrite && isFirebaseMode && <th className="py-2 px-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTasks.length === 0 ? (
                    <tr><td colSpan={5} className="py-6 text-center text-slate-400">Nenhuma tarefa registrada para este filtro.</td></tr>
                  ) : (
                    visibleTasks.map(task => {
                      const overdue = isCdgTaskOverdue(task, todayIso);
                      return (
                        <tr key={task.id} className={overdue ? 'bg-rose-50/40' : undefined}>
                          <td className="py-2 px-3 font-bold text-slate-800">{task.acao}</td>
                          <td className="py-2 px-3">{task.responsavel}</td>
                          <td className="py-2 px-3 font-mono">{task.prazo}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${TASK_STATUS_CLASSES[task.status]}`}>
                              {task.status}
                            </span>
                          </td>
                          {canWrite && isFirebaseMode && (
                            <td className="py-2 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditTask(task)} className="p-1 hover:bg-slate-100 hover:text-blue-700 text-slate-400 rounded-md transition" title="Editar">
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => handleDeleteTask(task)} className="p-1 hover:bg-slate-100 hover:text-rose-600 text-slate-400 rounded-md transition" title="Remover">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {showTaskForm && selectedSchool && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</h3>
              <button onClick={() => setShowTaskForm(false)} className="text-slate-400 hover:text-slate-650 transition"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitTask} className="p-6 space-y-3">
              {taskError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> <span>{taskError}</span>
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="cdg-task-acao" className="text-[9px] font-black uppercase text-slate-600 block">Ação / tarefa</label>
                <input id="cdg-task-acao" type="text" value={taskDraft.acao} onChange={e => setTaskDraft({ ...taskDraft, acao: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg" />
              </div>
              <div className="space-y-1">
                <label htmlFor="cdg-task-responsavel" className="text-[9px] font-black uppercase text-slate-600 block">Responsável</label>
                <input id="cdg-task-responsavel" type="text" value={taskDraft.responsavel} onChange={e => setTaskDraft({ ...taskDraft, responsavel: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="cdg-task-prazo" className="text-[9px] font-black uppercase text-slate-600 block">Prazo</label>
                  <input id="cdg-task-prazo" type="date" value={taskDraft.prazo} onChange={e => setTaskDraft({ ...taskDraft, prazo: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="cdg-task-status" className="text-[9px] font-black uppercase text-slate-600 block">Status</label>
                  <select id="cdg-task-status" value={taskDraft.status} onChange={e => setTaskDraft({ ...taskDraft, status: e.target.value as CdgTask['status'] })}
                    className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-bold">
                    {CDG_TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={savingTask}
                className="w-full py-2.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50">
                {savingTask ? 'Salvando...' : 'Salvar tarefa'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
