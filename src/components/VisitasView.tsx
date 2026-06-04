import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, Plus, MapPin, ClipboardCheck, Clock, X, AlertTriangle, Edit, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, addDocument, updateDocument, SEED_SCHOOLS, SEED_VISITAS } from '../lib/firebaseService';
import { hasSchoolWriteAccess } from '../lib/superintendentService';

interface Visita {
  id: string;
  escola: string;
  tecnico: string;
  data: string;
  foco: string;
  status: 'Realizada' | 'Agendada' | 'Cancelada';
}

export default function VisitasView() {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingVisita, setEditingVisita] = useState<Visita | null>(null);

  // Field states
  const [escola, setEscola] = useState('');
  const [tecnico, setTecnico] = useState('Sandra Gomes de Sousa');
  const [data, setData] = useState('');
  const [foco, setFoco] = useState('');
  const [status, setStatus] = useState<'Realizada' | 'Agendada' | 'Cancelada'>('Agendada');
  const [formError, setFormError] = useState('');

  // Watch Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsFirebaseMode(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Sync schools to keep selector list up to date with the 7 schools in all states
  useEffect(() => {
    if (!isFirebaseMode) {
      setSchools(SEED_SCHOOLS);
      if (SEED_SCHOOLS.length > 0 && !escola) {
        setEscola(SEED_SCHOOLS[0].nome);
      }
      return;
    }

    const unsubSchools = subscribeToCollection('schools', (loaded) => {
      const activeSchools = loaded.length > 0 ? loaded : SEED_SCHOOLS;
      setSchools(activeSchools);
      if (activeSchools.length > 0) {
        setEscola(activeSchools[0].nome);
      }
    });

    return () => unsubSchools();
  }, [isFirebaseMode]);

  // Sync Visitas with Firestore or fallback seed
  useEffect(() => {
    if (!isFirebaseMode) {
      setVisitas(SEED_VISITAS as Visita[]);
      return;
    }

    const unsubVisitas = subscribeToCollection('visitas', (loaded) => {
      if (loaded.length > 0) {
        setVisitas(loaded as Visita[]);
      } else {
        setVisitas(SEED_VISITAS as Visita[]);
      }
    });

    return () => unsubVisitas();
  }, [isFirebaseMode]);

  const handleOpenAdd = () => {
    setEditingVisita(null);
    setEscola(schools.length > 0 ? schools[0].nome : 'EEM Diva Cabral');
    setTecnico('Sandra Gomes de Sousa');
    setData('');
    setFoco('');
    setStatus('Agendada');
    setFormError('');
    setShowForm(true);
  };

  const handleOpenEdit = (visita: Visita) => {
    setEditingVisita(visita);
    setEscola(visita.escola);
    setTecnico(visita.tecnico);
    setData(visita.data);
    setFoco(visita.foco);
    setStatus(visita.status);
    setFormError('');
    setShowForm(true);
  };

  const handleSaveVisita = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !foco.trim() || !escola) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!hasSchoolWriteAccess(escola)) {
      setFormError(`Acesso Negado: Você não tem permissão para gerenciar ou agendar visitas para a escola: ${escola}`);
      return;
    }

    if (editingVisita) {
      const updatedVisita: Visita = {
        ...editingVisita,
        escola,
        tecnico,
        data,
        foco,
        status
      };

      if (isFirebaseMode) {
        try {
          await updateDocument('visitas', editingVisita.id, updatedVisita);
        } catch (err: any) {
          setFormError('Erro ao gravar dados: ' + err.message);
          return;
        }
      } else {
        setVisitas(visitas.map(v => v.id === editingVisita.id ? updatedVisita : v));
      }
    } else {
      const newId = `v-${Date.now()}`;
      const newVisita: Visita = {
        id: newId,
        escola,
        tecnico,
        data,
        foco,
        status: 'Agendada'
      };

      if (isFirebaseMode) {
        try {
          await addDocument('visitas', newId, newVisita);
        } catch (err: any) {
          setFormError('Erro ao agendar visita: ' + err.message);
          return;
        }
      } else {
        setVisitas([newVisita, ...visitas]);
      }
    }

    setShowForm(false);
    setEditingVisita(null);
    setData('');
    setFoco('');
    setFormError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - CICLO DE GESTÃO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Calendário de Visitas Técnicas</h2>
          <p className="text-xs text-slate-500 font-normal">Agende, acompanhe e edite as visitas pedagógicas nas unidades escolares da Coordenadoria Regional.</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white rounded-xl text-xs font-bold font-sans transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={16} /> Agendar Visita Pedagógica
        </button>
      </div>

      {/* Stats summaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-turquoise/10 border border-brand-turquoise/20 flex items-center justify-center text-brand-turquoise">
            <Calendar size={18} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Compromissos Agendados</div>
            <div className="text-base font-extrabold text-slate-900">{visitas.filter(v => v.status === 'Agendada').length} Acompanhamentos</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-green/10 border border-brand-green/20 flex items-center justify-center text-brand-green">
            <ClipboardCheck size={18} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Acompanhamentos Realizados</div>
            <div className="text-base font-extrabold text-slate-900">{visitas.filter(v => v.status === 'Realizada').length} Visitas Históricas</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total Planejado</div>
            <div className="text-base font-extrabold text-slate-900">{visitas.length} Planilhas Ativas</div>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-150 flex items-center gap-2 bg-slate-50/50">
          <ShieldCheck className="text-brand-turquoise" size={16} />
          <span className="text-xs font-black text-slate-700 uppercase tracking-wide">Cronograma Técnico Regional</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                <th className="py-3 px-6">Escola Visitada</th>
                <th className="py-3 px-6">Técnico Responsável</th>
                <th className="py-3 px-6">Data Planejada</th>
                <th className="py-3 px-6">Foco de Acompanhamento</th>
                <th className="py-3 px-6 text-center">Status</th>
                <th className="py-3 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {visitas.map((visita) => (
                <tr key={visita.id} className="hover:bg-slate-50/50 transition">
                  <td className="py-3.5 px-6 font-extrabold text-slate-900 text-sm flex items-center gap-1.5 leading-snug">
                    <MapPin size={12} className="text-slate-400 shrink-0" />
                    {visita.escola}
                  </td>
                  <td className="py-3.5 px-6 font-extrabold text-slate-700">{visita.tecnico}</td>
                  <td className="py-3.5 px-6 font-mono text-slate-500">{visita.data}</td>
                  <td className="py-3.5 px-6 text-slate-600 truncate max-w-sm" title={visita.foco}>{visita.foco}</td>
                  <td className="py-3.5 px-6 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      visita.status === 'Realizada'
                        ? 'bg-brand-green/10 border-brand-green/20 text-brand-green'
                        : visita.status === 'Cancelada'
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : 'bg-brand-turquoise/10 border-brand-turquoise/20 text-brand-turquoise'
                    }`}>
                      {visita.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    {hasSchoolWriteAccess(visita.escola) ? (
                      <button
                        onClick={() => handleOpenEdit(visita)}
                        className="p-1.5 hover:bg-slate-100 hover:text-brand-turquoise text-slate-400 rounded-lg transition"
                        title="Editar Visita"
                      >
                        <Edit size={14} className="inline" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md cursor-not-allowed" title="Sem permissão de alteração para este usuário">
                        <Lock size={10} className="text-amber-500" />
                        Restrito
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl relative">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {editingVisita ? 'Editar Visita Pedagógica' : 'Agendar Relatório / Visita'}
                </h3>
                <p className="text-[10px] text-slate-500">Defina o foco e designe o técnico da CREDE.</p>
              </div>
              <button onClick={() => { setShowForm(false); setEditingVisita(null); setFormError(''); }} className="text-slate-400 hover:text-slate-600 transition">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveVisita} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-220 text-rose-700 rounded-xl text-xs font-bold leading-normal flex items-start gap-1.5">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Unidade Escolar *</label>
                <select
                  value={escola}
                  onChange={(e) => setEscola(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs rounded-xl font-bold text-slate-800"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.nome}>{s.nome}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Técnico Coordenador de Visitas *</label>
                <select
                  value={tecnico}
                  onChange={(e) => setTecnico(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs rounded-xl font-bold text-slate-800"
                >
                  <option value="Sandra Gomes de Sousa">Sandra Gomes de Sousa</option>
                  <option value="Rogério de Castro Santos">Rogério de Castro Santos</option>
                  <option value="Augusto César Albuquerque">Augusto César Albuquerque</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Data de Visitação *</label>
                  <input
                    type="date"
                    required
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs font-mono rounded-xl font-bold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Status *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs rounded-xl font-bold text-slate-800"
                  >
                    <option value="Agendada">Agendada</option>
                    <option value="Realizada">Realizada</option>
                    <option value="Cancelada">Cancelada</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Foco Pedagógico / Instruções *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ex: Auditoria das metas do IDEB e análise de prontuários de recomposição."
                  value={foco}
                  onChange={(e) => setFoco(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs rounded-xl leading-relaxed text-slate-800"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingVisita(null); }}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold text-xs uppercase rounded-xl transition shadow-sm"
                >
                  {editingVisita ? 'Salvar Alterações' : 'Agendar Visita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
