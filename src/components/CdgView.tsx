import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Plus, 
  Trash2, 
  Edit, 
  X, 
  Search, 
  MapPin, 
  AlertTriangle,
  Lock,
  FileSpreadsheet,
  CheckCircle2,
  ListTodo,
  Calendar,
  User,
  Activity,
  CheckSquare
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, updateDocument, addDocument, deleteDocument, SEED_SCHOOLS } from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId, hasSchoolWriteAccess, getSuperintendents, setActiveSuperintendentId, schoolNamesMatch } from '../lib/superintendentService';

interface CdgAction {
  id: string; // `cdg-${escola}-${fase}-${id}`
  escola: string;
  fase: '1. Planejamento' | '2. Execução' | '3. Monitoramento' | '4. Correção de Rotas';
  acao: string;
  descricao: string;
  responsavel: string;
  prazo: string;
  status: 'Não Iniciado' | 'Em Andamento' | 'Concluído';
  progresso: number; // 0 - 100
  bimestre?: string;
}

const INITIAL_CDG_ACTIONS: CdgAction[] = [
  // EEM Diva Cabral
  {
    id: 'cdg-diva-1-1',
    escola: 'EEM Diva Cabral',
    fase: '1. Planejamento',
    acao: 'Pactuação de metas de proficiência SPAECE',
    descricao: 'Reunião pedagógica com coordenadores e professores para alinhar as metas do IDEB (meta 6.3).',
    responsavel: 'Fátima Sousa (Diretora)',
    prazo: 'Imediato',
    status: 'Concluído',
    progresso: 100,
    bimestre: '1º Bimestre'
  },
  {
    id: 'cdg-diva-2-1',
    escola: 'EEM Diva Cabral',
    fase: '2. Execução',
    acao: 'Oficinas dirigidas de descritores críticos',
    descricao: 'Aplicação semanal de material estruturado suplementar focado nos descritores D4 e D16.',
    responsavel: 'Prof. Ricardo Gomes (PPDT)',
    prazo: 'Durante o Bimestre',
    status: 'Em Andamento',
    progresso: 75,
    bimestre: '1º Bimestre'
  },
  {
    id: 'cdg-diva-3-1',
    escola: 'EEM Diva Cabral',
    fase: '3. Monitoramento',
    acao: 'Simulados regionais mensais',
    descricao: 'Aplicação e correção estatística dos simulados diagnósticos para identificar lacunas.',
    responsavel: 'Coordenação Pedagógica',
    prazo: 'Mensal',
    status: 'Em Andamento',
    progresso: 60,
    bimestre: '1º Bimestre'
  },
  {
    id: 'cdg-diva-4-1',
    escola: 'EEM Diva Cabral',
    fase: '4. Correção de Rotas',
    acao: 'Trilhas adaptativas de recomposição rápida',
    descricao: 'Fornecimento de roteiros de reforço alternativos para alunos com rendimento insatisfatório.',
    responsavel: 'Rita de Cássia (Coordenadora de Área)',
    prazo: 'Fim de Bimestre',
    status: 'Não Iniciado',
    progresso: 10,
    bimestre: '1º Bimestre'
  },

  // EEM Figueiredo Correia
  {
    id: 'cdg-fig-1-1',
    escola: 'EEM Figueiredo Correia',
    fase: '1. Planejamento',
    acao: 'Ajuste de grade horária para contraturno',
    descricao: 'Planejar salas de reforço de matemática para mitigar descritores críticos.',
    responsavel: 'Marcos Leitão (Diretor)',
    prazo: 'Início do Semestre',
    status: 'Concluído',
    progresso: 100,
    bimestre: '1º Bimestre'
  },
  {
    id: 'cdg-fig-2-1',
    escola: 'EEM Figueiredo Correia',
    fase: '2. Execução',
    acao: 'Mentoria individual de alunos fustigados',
    descricao: 'Apoio pedagógico individualizado focado no combate à evasão escolar silenciosa.',
    responsavel: 'Cleide Pinheiro (Coordenadora)',
    prazo: 'Contínuo',
    status: 'Em Andamento',
    progresso: 80,
    bimestre: '1º Bimestre'
  },

  // EEM José Leopoldino da Silva
  {
    id: 'cdg-leo-1-1',
    escola: 'EEM José Leopoldino da Silva',
    fase: '1. Planejamento',
    acao: 'Elaboração de quadros de nivelamento por classe',
    descricao: 'Mapeamento inicial de perfis de leitura e interpretação lógica de alunos do 3º ano.',
    responsavel: 'Marta Rodrigues (Direção)',
    prazo: 'Primeira Semana',
    status: 'Concluído',
    progresso: 100,
    bimestre: '1º Bimestre'
  },
  {
    id: 'cdg-leo-3-1',
    escola: 'EEM José Leopoldino da Silva',
    fase: '3. Monitoramento',
    acao: 'Auditoria de cadernos de frequência e diários',
    descricao: 'Garantir que os registros de faltas coincidam com as sinalizações de Busca Ativa.',
    responsavel: 'Marcus Fernandes (Professor PDT)',
    prazo: 'Quinzenal',
    status: 'Em Andamento',
    progresso: 50,
    bimestre: '1º Bimestre'
  }
];

