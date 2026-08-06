// Reestruturação SIFEC — "Alunos com Baixo Desempenho (Farol do Estudante)":
// substitui a antiga Busca Ativa (acompanhamento de frequência/evasão) por
// uma listagem NOMINAL, por turma e disciplina, de estudantes com percentual
// de acerto < 25% no SISEDU Analytics. Não há integração automática com o
// SISEDU neste repositório — o percentual é lançado manualmente pela equipe
// a partir do relatório externo (ver farolEstudanteService.ts).
//
// Dado nominal por natureza — nunca exportado publicamente. A tela mostra um
// selo permanente de "informação administrativa sensível" (ver
// conhecimento_sifec.md: trabalhar preferencialmente com dados agregados,
// nunca publicar dado nominal sem autorização).
import { useEffect, useMemo, useState } from 'react';
import { Archive, AlertTriangle, Lock, Pencil, Plus, ShieldAlert, X } from 'lucide-react';
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
import { getClassroomsForSchoolYear } from '../lib/classService';
import { useSchoolClassrooms } from '../hooks/useSchoolClassrooms';
import { buildAnoLetivoOptions } from '../lib/anoLetivoOptions';
import {
  FarolEstudanteValidationError,
  archiveFarolEstudanteItem,
  listFarolEstudanteForSchool,
  saveFarolEstudanteItem,
} from '../lib/farolEstudanteService';
import {
  FAROL_ACERTO_LIMITE,
  FAROL_SOURCE_SYSTEM,
  FAROL_STATUS_ACOMPANHAMENTO,
  type FarolEstudanteItem,
  type FarolStatusAcompanhamento,
} from '../types/farolEstudante';
import { DEMO_FAROL_ESTUDANTE } from '../data/demoFarolEstudante';
import { DEMO_ANO_LETIVO, DEMO_BIMESTRE, DEMO_SCHOOL_ID } from '../data/demoGradeEntryMonitoring';
import type { Bimestre } from '../types/gradeEntryMonitoring';

const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);

interface SchoolLike { id: string; nome: string; codInep: string; }

function emptyDraft() {
  return {
    turmaId: '',
    disciplina: '',
    estudanteNome: '',
    percentualAcerto: '',
    referenceDate: '',
    status: 'Identificado' as FarolStatusAcompanhamento,
    observacao: '',
  };
}

