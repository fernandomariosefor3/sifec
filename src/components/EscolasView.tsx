import React, { useState, useEffect } from 'react';
import { GraduationCap, PlusCircle, Search, MapPin, BarChart2, Plus, X, ClipboardList } from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, addDocument, updateDocument, SEED_SCHOOLS, SEED_TURMAS } from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId, addSchoolToLoggedInSuperintendent, isCurrentUserAdmin } from '../lib/superintendentService';
import { getClassroomsForSchool, getActiveClassroomCount } from '../lib/classService';
import SchoolEnrollmentPanel from './SchoolEnrollmentPanel';
import SchoolsTable from './SchoolsTable';
import PageHeader from './ui/PageHeader';
import SurfaceCard from './ui/SurfaceCard';
import type { Turma } from '../types/classroom';

// Reestruturação SIFEC — Gestão de Escolas: campo cadastral novo "Região"
// (4ª ou 5ª) exigido pelo plano. Opcional no tipo porque as 56 escolas
// semeadas (SEED_SCHOOLS) nunca tiveram essa informação real cadastrada —
// nunca inventar a região de uma escola real sem confirmação (ver
// conhecimento_sifec.md); a interface mostra "Não informado" até alguém
// preencher pela edição.
export type SchoolRegiao = '4ª' | '5ª';

interface School {
  id: string;
  nome: string;
  codInep: string;
  cidade: string;
  regiao?: SchoolRegiao;
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
  const [regiao, setRegiao] = useState<SchoolRegiao | ''>('');
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
        ...(regiao ? { regiao } : {}),
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
        ...(regiao ? { regiao } : {}),
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
    setRegiao('');
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
    setRegiao(school.regiao ?? '');
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

  // Reestruturação SIFEC — Gestão de Escolas simplificada: turmas ativas por
  // escola calculado direto de `turmas` (sem depender mais de
  // school_years/enrollment_snapshots, removidos desta tela). Contagem
  // síncrona — nunca precisa de um estado de "carregando" próprio, porque
  // `turmasFase2A` já reflete a assinatura em tempo real abaixo.
  const [turmasFase2A, setTurmasFase2A] = useState<Turma[]>(SEED_TURMAS as unknown as Turma[]);
  useEffect(() => {
    if (!isFirebaseMode) {
      setTurmasFase2A(SEED_TURMAS as unknown as Turma[]);
      return;
    }
    const unsubscribe = subscribeToCollection('turmas', loaded => setTurmasFase2A(loaded as Turma[]));
    return () => unsubscribe();
  }, [isFirebaseMode]);
  const turmasAtivasPorEscola: Record<string, number> = {};
  filteredSchools.forEach(school => {
    turmasAtivasPorEscola[school.id] = getActiveClassroomCount(getClassroomsForSchool(turmasFase2A, school));
  });

  // Auditoria da reestruturação SIFEC, seção 4: cobertura de região sempre
  // visível — nunca calcular 4ª/5ª sobre o total de escolas (que incluiria
  // "não informado" como se fosse uma das duas regiões) e nunca apresentar
  // essa cobertura parcial como se fosse o total da carteira/visão.
  const regiao4Count = visibleSchools.filter(s => s.regiao === '4ª').length;
  const regiao5Count = visibleSchools.filter(s => s.regiao === '5ª').length;
  const semRegiaoCount = visibleSchools.length - regiao4Count - regiao5Count;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="SEFOR 3 — Gestão escolar"
        title="Gestão de Escolas"
        description="Identificação cadastral, matrícula por bimestre e turmas de cada unidade da carteira."
        actions={isCurrentUserAdmin() ? (
          <button
            onClick={() => {
              setEditingSchool(null);
              setNome('');
              setCodInep('');
              setCidade('Fortaleza');
              setRegiao('');
              setMatriculas('');
              setIdebMedio('');
              setMetaIdeb('');
              setShowAddForm(true);
            }}
            className="px-3.5 py-2 bg-brand-green hover:bg-brand-green-dark text-white rounded-lg text-[13px] font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={16} /> Cadastrar Nova Escola
          </button>
        ) : undefined}
      />

