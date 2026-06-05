import React, { useState, useEffect } from 'react';
import { Users, Edit, Trash2, Search, X, CheckSquare, Square, UserCheck, UserPlus, ShieldAlert } from 'lucide-react';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import { auth } from '../lib/firebase';
import {
  Superintendent,
  ADMIN_EMAIL,
  getSuperintendents,
  saveSuperintendents,
  getActiveSuperintendentId,
  setActiveSuperintendentId,
  saveSuperintendentToFirestore,
  deleteSuperintendentFromFirestore
} from '../lib/superintendentService';

export default function SuperintendentesView() {
  const [superintendents, setSuperintendents] = useState<Superintendent[]>([]);
  const [activeId, setActiveId] = useState('all');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSuper, setEditingSuper] = useState<Superintendent | null>(null);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [formError, setFormError] = useState('');

  const allSchools = SEED_SCHOOLS;

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      setIsAdminUser(user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    setSuperintendents(getSuperintendents());
    setActiveId(getActiveSuperintendentId());

    const handleChange = () => {
      setSuperintendents(getSuperintendents());
      setActiveId(getActiveSuperintendentId());
    };

    window.addEventListener('sefor3_superintendents_change', handleChange);
    window.addEventListener('sefor3_active_superintendent_change', handleChange);
    return () => {
      window.removeEventListener('sefor3_superintendents_change', handleChange);
      window.removeEventListener('sefor3_active_superintendent_change', handleChange);
    };
  }, []);

  const handleActivate = (id: string) => {
    if (!isAdminUser) return;
    setActiveSuperintendentId(id);
    setActiveId(id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) {
      setFormError('Por favor, informe no mínimo o nome e o e-mail de acesso.');
      return;
    }
    setSaving(true);
    setFormError('');

    try {
      let updatedList: Superintendent[];

      if (editingSuper) {
        const updated: Superintendent = {
          ...editingSuper,
          nome: nome.trim(),
          cargo: cargo.trim() || 'Superintendente Regional',
          email: email.trim().toLowerCase(),
          escolas: selectedSchools
        };
        await saveSuperintendentToFirestore(updated);
        updatedList = superintendents.map(s => s.id === editingSuper.id ? updated : s);
      } else {
        const id = nome.toLowerCase()
                    .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        const newSuper: Superintendent = {
          id,
          nome: nome.trim(),
          cargo: cargo.trim() || 'Superintendente Regional',
          email: email.trim().toLowerCase(),
          escolas: selectedSchools
        };
        await saveSuperintendentToFirestore(newSuper);
        updatedList = [...superintendents, newSuper];
      }

      saveSuperintendents(updatedList);
      setShowAddForm(false);
      setEditingSuper(null);
      resetForm();
    } catch {
      setFormError('Erro ao salvar no Firebase. Verifique sua conexão e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (superintendent: Superintendent) => {
    setEditingSuper(superintendent);
    setNome(superintendent.nome);
    setCargo(superintendent.cargo);
    setEmail(superintendent.email || '');
    setSelectedSchools(superintendent.escolas);
    setShowAddForm(true);
  };

  const handleDelete = async (s: Superintendent) => {
    if (!confirm(`Remover ${s.nome}? O registro também será apagado do Firebase.`)) return;
    try {
      await deleteSuperintendentFromFirestore(s.email);
      const filtered = superintendents.filter(x => x.id !== s.id);
      saveSuperintendents(filtered);
      if (activeId === s.id) setActiveSuperintendentId('all');
    } catch {
      alert('Erro ao remover. Verifique sua conexão.');
    }
  };

  const resetForm = () => {
    setNome(''); setCargo(''); setEmail('');
    setSelectedSchools([]); setSchoolSearch(''); setFormError('');
  };

  const toggleSchool = (schoolName: string) => {
    setSelectedSchools(prev =>
      prev.includes(schoolName) ? prev.filter(n => n !== schoolName) : [...prev, schoolName]
    );
  };

  const toggleAllFiltered = (names: string[]) => {
    const allChecked = names.every(n => selectedSchools.includes(n));
    setSelectedSchools(prev =>
      allChecked ? prev.filter(n => !names.includes(n)) : [...new Set([...prev, ...names])]
    );
  };

  const filteredForSelection = allSchools.filter(s =>
    s.nome.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    s.codInep.includes(schoolSearch)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - GESTÃO DE ACESSO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Painel de Superintendentes</h2>
          <p className="text-xs text-slate-500 font-normal">Cada superintendente acessa apenas as escolas atribuídas pelo administrador.</p>
        </div>
        {isAdminUser && (
          <button
            onClick={() => { setEditingSuper(null); resetForm(); setShowAddForm(true); }}
            className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white rounded-xl text-xs font-bold font-sans transition flex items-center gap-1.5 shadow-sm"
          >
            <UserPlus size={16} /> Cadastrar Superintendente
          </button>
        )}
      </div>

      {!isAdminUser && auth.currentUser && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-xs text-amber-800">
          <ShieldAlert size={18} className="text-amber-600 shrink-0" />
          <span className="font-semibold">Acesso restrito — você visualiza apenas seu perfil. O administrador gerencia cadastros e atribuições de escolas.</span>
        </div>
      )}

      <div className="p-4 bg-brand-green/10 border border-brand-green/20 rounded-2xl flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-green text-white flex items-center justify-center border border-brand-green-dark shrink-0 shadow-sm">
          <UserCheck size={18} />
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-brand-green font-mono">Espaço de Trabalho Ativo</span>
          <div className="text-sm font-extrabold text-slate-900 leading-tight">
            {superintendents.find(s => s.id === activeId)?.nome || 'Nenhum selecionado'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {superintendents.map(superintendent => {
          const isMe = superintendent.email?.toLowerCase() === auth.currentUser?.email?.toLowerCase();
          const isSelected = activeId === superintendent.id;

          return (
            <div
              key={superintendent.id}
              className={`border p-5 rounded-2xl flex flex-col justify-between h-44 transition group relative ${
                isSelected
                  ? 'bg-brand-turquoise/5 border-brand-turquoise ring-2 ring-brand-turquoise/10'
                  : 'bg-white border-slate-200 hover:bg-slate-50/60 hover:border-slate-350'
              }`}
            >
              <div
                className={`flex justify-between items-start ${isAdminUser ? 'cursor-pointer' : ''}`}
                onClick={() => isAdminUser && handleActivate(superintendent.id)}
              >
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-brand-turquoise truncate max-w-[130px]" title={superintendent.nome}>
                        {superintendent.nome}
                      </h4>
                      {isMe && (
                        <span className="text-[9px] font-black text-brand-green bg-brand-green/10 px-1 py-0.5 rounded border border-brand-green/20">VOCÊ</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-505 truncate max-w-[150px]">{superintendent.cargo}</p>
                    {superintendent.email && (
                      <p className="text-[10px] font-mono text-slate-400 truncate max-w-[150px] mt-0.5" title={superintendent.email}>
                        {superintendent.email}
                      </p>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase text-brand-turquoise bg-brand-turquoise/10 border border-brand-turquoise/20">
                    Ativo
                  </span>
                )}
              </div>

              <div className="flex justify-between items-end mt-4">
                <div
                  className={isAdminUser ? 'cursor-pointer' : ''}
                  onClick={() => isAdminUser && handleActivate(superintendent.id)}
                >
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Escolas Vinculadas</span>
                  <span className="text-xl font-black text-slate-900">{superintendent.escolas.length}</span>
                  <span className="text-[11px] text-slate-500 ml-1.5 font-sans font-normal">unidades próprias</span>
                </div>

                {isAdminUser && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenEdit(superintendent)}
                      className="p-1.5 text-slate-400 hover:text-brand-turquoise hover:bg-slate-100 rounded-lg transition"
                      title="Editar escolas vinculadas"
                    >
                      <Edit size={14} />
                    </button>
                    {superintendent.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase() && (
                      <button
                        onClick={() => handleDelete(superintendent)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Remover superintendente"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAddForm && isAdminUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {editingSuper ? 'Editar Perfil Superintendente' : 'Cadastrar Novo Superintendente'}
                </h3>
                <p className="text-[10px] text-slate-500 font-normal">O e-mail deve ser o Google do superintendente — é usado para autenticação.</p>
              </div>
              <button onClick={() => { setShowAddForm(false); setEditingSuper(null); resetForm(); }} className="text-slate-400 hover:text-slate-650 transition">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-220 text-rose-700 text-xs rounded-xl font-bold">{formError}</div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Nome *</label>
                  <input type="text" required placeholder="Ex: Fernando Mário Martins" value={nome}
                    onChange={e => setNome(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Cargo</label>
                  <input type="text" placeholder="Ex: Coordenação Geral" value={cargo}
                    onChange={e => setCargo(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">E-mail Google *</label>
                  <input type="email" required placeholder="Ex: nome@gmail.com" value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl" />
                </div>
              </div>

              <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl min-h-[250px] overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
                  <span className="text-xs font-bold text-slate-800">
                    Escolas Vinculadas: <span className="font-extrabold text-brand-turquoise">{selectedSchools.length} selecionadas</span> das {allSchools.length}
                  </span>
                  <div className="relative w-full sm:w-64">
                    <input type="text" placeholder="Pesquisar escola..." value={schoolSearch}
                      onChange={e => setSchoolSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-250/90 focus:border-brand-turquoise focus:outline-none text-[11px] rounded-lg" />
                    <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                  </div>
                </div>

                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/40 text-[11px] font-bold text-slate-500 flex justify-between shrink-0">
                  <span>Listando {filteredForSelection.length} escolas</span>
                  <button type="button" onClick={() => toggleAllFiltered(filteredForSelection.map(s => s.nome))}
                    className="text-brand-turquoise hover:underline hover:text-brand-turquoise-dark">
                    Marcar/Desmarcar Filtradas
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/50">
                  {filteredForSelection.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-slate-400 text-xs">Nenhuma escola encontrada.</div>
                  ) : (
                    filteredForSelection.map(school => {
                      const isChecked = selectedSchools.includes(school.nome);
                      return (
                        <div key={school.id} onClick={() => toggleSchool(school.nome)}
                          className={`flex items-center gap-3 p-2 border rounded-xl cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition ${
                            isChecked ? 'bg-brand-turquoise/5 border-brand-turquoise/25 text-slate-900 font-semibold' : 'border-slate-150 text-slate-600'
                          }`}>
                          <div className={isChecked ? 'text-brand-turquoise' : 'text-slate-300'}>
                            {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs truncate block">{school.nome}</span>
                            <span className="text-[9px] font-mono font-bold text-slate-400">INEP: {school.codInep}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <button type="submit" disabled={saving}
                className="w-full shrink-0 py-3 bg-brand-turquoise hover:bg-brand-turquoise-dark disabled:opacity-60 text-white font-extrabold text-xs uppercase cursor-pointer tracking-wider rounded-xl shadow-lg mt-2 transition">
                {saving ? 'Salvando...' : editingSuper ? 'Salvar Configurações' : 'Cadastrar Superintendente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
