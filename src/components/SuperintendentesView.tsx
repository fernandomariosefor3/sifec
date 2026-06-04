import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, Check, Search, MapPin, GraduationCap, X, CheckSquare, Square, UserCheck, Play, UserPlus } from 'lucide-react';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import { 
  Superintendent, 
  getSuperintendents, 
  saveSuperintendents, 
  getActiveSuperintendentId, 
  setActiveSuperintendentId 
} from '../lib/superintendentService';

export default function SuperintendentesView() {
  const [superintendents, setSuperintendents] = useState<Superintendent[]>([]);
  const [activeId, setActiveId] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSuper, setEditingSuper] = useState<Superintendent | null>(null);

  // Form states
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [formError, setFormError] = useState('');

  // Loaded schools
  const allSchools = SEED_SCHOOLS;

  useEffect(() => {
    setSuperintendents(getSuperintendents());
    setActiveId(getActiveSuperintendentId());

    const handleSuperChange = () => {
      setSuperintendents(getSuperintendents());
      setActiveId(getActiveSuperintendentId());
    };

    window.addEventListener('sefor3_superintendents_change', handleSuperChange);
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    
    return () => {
      window.removeEventListener('sefor3_superintendents_change', handleSuperChange);
      window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
    };
  }, []);

  const handleActivate = (id: string) => {
    setActiveSuperintendentId(id);
    setActiveId(id);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) {
      setFormError('Por favor, informe no mínimo o nome e o e-mail de acesso do superintendente.');
      return;
    }

    if (editingSuper) {
      const updatedList = superintendents.map(s => {
        if (s.id === editingSuper.id) {
          return {
            ...s,
            nome: nome.trim(),
            cargo: cargo.trim() || 'Superintendente Regional',
            email: email.trim().toLowerCase(),
            escolas: selectedSchools
          };
        }
        return s;
      });
      saveSuperintendents(updatedList);
    } else {
      const id = nome.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-');
      
      const newSuper: Superintendent = {
        id,
        nome: nome.trim(),
        cargo: cargo.trim() || 'Superintendente Regional',
        email: email.trim().toLowerCase(),
        escolas: selectedSchools
      };
      saveSuperintendents([...superintendents, newSuper]);
    }

    setShowAddForm(false);
    setEditingSuper(null);
    resetForm();
  };

  const handleOpenEdit = (superintendent: Superintendent) => {
    setEditingSuper(superintendent);
    setNome(superintendent.nome);
    setCargo(superintendent.cargo);
    setEmail(superintendent.email || '');
    setSelectedSchools(superintendent.escolas);
    setShowAddForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza de que deseja remover este superintendente?')) {
      const filtered = superintendents.filter(s => s.id !== id);
      saveSuperintendents(filtered);
      if (activeId === id) {
        setActiveSuperintendentId('all');
      }
    }
  };

  const resetForm = () => {
    setNome('');
    setCargo('');
    setEmail('');
    setSelectedSchools([]);
    setSchoolSearch('');
    setFormError('');
  };

  const toggleSchool = (schoolName: string) => {
    if (selectedSchools.includes(schoolName)) {
      setSelectedSchools(selectedSchools.filter(name => name !== schoolName));
    } else {
      setSelectedSchools([...selectedSchools, schoolName]);
    }
  };

  const toggleAllFilteredSchools = (filteredNames: string[]) => {
    const allAreChecked = filteredNames.every(name => selectedSchools.includes(name));
    if (allAreChecked) {
      setSelectedSchools(selectedSchools.filter(name => !filteredNames.includes(name)));
    } else {
      const newSelections = [...selectedSchools];
      filteredNames.forEach(name => {
        if (!newSelections.includes(name)) {
          newSelections.push(name);
        }
      });
      setSelectedSchools(newSelections);
    }
  };

  const filteredSchoolsForSelection = allSchools.filter(school =>
    school.nome.toLowerCase().includes(schoolSearch.toLowerCase()) ||
    school.codInep.includes(schoolSearch)
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - GESTÃO DE ACESSO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Painel de Superintendentes</h2>
          <p className="text-xs text-slate-500 font-normal">Cadastre novos superintendentes e distribua as escolas de regulação para monitoramento particularizado.</p>
        </div>
        <button
          onClick={() => {
            setEditingSuper(null);
            resetForm();
            setShowAddForm(true);
          }}
          className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white rounded-xl text-xs font-bold font-sans transition flex items-center gap-1.5 shadow-sm"
        >
          <UserPlus size={16} /> Cadastrar Superintendente
        </button>
      </div>

      {/* Feedback message bar for end of year edits flexibility */}
      <div className="p-4 bg-teal-50 border border-teal-220 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-xs font-medium text-teal-850">
        <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-base">
          📅
        </div>
        <div>
          <span className="text-[10px] uppercase font-black tracking-widest text-teal-700 font-mono block">Edição Desbloqueada para Todos</span>
          <p className="text-xs font-semibold text-teal-900 mt-0.5 leading-normal">
            As abas estão totalmente editáveis em todas as seções até o final do ano para facilitar o preenchimento!
          </p>
        </div>
      </div>

      {/* Active Filter Bar Summary */}
      <div className="p-4 bg-brand-green/10 border border-brand-green/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-green text-white flex items-center justify-center border border-brand-green-dark shrink-0 shadow-sm">
            <UserCheck size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-brand-green font-mono">Espaço de Trabalho Ativo Atualmente</span>
            <div className="text-sm font-extrabold text-slate-900 leading-tight">
              {superintendents.find(s => s.id === (activeId === 'all' ? (superintendents[0]?.id || '') : activeId))?.nome || 'Selecione um Superintendente'} (Apenas escolas vinculadas no cadastro)
            </div>
          </div>
        </div>
      </div>

      {/* Superintendents List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Dynamic superintendent cards */}
        {superintendents.map(superintendent => {
          const isMe = superintendent.id === 'fernando-mario';
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
              <div className="flex justify-between items-start cursor-pointer" onClick={() => handleActivate(superintendent.id)}>
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
                <div className="flex gap-2 items-center">
                  {isSelected && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase text-brand-turquoise bg-brand-turquoise/10 border border-brand-turquoise/20">
                      Ativo
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-end mt-4">
                <div className="cursor-pointer" onClick={() => handleActivate(superintendent.id)}>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Escolas Vinculadas</span>
                  <span className="text-xl font-black text-slate-900">{superintendent.escolas.length}</span>
                  <span className="text-[11px] text-slate-500 ml-1.5 font-sans font-normal">unidades próprias</span>
                </div>
                
                {/* Actions */}
                <div className="flex gap-1">
                  <button
                    onClick={() => handleOpenEdit(superintendent)}
                    className="p-1.5 text-slate-400 hover:text-brand-turquoise hover:bg-slate-100 rounded-lg transition"
                    title="Editar escola vinculadas"
                  >
                    <Edit size={14} />
                  </button>
                  {!isMe && (
                    <button
                      onClick={() => handleDelete(superintendent.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Deletar Superintendente"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Manager Modal Overlay */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {editingSuper ? 'Editar Perfil Superintendente' : 'Cadastrar Novo Superintendente'}
                </h3>
                <p className="text-[10px] text-slate-500 font-normal">Atribua dados e associe de forma customizada quais as escolas reguladas por ele.</p>
              </div>
              <button onClick={() => { setShowAddForm(false); setEditingSuper(null); resetForm(); }} className="text-slate-400 hover:text-slate-650 transition">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-220 text-rose-700 text-xs rounded-xl font-bold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Nome do Superintendente *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Fernando Mário Martins"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Cargo ou Divisão de Foco</label>
                  <input
                    type="text"
                    placeholder="Ex: Coordenação Geral Sefor 3"
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">E-mail de Acesso (Google / Seduc) *</label>
                  <input
                    type="email"
                    required
                    placeholder="Ex: fernandomariodasmartins@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                  />
                </div>
              </div>

              {/* Schools Checklist Block */}
              <div className="flex-1 flex flex-col border border-slate-200 rounded-2xl min-h-[250px] overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
                  <span className="text-xs font-bold text-slate-800">
                    Escolas Vinculadas: <span className="font-extrabold text-brand-turquoise">{selectedSchools.length} selecionadas</span> das 56
                  </span>
                  
                  {/* Select Search Filter */}
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Pesquisar escola do checklist..."
                      value={schoolSearch}
                      onChange={(e) => setSchoolSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-250/90 focus:border-brand-turquoise focus:outline-none text-[11px] rounded-lg"
                    />
                    <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
                  </div>
                </div>

                {/* Checklist select tools */}
                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/40 text-[11px] font-bold text-slate-500 flex justify-between shrink-0">
                  <span>Listando {filteredSchoolsForSelection.length} escolas correspondentes</span>
                  <button
                    type="button"
                    onClick={() => toggleAllFilteredSchools(filteredSchoolsForSelection.map(s => s.nome))}
                    className="text-brand-turquoise hover:underline hover:text-brand-turquoise-dark"
                  >
                    Marcar/Desmarcar Todas Filtradas
                  </button>
                </div>

                {/* Checklist checkboxes layout */}
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white/50">
                  {filteredSchoolsForSelection.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-slate-400 text-xs font-normal">
                      Nenhuma escola foi encontrada para o filtro de pesquisa informado.
                    </div>
                  ) : (
                    filteredSchoolsForSelection.map(school => {
                      const isChecked = selectedSchools.includes(school.nome);
                      return (
                        <div 
                          key={school.id}
                          onClick={() => toggleSchool(school.nome)}
                          className={`flex items-center gap-3 p-2 border rounded-xl cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition ${
                            isChecked ? 'bg-brand-turquoise/5 border-brand-turquoise/25 text-slate-900 font-semibold' : 'border-slate-150 text-slate-600'
                          }`}
                        >
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

              {/* Submit trigger button */}
              <button
                type="submit"
                className="w-full shrink-0 py-3 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold text-xs uppercase cursor-pointer tracking-wider rounded-xl shadow-lg mt-2 transition"
              >
                {editingSuper ? 'Salvar Configurações do Superintendente' : 'Cadastrar e Salvar Superintendente'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