      {/* Resumo — nível único de superfície, ícones com acento sutil em vez
          de gradiente por cartão. */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SurfaceCard className="flex items-center gap-3.5 bg-brand-green-light border-brand-green/30">
          <div className="w-10 h-10 rounded-xl bg-brand-green text-white flex items-center justify-center shrink-0 shadow-sm">
            <GraduationCap size={20} />
          </div>
          <div>
            <div className="text-label uppercase text-brand-green-dark">Total de Unidades</div>
            <div className="text-lg font-extrabold text-brand-green-dark">{visibleSchools.length} Escolas</div>
          </div>
        </SurfaceCard>
        <SurfaceCard className="flex items-center gap-3.5 bg-brand-turquoise-light border-brand-turquoise/30">
          <div className="w-10 h-10 rounded-xl bg-brand-turquoise text-white flex items-center justify-center shrink-0 shadow-sm">
            <BarChart2 size={20} />
          </div>
          <div>
            <div className="text-label uppercase text-brand-turquoise-dark">Total de Matrículas</div>
            <div className="text-lg font-extrabold text-brand-turquoise-dark">
              {visibleSchools.reduce((sum, s) => sum + s.matriculas, 0).toLocaleString()} Alunos
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard className="flex items-center gap-3.5 bg-brand-orange-light border-brand-orange/30">
          <div className="w-10 h-10 rounded-xl bg-brand-orange text-white flex items-center justify-center shrink-0 shadow-sm">
            <MapPin size={20} />
          </div>
          <div>
            <div className="text-label uppercase text-brand-orange-dark">Cidades Cooperantes</div>
            <div className="text-lg font-extrabold text-brand-orange-dark">{cities.length - 1} Cidade</div>
          </div>
        </SurfaceCard>
        <SurfaceCard className="flex items-center gap-3.5 bg-brand-coral-light border-brand-coral/30">
          <div className="w-10 h-10 rounded-xl bg-brand-coral text-white flex items-center justify-center shrink-0 shadow-sm">
            <MapPin size={20} />
          </div>
          <div>
            <div className="text-label uppercase text-slate-400">Cobertura de Região</div>
            <div className="text-base font-extrabold text-slate-900">4ª: {regiao4Count} · 5ª: {regiao5Count}</div>
            {semRegiaoCount > 0 && (
              <div className="text-caption text-status-attention font-bold mt-0.5">{semRegiaoCount} escola(s) sem região informada</div>
            )}
          </div>
        </SurfaceCard>
      </div>

      {/* Filters and search box */}
      <SurfaceCard className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar por escola ou código INEP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-sifec-entity="search"
            data-sifec-field="query"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-lg"
          />
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        </div>

        {/* City Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-bold">Filtrar Cidade:</span>
          <div className="flex gap-1.5 p-1 bg-slate-50 border border-slate-150 rounded-lg">
            {cities.map((city) => (
              <button
                key={city}
                onClick={() => setCityFilter(city)}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
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
      </SurfaceCard>

      {/* Faixa de orientação — o caminho para lançar a matrícula por
          bimestre e cadastrar turmas. Discreta, aparece para admin e
          superintendente, não repete por linha. */}
      <div className="bg-status-info-bg border border-status-info-border rounded-xl px-4 py-2.5 text-caption text-status-info flex items-center gap-2">
        <ClipboardList size={14} className="shrink-0" />
        <span>
          Para lançar a matrícula por bimestre ou cadastrar turmas, clique em <strong>“Matrícula por bimestre”</strong> na escola desejada.
        </span>
      </div>

      {/* Schools List Render */}
      <SchoolsTable
        schools={filteredSchools}
        turmasAtivasPorEscola={turmasAtivasPorEscola}
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
                  data-sifec-entity="school"
                  data-sifec-field="nome"
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
                    data-sifec-entity="school"
                    data-sifec-field="codInep"
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs font-mono rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Sede da Regional / Cidade *</label>
                  <select
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    data-sifec-entity="school"
                    data-sifec-field="cidade"
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                  >
                    {cities.filter(c => c !== 'Todas').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Região</label>
                <select
                  value={regiao}
                  onChange={(e) => setRegiao(e.target.value as SchoolRegiao | '')}
                  data-sifec-entity="school"
                  data-sifec-field="regiao"
                  className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs rounded-xl"
                >
                  <option value="">Não informado</option>
                  <option value="4ª">4ª</option>
                  <option value="5ª">5ª</option>
                </select>
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
                    data-sifec-entity="school"
                    data-sifec-field="matriculas"
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
                    data-sifec-entity="school"
                    data-sifec-field="metaSpaece"
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
                    data-sifec-entity="school"
                    data-sifec-field="metaIdeb"
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:border-slate-350 focus:outline-none text-xs font-mono rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-brand-green hover:bg-brand-green-dark text-white font-extrabold text-xs uppercase cursor-pointer tracking-wider rounded-xl shadow-lg mt-3 transition"
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
        />
      )}
    </div>
  );
}