export default function CdgView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [superintendents, setSuperintendents] = useState<any[]>([]);

  // Spreadsheet state filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBimestre, setFilterBimestre] = useState('Todos');

  // Core actions state
  const [actions, setActions] = useState<CdgAction[]>(INITIAL_CDG_ACTIONS);

  // Stage Manager states (opened when clicking a phase cell)
  const [managingSchool, setManagingSchool] = useState<string | null>(null);
  const [managingPhase, setManagingPhase] = useState<CdgAction['fase'] | null>(null);

  // Sub-form states within the Stage Manager modal
  const [showActionForm, setShowActionForm] = useState(false);
  const [editingAction, setEditingAction] = useState<CdgAction | null>(null);
  const [formAcao, setFormAcao] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formResp, setFormResp] = useState('');
  const [formPrazo, setFormPrazo] = useState('Mensal');
  const [formStatus, setFormStatus] = useState<'Não Iniciado' | 'Em Andamento' | 'Concluído'>('Não Iniciado');
  const [formProgresso, setFormProgresso] = useState(0);
  const [formBimestre, setFormBimestre] = useState('1º Bimestre');
  const [formError, setFormError] = useState('');

  // Watch Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsFirebaseMode(!!user);
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Monitor Superintendent (and admin portfolio/global scope) changes
  useEffect(() => {
    setSuperintendents(getSuperintendents());
    const handleSuperChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
      setSuperintendents(getSuperintendents());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    window.addEventListener('sefor3_superintendents_change', handleSuperChange);
    window.addEventListener('sefor3_admin_scope_change', handleSuperChange);
    setActiveSuperId(getActiveSuperintendentId());
    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
      window.removeEventListener('sefor3_superintendents_change', handleSuperChange);
      window.removeEventListener('sefor3_admin_scope_change', handleSuperChange);
    };
  }, []);

  const visibleSchools = schools.filter(s => isSchoolVisible(s.nome));

  // Sync schools database
  useEffect(() => {
    if (!isFirebaseMode) {
      setSchools(SEED_SCHOOLS);
      return;
    }
    const unsub = subscribeToCollection('schools', (loaded) => {
      setSchools(loaded.length > 0 ? loaded : SEED_SCHOOLS);
    });
    return () => unsub();
  }, [isFirebaseMode]);

  // Sync actions database
  useEffect(() => {
    if (!isFirebaseMode) {
      const localCdg = localStorage.getItem('sefor3_cdg_actions');
      if (localCdg) {
        setActions(JSON.parse(localCdg));
      } else {
        localStorage.setItem('sefor3_cdg_actions', JSON.stringify(INITIAL_CDG_ACTIONS));
        setActions(INITIAL_CDG_ACTIONS);
      }
      return;
    }

    const unsubCdg = subscribeToCollection('cdg_actions', (loaded) => {
      if (loaded.length > 0) {
        setActions(loaded as any);
      } else {
        setActions(INITIAL_CDG_ACTIONS);
      }
    });

    return () => unsubCdg();
  }, [isFirebaseMode]);

  // Persistent modifier helper
  const persistActionsChange = async (updatedList: CdgAction[]) => {
    if (!isFirebaseMode) {
      localStorage.setItem('sefor3_cdg_actions', JSON.stringify(updatedList));
      setActions(updatedList);
    }
  };

  // Manage trigger helper
  const handleOpenManageStage = (schoolName: string, phaseName: CdgAction['fase']) => {
    setManagingSchool(schoolName);
    setManagingPhase(phaseName);
    setShowActionForm(false);
    setEditingAction(null);
    setFormError('');
  };

  const handleOpenAddActionForm = () => {
    setEditingAction(null);
    setFormAcao('');
    setFormDesc('');
    setFormResp('');
    setFormPrazo('Mensal');
    setFormStatus('Não Iniciado');
    setFormProgresso(0);
    setFormBimestre(filterBimestre !== 'Todos' ? filterBimestre : '1º Bimestre');
    setFormError('');
    setShowActionForm(true);
  };

  const handleOpenEditAction = (act: CdgAction) => {
    setEditingAction(act);
    setFormAcao(act.acao);
    setFormDesc(act.descricao);
    setFormResp(act.responsavel);
    setFormPrazo(act.prazo);
    setFormStatus(act.status);
    setFormProgresso(act.progresso);
    setFormBimestre(act.bimestre || '1º Bimestre');
    setFormError('');
    setShowActionForm(true);
  };

  const handleDeleteAction = async (id: string) => {
    if (!managingSchool) return;
    if (!hasSchoolWriteAccess(managingSchool)) {
      alert('Acesso Negado: Você não é o superintendente responsável por esta escola.');
      return;
    }

    if (window.confirm('Excluir esta ação pedagógica definitivamente?')) {
      if (isFirebaseMode) {
        try {
          await deleteDocument('cdg_actions', id);
        } catch (err: any) {
          console.error('Erro ao remover do Firebase:', err);
        }
      } else {
        const updated = actions.filter(a => a.id !== id);
        await persistActionsChange(updated);
      }
      if (editingAction?.id === id) {
        setShowActionForm(false);
        setEditingAction(null);
      }
    }
  };

  const handleSaveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingSchool || !managingPhase) return;

    if (!hasSchoolWriteAccess(managingSchool)) {
      setFormError('Acesso Negado: Você não tem permissão de escrita para gerenciar os dados desta escola.');
      return;
    }

    if (!formAcao.trim() || !formDesc.trim() || !formResp.trim()) {
      setFormError('Por favor, preencha todos os campos obrigatórios (*).');
      return;
    }

    const payload: CdgAction = {
      id: editingAction ? editingAction.id : `cdg-${Date.now()}`,
      escola: managingSchool,
      fase: managingPhase,
      acao: formAcao,
      descricao: formDesc,
      responsavel: formResp,
      prazo: formPrazo,
      status: formStatus,
      progresso: formStatus === 'Concluído' ? 100 : Number(formProgresso),
      bimestre: formBimestre
    };

    if (isFirebaseMode) {
      try {
        if (editingAction) {
          await updateDocument('cdg_actions', editingAction.id, payload);
        } else {
          await addDocument('cdg_actions', payload.id, payload);
        }
      } catch (err: any) {
        setFormError('Erro ao gravar no Firebase: ' + err.message);
        return;
      }
    } else {
      let nextList = [];
      if (editingAction) {
        nextList = actions.map(a => a.id === editingAction.id ? payload : a);
      } else {
        nextList = [payload, ...actions];
      }
      await persistActionsChange(nextList);
    }

    // Reset states
    setShowActionForm(false);
    setEditingAction(null);
    setFormAcao('');
    setFormDesc('');
    setFormResp('');
    setFormError('');
  };

  // Helper lists & metadata
  const phasesList: CdgAction['fase'][] = [
    '1. Planejamento',
    '2. Execução',
    '3. Monitoramento',
    '4. Correção de Rotas'
  ];

  // Filters schools that matches search or active superintendent visible rules
  const sortedSchools = [...visibleSchools].sort((a,b) => a.nome.localeCompare(b.nome));
  const filteredSchools = sortedSchools.filter(s => 
    s.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.cidade && s.cidade.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Return actions filtered by school, phase, and optionally bimestre
  const getCellActions = (schoolName: string, phaseName: CdgAction['fase']) => {
    return actions.filter(a =>
      schoolNamesMatch(a.escola, schoolName) &&
      a.fase === phaseName &&
      (filterBimestre === 'Todos' || !a.bimestre || a.bimestre === filterBimestre)
    );
  };

  // Calculate completion statistics for rows
  const getSchoolCompletionStats = (schoolName: string) => {
    const schoolActs = actions.filter(a =>
      schoolNamesMatch(a.escola, schoolName) &&
      (filterBimestre === 'Todos' || !a.bimestre || a.bimestre === filterBimestre)
    );
    if (schoolActs.length === 0) return { total: 0, completed: 0, percentage: 0 };
    const completed = schoolActs.filter(a => a.status === 'Concluído').length;
    const totalProg = schoolActs.reduce((sum, a) => sum + a.progresso, 0);
    const avgProg = Math.round(totalProg / schoolActs.length);
    return {
      total: schoolActs.length,
      completed,
      percentage: avgProg
    };
  };

  // Modal actions list
  const managedStageActions = managingSchool && managingPhase
    ? actions.filter(a => schoolNamesMatch(a.escola, managingSchool) && a.fase === managingPhase)
    : [];

  const loggedInSuper = currentUser?.email
    ? superintendents.find(s => s.email?.toLowerCase() === currentUser.email?.toLowerCase())
    : null;

  const activeSuper = superintendents.find(s => s.id === activeSuperId) || 
    (superintendents.length > 0 ? superintendents[0] : null);

  return (
    <div className="space-y-6">
      {/* Dynamic Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - SIFEC INTEGRADO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Circuito de Gestão (CdG) — Matriz de Acompanhamento</h2>
          <p className="text-xs text-slate-500 font-normal">Supervisão e monitoramento das etapas do plano de metas de todas as escolas em tempo real.</p>
        </div>
      </div>

      {/* Workspace Assistance Banner */}
      {loggedInSuper && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-2xl text-xs -mt-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-turquoise inline-block shrink-0 animate-pulse" />
            <span className="text-slate-700 leading-relaxed">
              Olá <strong className="text-slate-900">{loggedInSuper.nome.split(' ')[0]}</strong>! O painel está filtrado pelo espaço de trabalho: <strong className="text-brand-turquoise-dark font-black">{activeSuper ? activeSuper.nome : 'Nenhum'}</strong>.
            </span>
          </div>
          {activeSuperId !== loggedInSuper.id && (
            <button
              onClick={() => {
                setActiveSuperintendentId(loggedInSuper.id);
                setActiveSuperId(loggedInSuper.id);
              }}
              className="px-3.5 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white rounded-xl font-black text-[10px] uppercase tracking-wide transition cursor-pointer self-stretch md:self-auto text-center shrink-0 shadow-sm"
            >
              Exibir Minhas Escolas
            </button>
          )}
        </div>
      )}

      {/* Spreadsheet Control Panel / Filters */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 flex-1">
          {/* Real-time search */}
          <div className="relative w-full md:max-w-xs">
            <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider mb-1">Filtrar por Escola</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Pesquise o nome da escola..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 text-xs font-bold rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-turquoise focus:border-brand-turquoise transition"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-slate-400" />
            </div>
          </div>

          {/* Bimestre segmentation dropdown */}
          <div className="w-full md:max-w-xs">
            <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider mb-1">Bimestre Letivo do Mapa</label>
            <select
              value={filterBimestre}
              onChange={(e) => setFilterBimestre(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-turquoise focus:border-brand-turquoise transition"
            >
              <option value="Todos">Exibir Todos os Bimestres</option>
              <option value="1º Bimestre">1º Bimestre</option>
              <option value="2º Bimestre">2º Bimestre</option>
              <option value="3º Bimestre">3º Bimestre</option>
              <option value="4º Bimestre">4º Bimestre</option>
            </select>
          </div>
        </div>

        {/* Dynamic Indicator Badges */}
        <div className="flex items-center gap-3 bg-white border border-slate-150 p-3 rounded-2xl shrink-0 max-w-sm self-stretch md:self-auto justify-center">
          <FileSpreadsheet className="text-brand-turquoise shrink-0" size={20} />
          <div className="text-left">
            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wide">Layout Planilha Ativa</span>
            <span className="text-[10px] font-bold text-slate-800 block mt-0.5">
              Visualização de <strong>{filteredSchools.length}</strong> escolas no SEFOR 3
            </span>
          </div>
        </div>
      </div>

      {/* Main spreadsheet Matrix Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[1100px]">
            <thead>
              {/* Table Column Headers */}
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                <th className="py-4 px-4 w-[250px] border-r border-slate-200">Unidade Escolar / Sede</th>
                <th className="py-4 px-4 w-[240px] border-r border-slate-200 text-center text-indigo-900 bg-indigo-50/20">1. PLANEJAMENTO</th>
                <th className="py-4 px-4 w-[240px] border-r border-slate-200 text-center text-teal-900 bg-teal-50/20">2. EXECUÇÃO</th>
                <th className="py-4 px-4 w-[240px] border-r border-slate-200 text-center text-amber-900 bg-amber-50/10">3. MONITORAMENTO</th>
                <th className="py-4 px-4 w-[240px] text-center text-rose-900 bg-rose-50/10">4. CORREÇÃO DE ROTAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700">
              {filteredSchools.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-400 font-medium">
                    Nenhuma escola encontrada correspondente aos critérios ou filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredSchools.map((school) => {
                  const stats = getSchoolCompletionStats(school.nome);
                  const isAuthorized = hasSchoolWriteAccess(school.nome);

                  return (
                    <tr key={school.id} className="hover:bg-slate-50/30 transition group/row align-top">
                      {/* Column 1: School Name, Sede, Status overview */}
                      <td className="p-4 border-r border-slate-200 bg-slate-50/40 group-hover/row:bg-slate-50 transition">
                        <div className="space-y-2">
                          <div>
                            <span className="text-[9px] font-mono font-extrabold text-slate-400 block uppercase">INEP: {school.codInep}</span>
                            <span className="text-xs font-black text-slate-900 block leading-tight mt-0.5">{school.nome}</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <MapPin size={11} className="text-slate-400 shrink-0" />
                            <span>{school.cidade}</span>
                          </div>

                          <div className="pt-2 border-t border-slate-150 space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                              <span>Ciclo Geral</span>
                              <span className="font-mono text-slate-800">{stats.percentage}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
                              <div 
                                className="bg-brand-turquoise h-full rounded-full transition-all duration-300"
                                style={{ width: `${stats.percentage}%` }}
                              />
                            </div>
                            <span className="text-[8px] font-mono text-slate-400 block">
                              {stats.completed} de {stats.total} metas concluídas
                            </span>
                          </div>

                          {!isAuthorized && (
                            <span className="inline-flex items-center gap-1 text-slate-400 text-[8px] font-extrabold font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded uppercase" title="Somente Leitura">
                              <Lock size={8} className="text-amber-500 shrink-0" />
                              Restrito: Leitura
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columns 2-5: The 4 chronological stages of the cycle */}
                      {phasesList.map((phase) => {
                        const cellActions = getCellActions(school.nome, phase);
                        
                        return (
                          <td 
                            key={phase} 
                            className={`p-3 border-r border-slate-200 hover:bg-slate-50/50 transition-colors relative flex-col justify-between`}
                          >
                            <div className="flex flex-col h-full min-h-[170px] justify-between">
                              {/* Actions List in spreadsheet cell */}
                              <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-0.5">
                                {cellActions.map(act => (
                                  <div 
                                    key={act.id} 
                                    onClick={() => handleOpenManageStage(school.nome, phase)}
                                    className="p-1.5 border border-slate-200 rounded-lg bg-white text-[10px] text-slate-800 flex flex-col gap-0.5 hover:border-brand-turquoise hover:shadow-xs transition cursor-pointer"
                                    title={`${act.acao}\nResponsável: ${act.responsavel}\nPrazo: ${act.prazo}`}
                                  >
                                    <div className="flex justify-between items-start gap-1">
                                      <span className="font-extrabold text-slate-900 truncate flex-1 hover:text-brand-turquoise">
                                        {act.acao}
                                      </span>
                                      <span className={`px-1 rounded text-[8px] font-black uppercase shrink-0 ${
                                        act.status === 'Concluído' 
                                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' 
                                          : act.status === 'Em Andamento' 
                                          ? 'bg-brand-turquoise/10 text-brand-turquoise border border-brand-turquoise/20' 
                                          : 'bg-slate-100 text-slate-500 border border-slate-150'
                                      }`}>
                                        {act.status === 'Concluído' ? 'OK' : act.progresso + '%'}
                                      </span>
                                    </div>
                                    <p className="text-slate-400 text-[9px] line-clamp-1 italic">
                                      {act.descricao}
                                    </p>
                                    <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono border-t border-slate-100 mt-1 pt-1">
                                      <span className="truncate max-w-[90px]">Resp: {act.responsavel.split(' ')[0]}</span>
                                      <span>Prazo: {act.prazo}</span>
                                    </div>
                                  </div>
                                ))}

                                {cellActions.length === 0 && (
                                  <div className="py-4 text-center text-slate-400 italic text-[10px] font-medium border border-dashed border-slate-150 rounded-lg bg-slate-50/30">
                                    Pendente
                                  </div>
                                )}
                              </div>

                              {/* Interactive Cell Footer Manage Access */}
                              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[9px]">
                                <span className="text-slate-400 font-medium font-mono">
                                  {cellActions.length} ac{cellActions.length === 1 ? 'ão' : 'ões'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenManageStage(school.nome, phase)}
                                  className={`px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-brand-turquoise/10 hover:text-brand-turquoise hover:border-brand-turquoise/20 text-slate-600 transition flex items-center gap-1 font-bold`}
                                >
                                  <Edit size={9} /> Gerenciar
                                </button>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STAGE ACTIONS MANAGER OVERLAY MODAL */}
      {managingSchool && managingPhase && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-205 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-[9px] font-black uppercase text-brand-turquoise tracking-wider block font-mono">
                  SIFEC • CIRCUITO DE GESTÃO ESCOLAR
                </span>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Sliders size={14} className="text-brand-turquoise" />
                  Gerenciar Etapa: {managingPhase}
                </h4>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                  {managingSchool}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => { setManagingSchool(null); setManagingPhase(null); }} 
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Split Panel Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left Side: Existing Actions List */}
              <div className="lg:col-span-3 space-y-4 flex flex-col h-full">
                <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] font-black uppercase text-slate-650 block">Modificar Plano de Ação</span>
                  {hasSchoolWriteAccess(managingSchool) && (
                    <button
                      type="button"
                      onClick={handleOpenAddActionForm}
                      className="px-2.5 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white text-[10px] uppercase font-black tracking-wide rounded-lg flex items-center gap-1 cursor-pointer transition shadow-sm"
                    >
                      <Plus size={12} /> Adicionar Ação
                    </button>
                  )}
                </div>

                <div className="space-y-3 max-h-[450px] overflow-y-auto p-1 border border-transparent rounded-lg flex-1">
                  {managedStageActions.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/50 border border-slate-155 rounded-2xl max-w-full">
                      <AlertTriangle className="text-amber-500 mx-auto mb-2" size={24} />
                      <h4 className="font-bold text-slate-800 uppercase text-[11px]">Nenhum pacto ou registro formulado</h4>
                      <p className="text-[11px] text-slate-450 mt-1 leading-relaxed">
                        Nenhuma diretiva cadastrada para esse estágio do Circuito de Gestão. Clique em "Adicionar Ação" acima para formular metas.
                      </p>
                    </div>
                  ) : (
                    managedStageActions.map((act) => (
                      <div key={act.id} className="p-4 border border-slate-205 rounded-xl bg-white shadow-xs space-y-3">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-550 border border-slate-200">
                              {act.bimestre || 'Geral'}
                            </span>
                            <h5 className="font-black text-slate-900 leading-snug mt-1.5 text-xs">
                              {act.acao}
                            </h5>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border shrink-0 ${
                            act.status === 'Concluído'
                              ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
                              : act.status === 'Em Andamento'
                              ? 'bg-brand-turquoise/15 border-brand-turquoise/20 text-brand-turquoise'
                              : 'bg-slate-50 border-slate-200 text-slate-500'
                          }`}>
                            {act.status}
                          </span>
                        </div>

                        <p className="text-slate-500 text-[11px] leading-relaxed font-normal">
                          {act.descricao}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-150 font-medium">
                          <div>
                            <span className="text-[8px] text-slate-400 block font-bold uppercase">Profissional Responsável</span>
                            <span className="text-slate-750 font-bold">{act.responsavel}</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-400 block font-bold uppercase">Meta de Prazo</span>
                            <span className="text-slate-750 font-bold">{act.prazo}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                            <div 
                              className="bg-brand-green h-full transition-all duration-300" 
                              style={{ width: `${act.progresso}%` }} 
                            />
                          </div>
                          <span className="text-[10px] font-mono font-black text-slate-705 shrink-0">{act.progresso}%</span>
                        </div>

                        {hasSchoolWriteAccess(managingSchool) ? (
                          <div className="flex justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleOpenEditAction(act)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              <Edit size={10} /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAction(act.id)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={10} /> Excluir
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end pt-1.5 text-slate-400 text-[9px] font-bold font-mono">
                            <Lock size={10} className="text-amber-500 inline mr-1" /> Somente Leitura
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Side: Form details panel for add/edit */}
              <div className="lg:col-span-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-6 lg:pt-0 lg:pl-6 space-y-4">
                {showActionForm ? (
                  <form onSubmit={handleSaveAction} className="space-y-4">
                    <h5 className="text-[11px] font-black uppercase text-slate-700 block tracking-wider pb-1.5 border-b border-slate-150 flex items-center gap-2">
                      <ListTodo size={14} className="text-brand-turquoise" />
                      {editingAction ? 'Ajustar Ação Existente' : 'Formular Nova Ação'}
                    </h5>

                    {formError && (
                      <div className="p-3 bg-rose-50 border border-rose-225 text-rose-700 text-[11px] rounded-xl font-bold leading-relaxed">
                        {formError}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-500 block">Título Curto da Ação *</label>
                      <input
                        type="text"
                        required
                        value={formAcao}
                        onChange={(e) => setFormAcao(e.target.value)}
                        placeholder="Ex: Pactuação de metas de proficiência"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-turquoise"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-500 block">Descrição e Metodologia *</label>
                      <textarea
                        required
                        rows={3}
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.target.value)}
                        placeholder="Desque detalhadamente as rotinas práticas..."
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-turquoise"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 block">Responsável Executor *</label>
                        <input
                          type="text"
                          required
                          value={formResp}
                          onChange={(e) => setFormResp(e.target.value)}
                          placeholder="Ex: Marcos (Diretor)"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-turquoise"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 block">Prazo Acordado *</label>
                        <input
                          type="text"
                          required
                          value={formPrazo}
                          onChange={(e) => setFormPrazo(e.target.value)}
                          placeholder="Ex: Mensal / Imediato"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-turquoise"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 block">Bimestre Letivo</label>
                        <select
                          value={formBimestre}
                          onChange={(e) => setFormBimestre(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-turquoise"
                        >
                          <option value="1º Bimestre">1º Bimestre</option>
                          <option value="2º Bimestre">2º Bimestre</option>
                          <option value="3º Bimestre">3º Bimestre</option>
                          <option value="4º Bimestre">4º Bimestre</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 block">Situação / Status</label>
                        <select
                          value={formStatus}
                          onChange={(e) => {
                            const nextSt = e.target.value as any;
                            setFormStatus(nextSt);
                            if (nextSt === 'Concluído') setFormProgresso(100);
                            else if (nextSt === 'Não Iniciado') setFormProgresso(0);
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-turquoise"
                        >
                          <option value="Não Iniciado">Não Iniciado</option>
                          <option value="Em Andamento">Em Andamento</option>
                          <option value="Concluído">Concluído</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-black uppercase text-slate-500 block">Progresso da Ação (%)</label>
                        <span className="text-[10px] font-mono font-extrabold text-brand-green bg-brand-green/10 px-2 py-0.5 rounded border border-brand-green/15">
                          {formProgresso}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={formProgresso}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFormProgresso(val);
                          if (val === 100) {
                            setFormStatus('Concluído');
                          } else if (val === 0) {
                            setFormStatus('Não Iniciado');
                          } else {
                            setFormStatus('Em Andamento');
                          }
                        }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-green mt-1"
                      />
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowActionForm(false)}
                        className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-black text-xs uppercase rounded-xl transition shadow-sm cursor-pointer"
                      >
                        {editingAction ? 'Salvar Mudanças' : 'Criar Ação'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl h-full flex flex-col justify-center items-center space-y-3">
                    <Activity className="text-slate-400" size={32} />
                    <h5 className="font-extrabold text-slate-800 text-xs uppercase">Editor de Metas SIFEC</h5>
                    <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                      Selecione uma das ações planejadas no menu à esquerda para ajustá-la, ou crie um novo plano clicando em "Adicionar Ação".
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-150 px-6 py-4 flex justify-between items-center text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <CheckSquare size={13} className="text-brand-green" />
                As ações salvas atualizam a planilha SIFEC localmente ou no Firebase sincronizado.
              </span>
              <button 
                type="button"
                onClick={() => { setManagingSchool(null); setManagingPhase(null); }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer shadow-sm transition"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
