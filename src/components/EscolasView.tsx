import React, { useState, useEffect } from 'react';
import { GraduationCap, PlusCircle, Search, MapPin, BarChart2, Plus, X, Edit, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, addDocument, updateDocument, SEED_SCHOOLS } from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId, hasSchoolWriteAccess, addSchoolToLoggedInSuperintendent } from '../lib/superintendentService';

interface School {
  id: string;
  nome: string;
  codInep: string;
  cidade: string;
  matriculas: number;
  idebMedio: number;
  metaIdeb: number;
  status: 'Ativo' | 'Pendente' | 'Inativo';
}

export default function EscolasView() {
  const [schools, setSchools] = useState<School[]>(SEED_SCHOOLS as any);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('Todas');
  const [showAddForm, setShowAddForm] = useState(false);
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);

  // Form states with strict scheme validations
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [nome, setNome] = useState('');
  const [codInep, setCodInep] = useState('');
  const [cidade, setCidade] = useState('Fortaleza');
  const [matriculas, setMatriculas] = useState('');
  const [idebMedio, setIdebMedio] = useState('');
  const [metaIdeb, setMetaIdeb] = useState('');
  const [formError, setFormError] = useState('');

  // Cities represented in SEFOR 3 (Fortaleza)
  const cities = ['Todas', 'Fortaleza'];

  // Monitor Auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsFirebaseMode(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Monitor Superintendent changes
  useEffect(() => {
    const handleSuperChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    setActiveSuperId(getActiveSuperintendentId());
    return () => window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
  }, []);

  // Subscribe to dynamic Firebase updates
  useEffect(() => {
    if (!isFirebaseMode) {
      setSchools(SEED_SCHOOLS as any);
      return;
    }

    const unsubSchools = subscribeToCollection('schools', (loaded) => {
      if (loaded.length > 0) {
        setSchools(loaded as any);
      }
    });

    return () => unsubSchools();
  }, [isFirebaseMode]);

  // Verification & Submission
  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !codInep.trim() || !matriculas || !idebMedio || !metaIdeb) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    // Fire rule check replica (codInep must be exactly 8 characters)
    if (codInep.length !== 8) {
      setFormError('Erro de Validação de Regra: O código INEP de Ceará precisa ter exatamente 8 dígitos decimais.');
      return;
    }

    if (editingSchool) {
      if (!hasSchoolWriteAccess(editingSchool.nome)) {
        setFormError('Acesso Negado: Você não tem permissão para editar os dados desta escola.');
        return;
      }

      const updatedSchool: School = {
        ...editingSchool,
        nome,
        codInep,
        cidade,
        matriculas: parseInt(matriculas),
        idebMedio: parseFloat(idebMedio),
        metaIdeb: parseFloat(metaIdeb)
      };

      if (isFirebaseMode) {
        try {
          await updateDocument('schools', editingSchool.id, updatedSchool);
        } catch (err: any) {
          setFormError('Erro ao salvar no Firebase: ' + err.message);
          return;
        }
      } else {
        setSchools(schools.map(s => s.id === editingSchool.id ? updatedSchool : s));
      }
    } else {
      // If logged in, automatically assign newly created school to this user
      addSchoolToLoggedInSuperintendent(nome);

      const generatedId = nome.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-');

      const newSchool: School = {
        id: isFirebaseMode ? generatedId : (schools.length + 1).toString(),
        nome,
        codInep,
        cidade,
        matriculas: parseInt(matriculas),
        idebMedio: parseFloat(idebMedio),
        metaIdeb: parseFloat(metaIdeb),
        status: 'Ativo'
      };

      if (isFirebaseMode) {
        try {
          await addDocument('schools', generatedId, newSchool);
        } catch (err: any) {
          setFormError('Erro ao gravar dados no Firebase: ' + err.message);
          return;
        }
      } else {
        setSchools([newSchool, ...schools]);
      }
    }
    
    setShowAddForm(false);
    setEditingSchool(null);
    
    // Reset Form
    setNome('');
    setCodInep('');
    setCidade('Fortaleza');
    setMatriculas('');
    setIdebMedio('');
    setMetaIdeb('');
    setFormError('');
  };

  const handleOpenEdit = (school: School) => {
    setEditingSchool(school);
    setNome(school.nome);
    setCodInep(school.codInep);
    setCidade(school.cidade);
    setMatriculas(school.matriculas.toString());
    setIdebMedio(school.idebMedio.toString());
    setMetaIdeb(school.metaIdeb.toString());
    setShowAddForm(true);
  };

  const filteredSchools = schools.filter(school => {
    if (!isSchoolVisible(school.nome)) return false;
    const matchesSearch = school.nome.toLowerCase().includes(search.toLowerCase()) || 
                          school.codInep.includes(search);
    const matchesCity = cityFilter === 'Todas' || school.cidade === cityFilter;
    return matchesSearch && matchesCity;
  });

  return (
    <div className="space-y-6">
      {/* Page header with subtitle and trigger */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-emerald-700 tracking-wider uppercase font-black font-mono">SEFOR 3 - GESTÃO ESCOLAR</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Escolas da Coordenadoria Regional</h2>
          <p className="text-xs text-slate-500 font-normal">Controle cadastral, matrículas ativas e monitoramento de desempenho do IDEB.</p>
        </div>
        <button
          onClick={() => {
            setEditingSchool(null);
            setNome('');
            setCodInep('');
            setCidade('Fortaleza');
            setMatriculas('');
            setIdebMedio('');
            setMetaIdeb('');
            setShowAddForm(true);
          }}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold font-sans transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={16} /> Cadastrar Nova Escola
        </button>
      </div>

      {/* Grid summarizing core regional school markers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-turquoise/10 border border-brand-turquoise/20 text-brand-turquoise flex items-center justify-center shrink-0">
            <GraduationCap size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total de Unidades</div>
            <div className="text-lg font-extrabold text-slate-900">{schools.length} Escolas</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-green/10 border border-brand-green/20 text-brand-green flex items-center justify-center shrink-0">
            <BarChart2 size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total de Matrículas</div>
            <div className="text-lg font-extrabold text-slate-900">
              {schools.reduce((sum, s) => sum + s.matriculas, 0).toLocaleString()} Alunos
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-orange/10 border border-brand-orange/20 text-brand-orange flex items-center justify-center shrink-0">
            <MapPin size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Cidades Cooperantes</div>
            <div className="text-lg font-extrabold text-slate-900">{cities.length - 1} Cidade</div>
          </div>
        </div>
      </div>

      {/* Filters and search box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar por escola ou código INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-xl"
          />
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        </div>

        {/* City Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-bold">Filtrar Cidade:</span>
          <div className="flex gap-1.5 p-1 bg-slate-50 border border-slate-150 rounded-xl">
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => setCityFilter(city)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  cityFilter === city
                    ? 'bg-brand-turquoise text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-850'
                }`}
              >
                {city}
              </button>
            ))}
          </div>
        </div>
      </div>

       {/* Schools List Render */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3.5 px-6">Código INEP</th>
                <th className="py-3.5 px-6">Nome da Unidade Escolar</th>
                <th className="py-3.5 px-6">Sede / Cidade</th>
                <th className="py-3.5 px-6 text-right">Alunos Regulados</th>
                <th className="py-3.5 px-6 text-center">IDEB Médio</th>
                <th className="py-3.5 px-6 text-center">Meta IDEB</th>
                <th className="py-3.5 px-6 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {filteredSchools.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-normal">
                    Nenhuma escola corresponde aos critérios de pesquisa informados.
                  </td>
                </tr>
              ) : (
                filteredSchools.map((school) => (
                  <tr key={school.id} className="hover:bg-slate-55/40 transition">
                    <td className="py-4 px-6 font-mono text-slate-500 text-[11px] font-bold">{school.codInep}</td>
                    <td className="py-4 px-6 font-extrabold text-slate-900 text-sm">{school.nome}</td>
                    <td className="py-4 px-6">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-slate-400" />
                        {school.cidade}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{school.matriculas}</td>
                    <td className="py-4 px-6 text-center">
                      <span className="font-extrabold text-brand-turquoise font-mono text-xs">{school.idebMedio.toFixed(1)}</span>
                    </td>
                    <td className="py-4 px-6 text-center font-mono font-bold text-slate-500">{school.metaIdeb.toFixed(1)}</td>
                    <td className="py-4 px-6 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        school.status === 'Ativo'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {school.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {hasSchoolWriteAccess(school.nome) ? (
                        <button
                          onClick={() => handleOpenEdit(school)}
                          className="p-1.5 hover:bg-slate-100 hover:text-blue-750 text-slate-400 rounded-lg transition"
                          title="Editar Escola"
                        >
                          <Edit size={14} />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md" title="Sem permissão de edição para este usuário">
                          <Lock size={10} className="text-amber-500" />
                          Restrito
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add School Modal Overlay */}
      {showAddForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {editingSchool ? 'Editar Escola Regional' : 'Cadastrar Escola Regional'}
                </h3>
                <p className="text-[10px] text-slate-500 font-normal">Preencha os indicadores de acordo com o Censo Seduc.</p>
              </div>
              <button onClick={() => { setShowAddForm(false); setEditingSchool(null); setFormError(''); }} className="text-slate-400 hover:text-slate-650 transition">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSchool} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold flex items-start gap-1.5 leading-snug">
                  <span className="shrink-0 font-extrabold uppercase">Erro:</span>
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Nome da Unidade Escolar *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: EEMTI Cinderela de Nazaré"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Código INEP (8 dígitos) *</label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="Ex: 23075841"
                    value={codInep}
                    onChange={(e) => setCodInep(e.target.value.replace(/\D/g, ''))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs font-mono rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Sede da Regional / Cidade *</label>
                  <select
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                  >
                    {cities.filter(c => c !== 'Todas').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Matrículas *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="Ex: 450"
                    value={matriculas}
                    onChange={(e) => setMatriculas(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">IDEB Atual *</label>
                  <input
                    type="number"
                    required
                    step={0.1}
                    min={0}
                    max={10}
                    placeholder="Ex: 5.8"
                    value={idebMedio}
                    onChange={(e) => setIdebMedio(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs font-mono rounded-xl"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Meta IDEB *</label>
                  <input
                    type="number"
                    required
                    step={0.1}
                    min={0}
                    max={10}
                    placeholder="Ex: 6.0"
                    value={metaIdeb}
                    onChange={(e) => setMetaIdeb(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs font-mono rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase cursor-pointer tracking-wider rounded-xl shadow-lg mt-3 transition"
              >
                {editingSchool ? 'Salvar Alterações da Escola' : 'Salvar Unidade no Sistema'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