export default function FarolEstudanteView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  const [anoLetivo, setAnoLetivo] = useState(() => new Date().getFullYear());
  const anoLetivoOptions = buildAnoLetivoOptions();
  const [bimestre, setBimestre] = useState<Bimestre>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [turmaFilter, setTurmaFilter] = useState('todas');
  // Correção final da auditoria, seção 2: arquivados nunca aparecem por
  // padrão — só mediante este filtro explícito, nunca ligado por padrão.
  const [showArchived, setShowArchived] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState('');

  const [items, setItems] = useState<FarolEstudanteItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<FarolEstudanteItem | null>(null);
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

  const { turmas, status: turmasStatus, loading: turmasLoading } = useSchoolClassrooms(selectedSchool ? selectedSchool.id : null, isFirebaseMode);
  const turmasDaEscola = useMemo(
    () => (selectedSchool ? getClassroomsForSchoolYear(turmas, selectedSchool, anoLetivo) : []),
    [turmas, selectedSchool, anoLetivo]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedSchool) {
        setItems([]);
        return;
      }
      if (!isFirebaseMode) {
        const isDemoMatch = selectedSchool.id === DEMO_SCHOOL_ID && anoLetivo === DEMO_ANO_LETIVO && bimestre === DEMO_BIMESTRE;
        const demoItems = isDemoMatch ? DEMO_FAROL_ESTUDANTE : [];
        setItems(showArchived ? demoItems : demoItems.filter(item => item.statusRegistro !== 'arquivado'));
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const loaded = await listFarolEstudanteForSchool(selectedSchool.id, anoLetivo, { includeArchived: showArchived });
        if (!cancelled) setItems(loaded.filter(item => item.bimestre === bimestre));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar a listagem.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // selectedSchoolId (primitivo) substitui selectedSchool (objeto) de
    // propósito — selectedSchool nunca é referencialmente estável entre
    // renders (getSuperintendents() sempre devolve um array novo), o que
    // faria este efeito refazer a busca a cada re-render que ELE MESMO
    // provoca via setItems (bug real encontrado na auditoria da
    // reestruturação — mesmo padrão de visibleSchoolIdsKey em NotasView.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedSchoolId substitui selectedSchool de propósito (ver comentário acima)
  }, [selectedSchoolId, anoLetivo, bimestre, isFirebaseMode, reloadTick, showArchived]);

  const visibleItems = useMemo(
    () => (turmaFilter === 'todas' ? items : items.filter(i => i.turmaId === turmaFilter)),
    [items, turmaFilter]
  );

  function openCreate() {
    setEditingItem(null);
    setDraft(emptyDraft());
    setFormError('');
    setShowForm(true);
  }

  function openEdit(item: FarolEstudanteItem) {
    setEditingItem(item);
    setDraft({
      turmaId: item.turmaId,
      disciplina: item.disciplina,
      estudanteNome: item.estudanteNome,
      percentualAcerto: String(item.percentualAcerto),
      referenceDate: item.referenceDate,
      status: item.status,
      observacao: item.observacao ?? '',
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!selectedSchool) return;
    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar um estudante.');
      return;
    }
    const turma = turmasDaEscola.find(t => t.id === draft.turmaId);
    if (!turma) {
      setFormError('Selecione a turma do estudante.');
      return;
    }
    setSaving(true);
    try {
      await saveFarolEstudanteItem(
        {
          id: editingItem?.id,
          schoolId: selectedSchool.id,
          codInep: selectedSchool.codInep,
          escolaNome: selectedSchool.nome,
          turmaId: turma.id,
          turmaNome: turma.nome,
          disciplina: draft.disciplina,
          anoLetivo,
          bimestre,
          estudanteNome: draft.estudanteNome,
          percentualAcerto: Number(draft.percentualAcerto),
          referenceDate: draft.referenceDate,
          status: draft.status,
          observacao: draft.observacao.trim() === '' ? undefined : draft.observacao,
          actingUserEmail: email,
          now: new Date().toISOString(),
        },
        editingItem ?? undefined
      );
      setShowForm(false);
      setReloadTick(t => t + 1);
    } catch (err) {
      setFormError(
        err instanceof FarolEstudanteValidationError
          ? err.message
          : 'Erro ao salvar registro: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setSaving(false);
    }
  }

  // Correção final da auditoria, seção 2: "Excluir" nunca aparece para o
  // superintendente comum — exclusão física é restrita ao admin raiz em
  // firestore.rules. Arquivar é sempre um update, nunca um delete.
  async function handleArchive(item: FarolEstudanteItem) {
    if (!isFirebaseMode) return;
    const email = auth.currentUser?.email;
    if (!email) return;
    setArchiveMessage('');
    await archiveFarolEstudanteItem(item, email, new Date().toISOString());
    setArchiveMessage(`Registro de ${item.turmaNome} (${item.disciplina}) arquivado — não foi excluído, continua acessível pelo filtro "Mostrar arquivados".`);
    setReloadTick(t => t + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-orange tracking-wider uppercase font-black font-mono">SEFOR 3 — ACOMPANHAMENTO PEDAGÓGICO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Alunos com Baixo Desempenho (Farol do Estudante)</h2>
          <p className="text-xs text-slate-500 font-normal max-w-2xl">
            Listagem nominal, por turma e disciplina, de estudantes com percentual de acerto abaixo de {FAROL_ACERTO_LIMITE}% no SISEDU Analytics.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
            {getSchoolScopeLabel({ superintendent: activeSuper, allSchoolNames: ALL_SCHOOL_NAMES, isAuthenticated: isFirebaseMode, adminScope })}
          </span>
          <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} aria-label="Escola"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs font-bold rounded-xl max-w-[220px]">
            <option value="">Selecione a escola</option>
            {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={anoLetivo} onChange={e => setAnoLetivo(Number(e.target.value))} aria-label="Ano letivo"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs font-bold rounded-xl">
            {anoLetivoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          <select value={bimestre} onChange={e => setBimestre(Number(e.target.value) as Bimestre)} aria-label="Bimestre"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs font-bold rounded-xl">
            <option value={1}>1º Bimestre</option>
            <option value={2}>2º Bimestre</option>
            <option value={3}>3º Bimestre</option>
            <option value={4}>4º Bimestre</option>
          </select>
        </div>
      </div>

      <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-[11px] text-rose-700 flex items-center gap-2 font-bold">
        <ShieldAlert size={16} className="shrink-0" />
        <span>
          Informação administrativa sensível — uso interno da equipe pedagógica. Nunca exportar publicamente nem compartilhar fora do SIFEC.
        </span>
      </div>

      {!selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
          Selecione uma escola para carregar a listagem.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={turmaFilter} onChange={e => setTurmaFilter(e.target.value)} aria-label="Filtrar turma"
                className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs font-bold rounded-xl">
                <option value="todas">Todas as turmas</option>
                {turmasDaEscola.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer select-none">
                <input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); setArchiveMessage(''); }}
                  className="accent-brand-orange" />
                Mostrar arquivados
              </label>
            </div>
            {canWrite && isFirebaseMode && (
              <button type="button" onClick={openCreate}
                className="py-1.5 px-3 bg-brand-orange hover:bg-brand-orange/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm">
                <Plus size={14} /> Registrar estudante
              </button>
            )}
          </div>

          {archiveMessage && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-[11px] text-emerald-700 font-bold flex items-center gap-2">
              <Archive size={14} className="shrink-0" />
              <span>{archiveMessage}</span>
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

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wide">
                  <th className="py-2 px-3">Estudante</th>
                  <th className="py-2 px-3">Turma</th>
                  <th className="py-2 px-3">Disciplina</th>
                  <th className="py-2 px-3 text-right">% Acerto</th>
                  <th className="py-2 px-3">Fonte</th>
                  <th className="py-2 px-3">Data de referência</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Observação</th>
                  {canWrite && isFirebaseMode && <th className="py-2 px-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading || turmasLoading ? (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400">Carregando...</td></tr>
                ) : turmasStatus === 'failure' ? (
                  <tr><td colSpan={9} className="py-8 text-center text-rose-500 font-bold">Não foi possível carregar as turmas desta escola.</td></tr>
                ) : visibleItems.length === 0 ? (
                  <tr><td colSpan={9} className="py-8 text-center text-slate-400">Nenhum estudante registrado para este filtro.</td></tr>
                ) : (
                  visibleItems.map(item => (
                    <tr key={item.id} className={item.statusRegistro === 'arquivado' ? 'opacity-60' : ''}>
                      <td className="py-2 px-3 font-bold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span>{item.estudanteNome}</span>
                          {item.statusRegistro === 'arquivado' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 text-[9px] font-bold uppercase">
                              Arquivado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">{item.turmaNome}</td>
                      <td className="py-2 px-3">{item.disciplina}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">{item.percentualAcerto}%</td>
                      <td className="py-2 px-3 text-slate-500">{item.sourceSystem}</td>
                      <td className="py-2 px-3 font-mono text-slate-500">{item.referenceDate}</td>
                      <td className="py-2 px-3 text-slate-600">{item.status}</td>
                      <td className="py-2 px-3 text-slate-500">{item.observacao ?? '—'}</td>
                      {canWrite && isFirebaseMode && (
                        <td className="py-2 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(item)} className="p-1 hover:bg-slate-100 hover:text-blue-700 text-slate-400 rounded-md transition" title="Editar">
                              <Pencil size={12} />
                            </button>
                            {item.statusRegistro !== 'arquivado' && (
                              <button onClick={() => handleArchive(item)} className="p-1 hover:bg-slate-100 hover:text-amber-600 text-slate-400 rounded-md transition" title="Arquivar (nunca exclui — mantém o histórico)">
                                <Archive size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && selectedSchool && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                {editingItem ? 'Editar registro' : 'Registrar estudante'}
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
                <label htmlFor="farol-turma" className="text-[9px] font-black uppercase text-slate-600 block">Turma</label>
                <select id="farol-turma" value={draft.turmaId} onChange={e => setDraft({ ...draft, turmaId: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg font-bold">
                  <option value="">Selecione…</option>
                  {turmasDaEscola.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="farol-disciplina" className="text-[9px] font-black uppercase text-slate-600 block">Disciplina</label>
                <input id="farol-disciplina" type="text" value={draft.disciplina} onChange={e => setDraft({ ...draft, disciplina: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg" />
              </div>
              <div className="space-y-1">
                <label htmlFor="farol-nome" className="text-[9px] font-black uppercase text-slate-600 block">Nome do estudante</label>
                <input id="farol-nome" type="text" value={draft.estudanteNome} onChange={e => setDraft({ ...draft, estudanteNome: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg" />
              </div>
              <div className="space-y-1">
                <label htmlFor="farol-percentual" className="text-[9px] font-black uppercase text-slate-600 block">
                  % de acerto (SISEDU Analytics) — abaixo de {FAROL_ACERTO_LIMITE}%
                </label>
                <input id="farol-percentual" type="number" inputMode="numeric" min={0} max={FAROL_ACERTO_LIMITE - 1}
                  value={draft.percentualAcerto} onChange={e => setDraft({ ...draft, percentualAcerto: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg font-mono" />
              </div>
              <div className="space-y-1">
                <label htmlFor="farol-referencia" className="text-[9px] font-black uppercase text-slate-600 block">Data de referência do relatório SISEDU Analytics</label>
                <input id="farol-referencia" type="date" value={draft.referenceDate} onChange={e => setDraft({ ...draft, referenceDate: e.target.value })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg font-mono" />
                <p className="text-[9px] text-slate-400">
                  Fonte fixa: {FAROL_SOURCE_SYSTEM}. Dado transcrito manualmente — não há sincronização automática com o SISEDU.
                </p>
              </div>
              <div className="space-y-1">
                <label htmlFor="farol-status" className="text-[9px] font-black uppercase text-slate-600 block">Status de acompanhamento</label>
                <select id="farol-status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as FarolStatusAcompanhamento })}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg font-bold">
                  {FAROL_STATUS_ACOMPANHAMENTO.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="farol-observacao" className="text-[9px] font-black uppercase text-slate-600 block">Observação (opcional)</label>
                <textarea id="farol-observacao" value={draft.observacao} onChange={e => setDraft({ ...draft, observacao: e.target.value })} rows={2} maxLength={500}
                  className="w-full p-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-orange text-xs rounded-lg" />
              </div>
              <button type="submit" disabled={saving}
                className="w-full py-2.5 bg-brand-orange hover:bg-brand-orange/90 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Lock size={13} /> {saving ? 'Salvando...' : 'Salvar registro'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
