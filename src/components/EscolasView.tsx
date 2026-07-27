import React, { useState, useEffect } from 'react';
import { GraduationCap, PlusCircle, Search, MapPin, BarChart2, Plus, X } from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, addDocument, updateDocument, SEED_SCHOOLS } from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId, addSchoolToLoggedInSuperintendent, isCurrentUserAdmin } from '../lib/superintendentService';
import { useSchoolEnrollmentSummaries } from '../hooks/useSchoolEnrollmentSummaries';
import SchoolEnrollmentPanel from './SchoolEnrollmentPanel';
import SchoolsTable from './SchoolsTable';

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
  const [panelSchool, setPanelSchool] = useState<School | null>(null);

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

  // Monitor Superintendent (and admin portfolio/global scope) changes
  useEffect(() => {
    const handleSuperChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    window.addEventListener('sefor3_admin_scope_change', handleSuperChange);
    setActiveSuperId(getActiveSuperintendentId());
    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
      window.removeEventListener('sefor3_admin_scope_change', handleSuperChange);
    };
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
    setFormError('');
    if (!nome.trim() || !codInep.trim() || !matriculas || !idebMedio || !metaIdeb) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    // Fire rule check replica (codInep must be exactly 8 characters)
    if (codInep.length !== 8) {
      setFormError('Erro de Validação de Regra: O código INEP de Ceará precisa ter exatamente 8 dígitos decimais.');
      return;
    }

    // Cadastro mestre (criar e editar escola) é restrito a administrador —
    // superintendente comum usa "Acompanhar matrículas", nunca este
    // formulário (revisão final PR #8, seção 4).
    if (!isCurrentUserAdmin()) {
      setFormError('Acesso Negado: somente administradores podem cadastrar ou editar o registro mestre de uma escola.');
      return;
    }

    if (editingSchool) {
      // nome/codInep são imutáveis por update comum (ver firestore.rules) —
      // sempre reenvia os valores originais do registro, nunca o que está
      // no formulário (os campos ficam desabilitados na interface, mas
      // isto garante que a regra nunca rejeite a edição dos indicadores
      // por uma divergência acidental).
      const updatedSchool: School = {
        ...editingSchool,
        nome: editingSchool.nome,
        codInep: editingSchool.codInep,
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
      // Duplicidade de codInep entre as escolas j\u00e1 carregadas \u2014 checado
      // antes de gravar, nunca depois (revis\u00e3o final PR #8, se\u00e7\u00e3o 4).
      if (schools.some(s => s.codInep === codInep)) {
        setFormError('J\u00e1 existe uma escola cadastrada com este c\u00f3digo INEP.');
        return;
      }

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
      // S\u00f3 depois da cria\u00e7\u00e3o bem-sucedida (Firestore, ou estado local em
      // modo demonstra\u00e7\u00e3o) \u2014 nunca antes, sen\u00e3o a carteira local aponta
      // para uma escola que pode n\u00e3o ter sido gravada de verdade.
      addSchoolToLoggedInSuperintendent(nome);
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

  // Scope-only filter (active superintendent + admin portfolio/global toggle)
  // powers the header indicators; search/city narrow it further for the table.
  const visibleSchools = schools.filter(school => isSchoolVisible(school.nome));
  const filteredSchools = visibleSchools.filter(school => {
    const matchesSearch = school.nome.toLowerCase().includes(search.toLowerCase()) ||
                          school.codInep.includes(search);
    const matchesCity = cityFilter === 'Todas' || school.cidade === cityFilter;
    return matchesSearch && matchesCity;
  });

  // Fase 2A — matrícula inicial/atual, turmas ativas, média por turma e
  // entradas/saídas acumuladas, buscados por escola (nunca a coleção
  // inteira sem filtro — ver useSchoolEnrollmentSummaries).
  const { summaries, summariesLoading, summaryErrors, turmas: turmasFase2A, refresh: refreshEnrollmentSummaries } = useSchoolEnrollmentSummaries(filteredSchools, isFirebaseMode);

  return (
    <div className="space-y-6">
      {/* Page header with subtitle and trigger */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-emerald-700 tracking-wider uppercase font-black font-mono">SEFOR 3 - GESTÃO ESCOLAR</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Escolas da Coordenadoria Regional</h2>
          <p className="text-xs text-slate-500 font-normal">Controle cadastral, matrículas ativas e monitoramento de desempenho do IDEB.</p>
        </div>
        {isCurrentUserAdmin() && (
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
        )}
      </div>

      {/* Grid summarizing core regional school markers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-turquoise/10 border border-brand-turquoise/20 text-brand-turquoise flex items-center justify-center shrink-0">
            <GraduationCap size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total de Unidades</div>
            <div className="text-lg font-extrabold text-slate-900">{visibleSchools.length} Escolas</div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-brand-green/10 border border-brand-green/20 text-brand-green flex items-center justify-center shrink-0">
            <BarChart2 size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Total de Matrículas</div>
            <div className="text-lg font-extrabold text-slate-900">
              {visibleSchools.reduce((sum, s) => sum + s.matriculas, 0).toLocaleString()} Alunos
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
      <SchoolsTable
        schools={filteredSchools}
        summaries={summaries}
        summariesLoading={summariesLoading}
        summaryErrors={summaryErrors}
        onEdit={handleOpenEdit}
        onOpenEnrollmentPanel={setPanelSchool}
      />

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
                <label className="text-[10px] font-black uppercase text-slate-700 block">
                  Nome da Unidade Escolar * {editingSchool && <span className="text-slate-400 font-normal normal-case">(identidade — não editável)</span>}
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingSchool}
                  placeholder="Ex: EEMTI Cinderela de Nazaré"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">
                    Código INEP (8 dígitos) * {editingSchool && <span className="text-slate-400 font-normal normal-case">(não editável)</span>}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingSchool}
                    maxLength={8}
                    placeholder="Ex: 23075841"
                    value={codInep}
                    onChange={(e) => setCodInep(e.target.value.replace(/\D/g, ''))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs font-mono rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
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
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Meta SPAECE 2026 *</label>
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

      {panelSchool && (
        <SchoolEnrollmentPanel
          school={panelSchool}
          turmas={turmasFase2A}
          isFirebaseMode={isFirebaseMode}
          onClose={() => setPanelSchool(null)}
          onDataChanged={refreshEnrollmentSummaries}
        />
      )}
    </div>
  );
}
