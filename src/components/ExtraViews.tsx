import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  UserCheck, 
  AlertTriangle, 
  Users, 
  Award, 
  BookOpen, 
  Presentation, 
  Plus, 
  X, 
  Edit, 
  Sliders, 
  Check, 
  CheckCircle,
  Trash2, 
  ArrowRight,
  TrendingDown,
  Info,
  ChevronRight,
  FileText,
  Sparkles,
  RefreshCw,
  Clock,
  Lock
} from 'lucide-react';
import { 
  subscribeToCollection, 
  updateDocument, 
  addDocument, 
  deleteDocument,
  SEED_SCHOOLS, 
  SEED_TURMAS,
  SEED_GRADES 
} from '../lib/firebaseService';
import { auth } from '../lib/firebase';
import { isSchoolVisible, getActiveSuperintendentId, hasSchoolWriteAccess, schoolNamesMatch } from '../lib/superintendentService';

/* ========================================================
   INTERFACE DECLARATIONS
   ======================================================== */
interface AdminStaff {
  id: string;
  nome: string;
  depto: string;
  escola: string;
  email: string;
}

interface BuscaAtivaStudent {
  id: string;
  nome: string;
  escola: string;
  turma: string;
  bimestre: string;
  faltasConsecutivas: number;
  risco: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  status: string;
  logIntervencao: string;
}

interface RecomposicaoItem {
  id: string; // `rec-${escola}-${turma}-${bimestre}-${disciplina}`
  escola: string;
  turma: string;
  bimestre: string;
  disciplina: 'Língua Portuguesa' | 'Matemática';
  descricao: string;
  focoIntervencao: string;
  progresso: number;
}

/* ========================================================
   DEFAULT LOCAL SEED RECORDS
   ======================================================== */
const INITIAL_BUSCA_ATIVA: BuscaAtivaStudent[] = [
  { 
    id: 'ba-1', 
    nome: 'John Doe Silva', 
    escola: 'EEM Diva Cabral', 
    turma: '3º Ano A - Matutino', 
    bimestre: '1º Bimestre', 
    faltasConsecutivas: 12, 
    risco: 'Alto', 
    status: 'Rastreamento Pendente', 
    logIntervencao: 'Tentativa de contato telefônico com os responsáveis sem retorno. Agendado envio de profissional PPDT.' 
  },
  { 
    id: 'ba-2', 
    nome: 'Mariana de Souza Melo', 
    escola: 'EEM Figueiredo Correia', 
    turma: '3º Ano A - Matutino', 
    bimestre: '1º Bimestre', 
    faltasConsecutivas: 8, 
    risco: 'Médio', 
    status: 'Família Contatada', 
    logIntervencao: 'Mãe justificou ausência por problemas crônicos de transporte. Encaminhado passe estudantil emergencial.' 
  },
  { 
    id: 'ba-3', 
    nome: 'Gabriel de Alencar Bastos', 
    escola: 'EEM José Leopoldino da Silva', 
    turma: '3º Ano A - Matutino', 
    bimestre: '2º Bimestre', 
    faltasConsecutivas: 15, 
    risco: 'Crítico', 
    status: 'Visita Domiciliar Agendada', 
    logIntervencao: 'Agendada visita em cooperação com o assistente social regional da SEFOR 3 para o próximo dia útil.' 
  },
  { 
    id: 'ba-4', 
    nome: 'Jefferson de Oliveira Freire', 
    escola: 'EEM São Francisco Canindezinho', 
    turma: '3º Ano A - Matutino', 
    bimestre: '2º Bimestre', 
    faltasConsecutivas: 10, 
    risco: 'Alto', 
    status: 'Visita Residencial Planejada', 
    logIntervencao: 'Identificados problemas de frequência recorrente. Relatório enviado à direção adjunta.' 
  },
  { 
    id: 'ba-5', 
    nome: 'Ana Larissa Santos', 
    escola: 'EEMTI Anísio Teixeira', 
    turma: '3º Ano A - Matutino', 
    bimestre: '1º Bimestre', 
    faltasConsecutivas: 6, 
    risco: 'Baixo', 
    status: 'Resolvido (Retornou)', 
    logIntervencao: 'Estudante retornou às aulas presenciais regulares. Vinculada à trilha prioritária de recomposição.' 
  }
];

const INITIAL_RECOMPOSICAO: RecomposicaoItem[] = [
  {
    id: 'rec-1',
    escola: 'EEM Diva Cabral',
    turma: '3º Ano A - Matutino',
    bimestre: '1º Bimestre',
    disciplina: 'Língua Portuguesa',
    descricao: 'Abordagem focada em descritores de interpretação de textos literários e identificação de tese do autor.',
    focoIntervencao: 'D4 - Distinguir um fato da opinião relativa a esse fato.',
    progresso: 82
  },
  {
    id: 'rec-2',
    escola: 'EEM Diva Cabral',
    turma: '3º Ano A - Matutino',
    bimestre: '1º Bimestre',
    disciplina: 'Matemática',
    descricao: 'Plano com foco em álgebra linear, análise gráfica de funções afins e resolução de problemas operacionais.',
    focoIntervencao: 'D16 - Estabelecer relações entre representações algébricas e gráficas de funções do 1º grau.',
    progresso: 64
  },
  {
    id: 'rec-3',
    escola: 'EEM Figueiredo Correia',
    turma: '3º Ano A - Matutino',
    bimestre: '1º Bimestre',
    disciplina: 'Língua Portuguesa',
    descricao: 'Estágios pedagógicos para mitigar lacunas de coesão textual em crônicas argumentativas.',
    focoIntervencao: 'D2 - Estabelecer relações entre partes de um texto, identificando repetições ou substituições.',
    progresso: 75
  },
  {
    id: 'rec-4',
    escola: 'EEM Figueiredo Correia',
    turma: '3º Ano A - Matutino',
    bimestre: '1º Bimestre',
    disciplina: 'Matemática',
    descricao: 'Geometria espacial prática integrada com conceitos de área e relações métricas para o ENEM.',
    focoIntervencao: 'D11 - Resolver problema envolvendo o cálculo de volume de sólidos geométricos.',
    progresso: 58
  }
];

/* ========================================================
   SHARED TAB REACTIVE EVENT COMMUNICATION
   ======================================================== */
const dispatchFilterChange = (escola: string, turma: string, bimestre: string) => {
  localStorage.setItem('sefor3_selected_escola', escola);
  localStorage.setItem('sefor3_selected_turma', turma);
  localStorage.setItem('sefor3_selected_bimestre', bimestre);
  window.dispatchEvent(new Event('sefor3_filter_change'));
};

const getSharedFilters = () => {
  return {
    escola: localStorage.getItem('sefor3_selected_escola') || 'EEM Diva Cabral',
    turma: localStorage.getItem('sefor3_selected_turma') || 'Todos',
    bimestre: localStorage.getItem('sefor3_selected_bimestre') || '1º Bimestre'
  };
};

const getTurmasForSchool = (schoolName: string, customStudents?: any[]): string[] => {
  const resultSet = new Set<string>();
  resultSet.add('Todos');

  // Add default turmas from SEED_TURMAS matching the schoolName
  SEED_TURMAS.forEach(t => {
    if (schoolNamesMatch(t.escolaNome, schoolName)) {
      resultSet.add(t.nome);
    }
  });

  // Add from INITIAL_BUSCA_ATIVA matching the schoolName
  INITIAL_BUSCA_ATIVA.forEach(s => {
    if (schoolNamesMatch(s.escola, schoolName)) {
      resultSet.add(s.turma);
    }
  });

  // Add any from custom/real-time students matching the schoolName
  if (customStudents && Array.isArray(customStudents)) {
    customStudents.forEach(s => {
      if (schoolNamesMatch(s.escola, schoolName) && s.turma) {
        resultSet.add(s.turma);
      }
    });
  }

  // If we still have only "Todos" for other schools, add some standard suggestions
  if (resultSet.size <= 1) {
    resultSet.add('3º Ano A - Matutino');
    resultSet.add('3º Ano B - Vespertino');
    resultSet.add('2º Ano A - Matutino');
    resultSet.add('1º Ano A - Matutino');
  }

  return Array.from(resultSet);
};

/* =======================================================================
   1. SHARED SCOPE FILTER PANEL COMPONENT (COVERS POR ESCOLA, TURMA, BIMESTRE)
   ======================================================================= */
function SifecSharedFilterPanel({ 
  schools, 
  filterEscola, 
  filterTurma, 
  filterBimestre, 
  setFilterEscola, 
  setFilterTurma, 
  setFilterBimestre,
  studentsList
}: {
  schools: any[];
  filterEscola: string;
  filterTurma: string;
  filterBimestre: string;
  setFilterEscola: (e: string) => void;
  setFilterTurma: (t: string) => void;
  setFilterBimestre: (b: string) => void;
  studentsList?: any[];
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-5">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider">Unidade de Ensino / Escola</label>
          <select
            value={filterEscola}
            onChange={(e) => {
              const selectedSc = e.target.value;
              setFilterEscola(selectedSc);
              setFilterTurma('Todos'); // Default to all class
              dispatchFilterChange(selectedSc, 'Todos', filterBimestre);
            }}
            className="w-full md:w-auto px-3.5 py-2.5 bg-white border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
          >
            {schools.map(s => (
              <option key={s.id} value={s.nome}>{s.nome}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider">Turma Sede</label>
          <select
            value={filterTurma}
            onChange={(e) => {
              setFilterTurma(e.target.value);
              dispatchFilterChange(filterEscola, e.target.value, filterBimestre);
            }}
            className="w-full md:w-auto px-3.5 py-2.5 bg-white border border-slate-205 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
          >
            {getTurmasForSchool(filterEscola, studentsList).map(t => (
              <option key={t} value={t}>{t === 'Todos' ? 'Todas as Turmas (Filtro Geral)' : t}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider">Etapa Lançamento</label>
          <select
            value={filterBimestre}
            onChange={(e) => {
              setFilterBimestre(e.target.value);
              dispatchFilterChange(filterEscola, filterTurma, e.target.value);
            }}
            className="w-full md:w-auto px-3.5 py-2.5 bg-white border border-slate-205 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
          >
            <option value="1º Bimestre">1º Bimestre</option>
            <option value="2º Bimestre">2º Bimestre</option>
            <option value="3º Bimestre">3º Bimestre</option>
            <option value="4º Bimestre">4º Bimestre</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-3.5 mt-2 md:mt-0 max-w-sm">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping inline-block shrink-0" />
        <div className="text-left">
          <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wide">Filtros Compartilhados</span>
          <span className="text-[10px] font-bold text-slate-800 block mt-0.5">Mude a Escola ou Bimestre para re-alinhar as abas!</span>
        </div>
      </div>
    </div>
  );
}

/* ========================================================
   2. BUSCA ATIVA / EVASÃO VIEW
   ======================================================== */
export function BuscaAtivaView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [activeSuperId, setActiveSuperId] = useState('all');

  // Filter aligned across components via localStorage/events
  const [filterEscola, setFilterEscola] = useState('EEM Diva Cabral');
  const [filterTurma, setFilterTurma] = useState('Todos');
  const [filterBimestre, setFilterBimestre] = useState('1º Bimestre');

  // Monitor Superintendent changes
  useEffect(() => {
    const handleSuperChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    setActiveSuperId(getActiveSuperintendentId());
    return () => window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
  }, []);

  const visibleSchools = schools.filter(s => isSchoolVisible(s.nome));

  useEffect(() => {
    if (visibleSchools.length > 0) {
      const isCurrentVisible = visibleSchools.some(s => schoolNamesMatch(s.nome, filterEscola));
      if (!isCurrentVisible) {
        setFilterEscola(visibleSchools[0].nome);
      }
    }
  }, [activeSuperId, schools, filterEscola, visibleSchools]);

  // Core structured data holder
  const [students, setStudents] = useState<BuscaAtivaStudent[]>(INITIAL_BUSCA_ATIVA);
  const [grades, setGrades] = useState<any[]>(SEED_GRADES);

  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<BuscaAtivaStudent | null>(null);

  // Form states with structured validation schemas
  const [nome, setNome] = useState('');
  const [escolaForm, setEscolaForm] = useState('EEM Diva Cabral');
  const [turmaForm, setTurmaForm] = useState('3º Ano A - Matutino');
  const [bimestreForm, setBimestreForm] = useState('1º Bimestre');
  const [faltas, setFaltas] = useState('');
  const [risco, setRisco] = useState<'Baixo' | 'Médio' | 'Alto' | 'Crítico'>('Médio');
  const [status, setStatus] = useState('Rastreamento Pendente');
  const [logIntervencao, setLogIntervencao] = useState('');
  const [formError, setFormError] = useState('');

  // Watch Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsFirebaseMode(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Sync schools to feed selectors
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

  // Synchronize cross-view filters on mount and when changed elsewhere
  useEffect(() => {
    const syncFilters = () => {
      const active = getSharedFilters();
      setFilterEscola(active.escola);
      setFilterTurma(active.turma);
      setFilterBimestre(active.bimestre);
    };
    window.addEventListener('sefor3_filter_change', syncFilters);
    syncFilters();
    return () => window.removeEventListener('sefor3_filter_change', syncFilters);
  }, []);

  // Sync student logs and grades
  useEffect(() => {
    if (!isFirebaseMode) {
      const localBa = localStorage.getItem('sefor3_busca_ativa_students');
      if (localBa) {
        setStudents(JSON.parse(localBa));
      } else {
        localStorage.setItem('sefor3_busca_ativa_students', JSON.stringify(INITIAL_BUSCA_ATIVA));
        setStudents(INITIAL_BUSCA_ATIVA);
      }
      return;
    }

    // Subscribe to dynamic Firebase updates
    const unsubSt = subscribeToCollection('busca_ativa', (loaded) => {
      if (loaded.length > 0) {
        setStudents(loaded);
      } else {
        setStudents(INITIAL_BUSCA_ATIVA);
      }
    });

    const unsubGrades = subscribeToCollection('grades', (loaded) => {
      if (loaded.length > 0) {
        setGrades(loaded);
      } else {
        setGrades(SEED_GRADES);
      }
    });

    return () => {
      unsubSt();
      unsubGrades();
    };
  }, [isFirebaseMode]);

  // Helpers to persist data locally or remotely
  const persistStudentsChange = async (updatedList: BuscaAtivaStudent[]) => {
    if (isFirebaseMode) {
      // Elements are synchronized directly within firestore listener
    } else {
      localStorage.setItem('sefor3_busca_ativa_students', JSON.stringify(updatedList));
      setStudents(updatedList);
    }
  };

  const handleUpdateStatus = async (id: string, nextStatus: string) => {
    if (!hasSchoolWriteAccess(filterEscola)) {
      alert('Acesso Negado: Você não tem permissão para gerenciar dados de busca ativa para esta escola.');
      return;
    }

    const nextList = students.map(s => {
      if (s.id === id) {
        return { 
          ...s, 
          status: nextStatus,
          logIntervencao: `Status alterado regionalmente para "${nextStatus}" em ${new Date().toLocaleDateString('pt-BR')}. ` + s.logIntervencao
        };
      }
      return s;
    });

    if (isFirebaseMode) {
      try {
        const studentToUpdate = nextList.find(s => s.id === id);
        if (studentToUpdate) {
          await updateDocument('busca_ativa', id, studentToUpdate);
        }
      } catch (err) {
        console.error('Erro ao atualizar status do estudante no Firebase:', err);
      }
    } else {
      await persistStudentsChange(nextList);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!hasSchoolWriteAccess(filterEscola)) {
      alert('Acesso Negado: Você não tem permissão para remover sinalizações de busca ativa desta escola.');
      return;
    }
    if (window.confirm('Confirma que deseja arquivar ou remover esta sinalização de Busca Ativa?')) {
      if (isFirebaseMode) {
        try {
          await deleteDocument('busca_ativa', id);
        } catch (err) {
          console.error('Erro ao deletar do Firebase:', err);
        }
      } else {
        const filtered = students.filter(s => s.id !== id);
        await persistStudentsChange(filtered);
      }
    }
  };

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setNome('');
    setEscolaForm(filterEscola);
    setTurmaForm(filterTurma === 'Todos' ? '3º Ano A - Matutino' : filterTurma);
    setBimestreForm(filterBimestre);
    setFaltas('');
    setRisco('Médio');
    setStatus('Rastreamento Pendente');
    setLogIntervencao('');
    setFormError('');
    setShowForm(true);
  };

  const handleOpenEdit = (student: BuscaAtivaStudent) => {
    setEditingStudent(student);
    setNome(student.nome);
    setEscolaForm(student.escola);
    setTurmaForm(student.turma);
    setBimestreForm(student.bimestre);
    setFaltas(student.faltasConsecutivas.toString());
    setRisco(student.risco);
    setStatus(student.status);
    setLogIntervencao(student.logIntervencao);
    setFormError('');
    setShowForm(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !faltas.trim() || !escolaForm || !turmaForm || !bimestreForm) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!hasSchoolWriteAccess(escolaForm)) {
      setFormError(`Acesso Negado: Você não tem permissão para gerenciar busca ativa para a escola: ${escolaForm}`);
      return;
    }

    const valueFaltas = parseInt(faltas);
    if (isNaN(valueFaltas) || valueFaltas < 0) {
      setFormError('As faltas consecutivas precisam ser um número maior que zero.');
      return;
    }

    const payload: BuscaAtivaStudent = {
      id: editingStudent ? editingStudent.id : `ba-${Date.now()}`,
      nome,
      escola: escolaForm,
      turma: turmaForm,
      bimestre: bimestreForm,
      faltasConsecutivas: valueFaltas,
      risco,
      status,
      logIntervencao: logIntervencao || 'Sinalização gerada por análise pedagógica regional.'
    };

    if (isFirebaseMode) {
      try {
        if (editingStudent) {
          await updateDocument('busca_ativa', editingStudent.id, payload);
        } else {
          await addDocument('busca_ativa', payload.id, payload);
        }
      } catch (err: any) {
        setFormError('Erro ao gravar dados no Firebase: ' + err.message);
        return;
      }
    } else {
      let nextList = [];
      if (editingStudent) {
        nextList = students.map(s => s.id === editingStudent.id ? payload : s);
      } else {
        nextList = [payload, ...students];
      }
      await persistStudentsChange(nextList);
    }

    setShowForm(false);
    setEditingStudent(null);
  };

  // Import directly from high-risk class list
  const handleImportLowPerformance = (studentName: string) => {
    if (!hasSchoolWriteAccess(filterEscola)) {
      alert('Acesso Negado: Você não tem permissão para importar estudantes para busca ativa desta escola.');
      return;
    }
    setEditingStudent(null);
    setNome(studentName);
    setEscolaForm(filterEscola);
    setTurmaForm(filterTurma === 'Todos' ? '3º Ano A - Matutino' : filterTurma);
    setBimestreForm(filterBimestre);
    setFaltas('5');
    setRisco('Alto');
    setStatus('Rastreamento Pendente');
    setLogIntervencao(`Sinalizado automaticamente devido a rendimento crítico insatisfatório (< 6.0) no ${filterBimestre} na aba do Lançamento de Notas.`);
    setFormError('');
    setShowForm(true);
  };

  // Filtering list based on aligned scope and sorting by "aluno mais infrequente" (highest absences first!)
  const filteredStudents = students.filter(s => {
    const isEscolaMatch = schoolNamesMatch(s.escola, filterEscola);
    const isTurmaMatch = filterTurma === 'Todos' || s.turma === filterTurma;
    const isBimestreMatch = s.bimestre === filterBimestre;
    return isEscolaMatch && isTurmaMatch && isBimestreMatch;
  }).sort((a, b) => b.faltasConsecutivas - a.faltasConsecutivas);

  // Cross-reference data: Find students from SEED_GRADES that belong to the current filtered view and have failing grades but are NOT in current alignment
  const lowPerformanceStudentsNotFlagged = grades.filter(g => {
    // Determine if grade belongs to this school
    // Fase 1G: só a identidade da ESCOLA (lado esquerdo) é normalizada aqui
    // — o substring hack por TURMA (g.turma.includes(...)) é uma mitigação
    // diferente e deliberadamente fora de escopo desta fase, ver
    // docs/plano-migracao-grades-schoolId.md (grades não tem FK de escola).
    const isSchoolMatch = (schoolNamesMatch(filterEscola, 'EEM Diva Cabral') && g.turma.includes('Diva')) ||
                         (schoolNamesMatch(filterEscola, 'EEM Figueiredo Correia') && g.turma.includes('Figueiredo')) ||
                         (schoolNamesMatch(filterEscola, 'EEM José Leopoldino da Silva') && g.turma.includes('Leopoldino')) ||
                         (schoolNamesMatch(filterEscola, 'EEM São Francisco Canindezinho') && g.turma.includes('Canindezinho')) ||
                         (schoolNamesMatch(filterEscola, 'EEMTI Anísio Teixeira') && g.turma.includes('Anísio')) ||
                         (schoolNamesMatch(filterEscola, 'EEMTI Estado do Amazonas') && g.turma.includes('Amazonas')) ||
                         (schoolNamesMatch(filterEscola, 'EEMTI Senador Osires Pontes') && g.turma.includes('Osires'));

    const isTurmaMatch = filterTurma === 'Todos' || g.turma === filterTurma;
    const isBimestreMatch = g.bimestre === filterBimestre;
    const hasLowGrades = g.portugues < 6.0 || g.matematica < 6.0;

    const isAlreadyInBA = students.some(s => s.nome.toLowerCase() === g.nome.toLowerCase() && schoolNamesMatch(s.escola, filterEscola));

    return isSchoolMatch && isTurmaMatch && isBimestreMatch && hasLowGrades && !isAlreadyInBA;
  });

  return (
    <div className="space-y-6">
      {/* Scope Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-rose-700 tracking-wider uppercase font-black font-mono">SEFOR 3 - CONTROLE DE EVASÃO INTEGRADO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Busca Ativa / Estudantes Monitorados</h2>
          <p className="text-xs text-slate-500">Mapeamento de alunos infrequentes com intervenções pontuais articuladas com o Professor Diretor de Turma (PPDT).</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold font-sans transition flex items-center gap-1.5 shadow-md hover:shadow-lg self-start cursor-pointer"
        >
          <Plus size={15} /> Sinalizar Novo Estudante
        </button>
      </div>

      {/* Aligned Selector Component */}
      <SifecSharedFilterPanel 
        schools={visibleSchools}
        filterEscola={filterEscola}
        filterTurma={filterTurma}
        filterBimestre={filterBimestre}
        setFilterEscola={setFilterEscola}
        setFilterTurma={setFilterTurma}
        setFilterBimestre={setFilterBimestre}
        studentsList={students}
      />

      {!hasSchoolWriteAccess(filterEscola) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <Lock className="text-amber-500 shrink-0 mt-0.5 animate-pulse" size={18} />
          <div className="text-left leading-normal text-xs font-medium">
            <strong className="font-extrabold text-amber-950 block text-xs uppercase tracking-wide">Modo de Somente Leitura Ativado</strong>
            Você pode visualizar as fichas de Busca Ativa desta escola, mas apenas o superintendente responsável por <span className="font-extrabold text-amber-950">{filterEscola}</span> pode adicionar, editar registros, preencher relatórios de acompanhamento ou alterar o status de retorno educacional.
          </div>
        </div>
      )}

      {/* Cross-tab intelligent system connection alert: Low Performance students recommend */}
      {lowPerformanceStudentsNotFlagged.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="text-amber-800 shrink-0 mt-0.5" size={17} />
            <div className="text-xs">
              <span className="font-extrabold text-amber-900 block uppercase">Alerta SIFEC: Correlação Notas × Evitação</span>
              <p className="text-amber-800 font-medium mt-0.5">
                Detectamos <strong>{lowPerformanceStudentsNotFlagged.length} aluno(s)</strong> no lançamento oficial de notas deste bimestre com média abaixo do limite crítico (&lt; 6.0). Eles correm alto risco de infrequência e evasão passiva.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {lowPerformanceStudentsNotFlagged.slice(0, 2).map(g => (
              <button
                key={g.id}
                onClick={() => handleImportLowPerformance(g.nome)}
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white text-[10px] font-black uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                Sinalizar {g.nome.split(' ')[0]} <ArrowRight size={10} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Student List Section */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="text-rose-700 shrink-0" size={16} />
            <span className="text-xs font-black text-slate-700 uppercase tracking-wide">
              Foco Atual: {filterEscola} • {filterTurma === 'Todos' ? 'Todas as Turmas' : filterTurma} • {filterBimestre}
            </span>
          </div>
          <span className="text-[10px] uppercase font-black text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded border border-rose-150 font-mono">
            {filteredStudents.length} Fichas de Busca Ativa neste Escopo
          </span>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto">
              <UserCheck size={20} />
            </div>
            <h4 className="text-xs font-bold text-slate-800 uppercase mt-2">Nenhum Aluno Infrequente Encontrado</h4>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              O status das chamadas desta turma no {filterBimestre} está em perfeita consonância, ou os filtros escolhidos não retornaram sinalizações.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <th className="py-3 px-6">Estudante Sinalizado</th>
                  <th className="py-3 px-6">Ano / Turma Sede</th>
                  <th className="py-3 px-6 text-center">Faltas no Bimestre</th>
                  <th className="py-3 px-6 text-center">Grau de Alerta</th>
                  <th className="py-3 px-6">Intervenção Aplicada / Status</th>
                  <th className="py-3 px-6 text-right">Ações Corretivas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {filteredStudents.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-extrabold text-slate-900 text-sm">{s.nome}</div>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">Ficha ID: {s.id} • {s.bimestre}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-600">
                      <div className="font-bold text-slate-850">{s.turma}</div>
                      <span className="text-[9px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                        <MapPin size={9} />
                        {s.escola}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center font-mono font-bold text-slate-805">
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-150 rounded text-[11px] font-black">
                        {s.faltasConsecutivas} faltas
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                        s.risco === 'Crítico' 
                          ? 'bg-red-50 border-red-220 text-red-700' 
                          : s.risco === 'Alto'
                          ? 'bg-rose-50 border-rose-220 text-rose-700'
                          : s.risco === 'Médio'
                          ? 'bg-amber-50 border-amber-220 text-amber-700'
                          : 'bg-emerald-50 border-emerald-220 text-emerald-700'
                      }`}>
                        {s.risco}
                      </span>
                    </td>
                    <td className="py-4 px-6 max-w-xs">
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-700 inline-block shrink-0" />
                        {s.status}
                      </div>
                      <p className="text-[10px] text-slate-450 italic mt-0.5 line-clamp-2" title={s.logIntervencao}>
                        "{s.logIntervencao}"
                      </p>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        {hasSchoolWriteAccess(filterEscola) ? (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(s.id, 'Contato Estabelecido (PPDT)')}
                              className="px-2.5 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 text-[10px] font-extrabold rounded-lg transition uppercase cursor-pointer"
                            >
                              Resolver Contato
                            </button>
                            <button
                              onClick={() => handleOpenEdit(s)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-650 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                              title="Editar Cadastro"
                            >
                              <Edit size={11} /> <span className="text-[10px] font-bold">Editar</span>
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(s.id)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-150 text-rose-700 rounded-lg transition inline-flex items-center cursor-pointer"
                              title="Remover Ficha"
                            >
                              <Trash2 size={11} />
                            </button>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[9px] bg-slate-50 border border-slate-200 px-2 py-1 rounded" title="Permissão restrita de edição para esta unidade">
                            <Lock size={10} className="text-amber-500" />
                            Apenas Leitura
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-700 rounded-full animate-pulse" />
                  {editingStudent ? 'Editar Sinalização de Evasão' : 'Nova Sinalização Integrada'}
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">Controle de intervenção imediata para retorno educacional no Ceará.</p>
              </div>
              <button 
                onClick={() => { setShowForm(false); setEditingStudent(null); }} 
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-401 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-220 text-rose-700 rounded-xl text-xs font-bold leading-normal">
                  {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Nome Completo do Aluno *</label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 text-xs rounded-xl font-bold text-slate-850"
                  placeholder="Ex: Amanda Maria Sousa da Silva"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Escola Alocada *</label>
                  <select
                    value={escolaForm}
                    onChange={(e) => setEscolaForm(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800"
                  >
                    {schools.map((s) => (
                      <option key={s.id} value={s.nome}>{s.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Turma *</label>
                  <input
                    type="text"
                    required
                    value={turmaForm}
                    onChange={(e) => setTurmaForm(e.target.value)}
                    list="form-turma-options"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    placeholder="Ex: 3º Ano A - Matutino"
                  />
                  <datalist id="form-turma-options">
                    {getTurmasForSchool(escolaForm, students)
                      .filter(t => t !== 'Todos')
                      .map((t) => (
                        <option key={t} value={t} />
                      ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Bimestre Ocorrido *</label>
                  <select
                    value={bimestreForm}
                    onChange={(e) => setBimestreForm(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800"
                  >
                    <option value="1º Bimestre">1º Bimestre</option>
                    <option value="2º Bimestre">2º Bimestre</option>
                    <option value="3º Bimestre">3º Bimestre</option>
                    <option value="4º Bimestre">4º Bimestre</option>
                  </select>
                </div>

                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Faltas Consecutivas Identificadas *</label>
                  <input
                    type="number"
                    required
                    value={faltas}
                    onChange={(e) => setFaltas(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 text-xs rounded-xl font-mono font-bold text-slate-800"
                    placeholder="Quantidade de ausências"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Nível de Risco e Alerta *</label>
                  <select
                    value={risco}
                    onChange={(e) => setRisco(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800"
                  >
                    <option value="Baixo">Baixo</option>
                    <option value="Médio">Médio</option>
                    <option value="Alto">Alto</option>
                    <option value="Crítico">Crítico</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Situação da Intervenção *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-800"
                  >
                    <option value="Rastreamento Pendente">Rastreamento Pendente</option>
                    <option value="Família Contatada">Família Contatada</option>
                    <option value="Visita Residencial Planejada">Visita Residencial Planejada</option>
                    <option value="Visita Domiciliar Agendada">Visita Domiciliar Agendada</option>
                    <option value="Contato Estabelecido (PPDT)">Contato Estabelecido (PPDT)</option>
                    <option value="Resolvido (Retornou)">Resolvido (Retornou)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Histórico de Contatos e Observações</label>
                <textarea
                  value={logIntervencao}
                  onChange={(e) => setLogIntervencao(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 text-xs rounded-xl text-slate-850"
                  placeholder="Registre tentativas de contatos, justificativas alegadas, decisões de reuniões com responsáveis ou providências do PPDT..."
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingStudent(null); }}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase rounded-xl transition shadow-sm cursor-pointer"
                >
                  Salvar Ficha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Fase 1G: `coordinators` é um mapa indexado pelo nome de exibição da
// escola — uma divergência de caixa/espaço/acento entre a chave gravada e
// `filterEscola` (nome vindo do documento real de `schools`) faz a consulta
// exata falhar silenciosamente e cair no "Coordenador Não Configurado".
// Procura por igualdade normalizada em vez de acesso direto por chave.
function findCoordinatorEntry<T>(map: Record<string, T>, schoolName: string): T | undefined {
  const key = Object.keys(map).find(k => schoolNamesMatch(k, schoolName));
  return key !== undefined ? map[key] : undefined;
}

/* ========================================================
   3. PPDT & COORDENAÇÃO VIEW
   ======================================================== */
export function PpdtView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [activeSuperId, setActiveSuperId] = useState('all');

  // Selected filters aligned across SIFEC via shared tab communication
  const [filterEscola, setFilterEscola] = useState('EEM Diva Cabral');

  // Monitor Superintendent changes
  useEffect(() => {
    const handleSuperChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    setActiveSuperId(getActiveSuperintendentId());
    return () => window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
  }, []);

  const visibleSchools = schools.filter(s => isSchoolVisible(s.nome));

  useEffect(() => {
    if (visibleSchools.length > 0) {
      const isCurrentVisible = visibleSchools.some(s => schoolNamesMatch(s.nome, filterEscola));
      if (!isCurrentVisible) {
        setFilterEscola(visibleSchools[0].nome);
      }
    }
  }, [activeSuperId, schools, filterEscola, visibleSchools]);
  const [filterBimestre, setFilterBimestre] = useState('1º Bimestre');

  // PDT Coordinator per school
  const [coordinators, setCoordinators] = useState<Record<string, { nome: string; email: string; telefone: string }>>({
    'EEM Diva Cabral': { nome: 'Prof. Ricardo Gomes de Albuquerque', email: 'ricardo.albuquerque@sefor3.org', telefone: '(85) 98765-4321' },
    'EEM Figueiredo Correia': { nome: 'Profa. Cleide Maria Pinheiro', email: 'cleide.pinheiro@sefor3.org', telefone: '(85) 98888-2222' },
    'EEM José Leopoldino da Silva': { nome: 'Prof. Marcus Aurélio Fernandes', email: 'marcus.fernandes@sefor3.org', telefone: '(85) 98777-3333' },
    'EEM São Francisco Canindezinho': { nome: 'Prof. Sânzio Vasconcelos', email: 'sanzio.vasconcelos@sefor3.org', telefone: '(85) 98111-4444' },
    'EEMTI Anísio Teixeira': { nome: 'Profa. Ana Beatriz de Castro', email: 'ana.castro@sefor3.org', telefone: '(85) 98222-5555' },
    'EEMTI Estado do Amazonas': { nome: 'Prof. Francisco de Assis Moura', email: 'assis.moura@sefor3.org', telefone: '(85) 98333-6666' },
    'EEMTI Senador Osires Pontes': { nome: 'Profa. Luciana Maria Rocha', email: 'luciana.rocha@sefor3.org', telefone: '(85) 98444-7777' }
  });

  // Action plan list for PDTs
  const [actions, setActions] = useState<Array<{ id: string; escola: string; bimestre: string; acao: string; responsavel: string; status: 'Planejado' | 'Em Execução' | 'Concluído'; progresso: number }>>([
    // EEM Diva Cabral
    { id: 'ppdt-diva-1', escola: 'EEM Diva Cabral', bimestre: '1º Bimestre', acao: 'Acolhimento socioemocional de alunos infrequentes', responsavel: 'Prof. Ricardo Gomes', status: 'Concluído', progresso: 100 },
    { id: 'ppdt-diva-2', escola: 'EEM Diva Cabral', bimestre: '1º Bimestre', acao: 'Reunião de nivelamento de boletins com direção adjunta', responsavel: 'PPDTs do 3º Ano', status: 'Concluído', progresso: 100 },
    { id: 'ppdt-diva-3', escola: 'EEM Diva Cabral', bimestre: '1º Bimestre', acao: 'Busca ativa dirigida com assistentes da Sefor 3', responsavel: 'PPDT Geral Diva Cabral', status: 'Em Execução', progresso: 75 },
    { id: 'ppdt-diva-4', escola: 'EEM Diva Cabral', bimestre: '2º Bimestre', acao: 'Plantões de estudos preventivos no contraturno', responsavel: 'Professores Orientadores', status: 'Planejado', progresso: 10 },
    
    // EEM Figueiredo Correia
    { id: 'ppdt-fig-1', escola: 'EEM Figueiredo Correia', bimestre: '1º Bimestre', acao: 'Oficinas de coesão textual em tutoria mútua', responsavel: 'Profa. Cleide Pinheiro', status: 'Concluído', progresso: 100 },
    { id: 'ppdt-fig-2', escola: 'EEM Figueiredo Correia', bimestre: '1º Bimestre', acao: 'Mobilização pedagógica do Enem no pátio', responsavel: 'Gestão Figueiredo', status: 'Em Execução', progresso: 60 },

    // EEM José Leopoldino
    { id: 'ppdt-leo-1', escola: 'EEM José Leopoldino da Silva', bimestre: '1º Bimestre', acao: 'Contato telefônico emergencial com pais de infrequentes', responsavel: 'Prof. Marcus Fernandes', status: 'Concluído', progresso: 100 }
  ]);

  // Form states
  const [showCoordForm, setShowCoordForm] = useState(false);
  const [coordNome, setCoordNome] = useState('');
  const [coordEmail, setCoordEmail] = useState('');
  const [coordTel, setCoordTel] = useState('');

  const [showActForm, setShowActForm] = useState(false);
  const [editingAct, setEditingAct] = useState<any | null>(null);
  const [formAcao, setFormAcao] = useState('');
  const [formResp, setFormResp] = useState('');
  const [formStatus, setFormStatus] = useState<'Planejado' | 'Em Execução' | 'Concluído'>('Planejado');
  const [formProgresso, setFormProgresso] = useState(0);
  const [formError, setFormError] = useState('');

  // Watch Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsFirebaseMode(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Sync schools with shared SEED_SCHOOLS
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

  // Sync and coordinate filters
  useEffect(() => {
    const syncFilters = () => {
      const active = getSharedFilters();
      setFilterEscola(active.escola);
      setFilterBimestre(active.bimestre);
    };
    window.addEventListener('sefor3_filter_change', syncFilters);
    syncFilters();
    return () => window.removeEventListener('sefor3_filter_change', syncFilters);
  }, []);

  // Sync coordinators and actions from local storage / Firebase
  useEffect(() => {
    const localCoord = localStorage.getItem('sefor3_ppdt_coordinators');
    if (localCoord) {
      setCoordinators(JSON.parse(localCoord));
    }

    const localActions = localStorage.getItem('sefor3_ppdt_actions');
    if (localActions) {
      setActions(JSON.parse(localActions));
    } else {
      localStorage.setItem('sefor3_ppdt_actions', JSON.stringify(actions));
    }
  }, []);

  const persistCoordinators = (updated: any) => {
    localStorage.setItem('sefor3_ppdt_coordinators', JSON.stringify(updated));
    setCoordinators(updated);
  };

  const persistActions = (updated: any) => {
    localStorage.setItem('sefor3_ppdt_actions', JSON.stringify(updated));
    setActions(updated);
  };

  const handleOpenEditCoord = () => {
    const active = findCoordinatorEntry(coordinators, filterEscola) || { nome: '', email: '', telefone: '' };
    setCoordNome(active.nome);
    setCoordEmail(active.email);
    setCoordTel(active.telefone);
    setShowCoordForm(true);
  };

  const handleSaveCoordinator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordNome.trim() || !coordEmail.trim()) return;

    if (!hasSchoolWriteAccess(filterEscola)) {
      alert('Acesso Negado: Você não tem permissão para editar os dados do coordenador desta escola.');
      return;
    }

    // Remove qualquer chave pré-existente que já representa esta mesma
    // escola sob outra grafia (Fase 1G), pra não deixar uma entrada órfã
    // duplicada ao lado da nova gravada com a grafia atual de filterEscola.
    const nextCoord = { ...coordinators };
    const staleKey = Object.keys(nextCoord).find(k => schoolNamesMatch(k, filterEscola));
    if (staleKey !== undefined && staleKey !== filterEscola) {
      delete nextCoord[staleKey];
    }
    nextCoord[filterEscola] = {
      nome: coordNome,
      email: coordEmail,
      telefone: coordTel
    };
    persistCoordinators(nextCoord);
    setShowCoordForm(false);
  };

  const handleOpenAddAction = () => {
    setEditingAct(null);
    setFormAcao('');
    setFormResp(findCoordinatorEntry(coordinators, filterEscola)?.nome || 'Coordenador PDT');
    setFormStatus('Planejado');
    setFormProgresso(0);
    setFormError('');
    setShowActForm(true);
  };

  const handleOpenEditAction = (act: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAct(act);
    setFormAcao(act.acao);
    setFormResp(act.responsavel);
    setFormStatus(act.status);
    setFormProgresso(act.progresso);
    setFormError('');
    setShowActForm(true);
  };

  const handleSaveAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAcao.trim() || !formResp.trim()) {
      setFormError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (!hasSchoolWriteAccess(filterEscola)) {
      setFormError('Acesso Negado: Você não tem permissão para cadastrar ou editar ações desta escola.');
      return;
    }

    const payload = {
      id: editingAct ? editingAct.id : `ppdt-act-${Date.now()}`,
      escola: filterEscola,
      bimestre: filterBimestre,
      acao: formAcao,
      responsavel: formResp,
      status: formStatus,
      progresso: formStatus === 'Concluído' ? 100 : Number(formProgresso)
    };

    let nextActions = [];
    if (editingAct) {
      nextActions = actions.map(a => a.id === editingAct.id ? payload : a);
    } else {
      nextActions = [payload, ...actions];
    }

    persistActions(nextActions);
    setShowActForm(false);
    setEditingAct(null);
  };

  const handleDeleteAction = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasSchoolWriteAccess(filterEscola)) {
      alert('Acesso Negado: Você não tem permissão para excluir ações desta escola.');
      return;
    }
    if (window.confirm('Confirma a remoção desta ação do plano bimestral de PDTs?')) {
      const remaining = actions.filter(a => a.id !== id);
      persistActions(remaining);
    }
  };

  const getFilteredActions = () => {
    return actions.filter(a => schoolNamesMatch(a.escola, filterEscola) && a.bimestre === filterBimestre);
  };

  const activeCoordinator = findCoordinatorEntry(coordinators, filterEscola) || {
    nome: 'Coordenador Não Configurado',
    email: 'pendente@sefor3.org',
    telefone: '(85) 99999-9999'
  };

  const filteredActs = getFilteredActions();

  // Dynamic status badges
  const getActStatusBadge = (status: string) => {
    if (status === 'Concluído') return 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold';
    if (status === 'Em Execução') return 'bg-blue-50 border-blue-200 text-blue-700';
    return 'bg-slate-100 border-slate-200 text-slate-500';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-blue-700 tracking-wider uppercase font-black font-mono">SEFOR 3 - PROFESSOR DIRETOR DE TURMA</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Coordenação dos PDTs</h2>
          <p className="text-xs text-slate-500 font-normal">Supervisione as atividades bimestrais de acompanhamento, chamadas e visitas pedagógicas dos PDTs de cada escola.</p>
        </div>
      </div>

      {/* Shared Filter Select Alignment Panel */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-5">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider">Unidade Escolar</label>
            <select
              value={filterEscola}
              onChange={(e) => {
                const selectedSc = e.target.value;
                setFilterEscola(selectedSc);
                dispatchFilterChange(selectedSc, 'Todos', filterBimestre);
              }}
              className="px-3.5 py-2.5 bg-white border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition max-w-[280px]"
            >
              {visibleSchools.map(s => (
                <option key={s.id} value={s.nome}>{s.nome}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-500 block tracking-wider">Plano de Ações Bimestral</label>
            <select
              value={filterBimestre}
              onChange={(e) => {
                setFilterBimestre(e.target.value);
                dispatchFilterChange(filterEscola, 'Todos', e.target.value);
              }}
              className="px-3.5 py-2.5 bg-white border border-slate-200 text-xs font-bold rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
            >
              <option value="1º Bimestre">1º Bimestre</option>
              <option value="2º Bimestre">2º Bimestre</option>
              <option value="3º Bimestre">3º Bimestre</option>
              <option value="4º Bimestre">4º Bimestre</option>
            </select>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-3 rounded-2xl flex items-center gap-3 mt-2 md:mt-0 max-w-sm">
          <CheckCircle className="text-blue-650 shrink-0" size={18} />
          <div className="text-left">
            <span className="text-[9px] font-extrabold uppercase text-slate-400 block tracking-wide">PPDT Sincronizado</span>
            <span className="text-[10px] font-bold text-slate-800 block mt-0.5">Vinculado a <strong>{filterEscola}</strong></span>
          </div>
        </div>
      </div>

      {!hasSchoolWriteAccess(filterEscola) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <Lock className="text-amber-500 shrink-0 mt-0.5 animate-pulse" size={18} />
          <div className="text-left leading-normal text-xs font-medium">
            <strong className="font-extrabold text-amber-950 block text-xs uppercase tracking-wide">Modo de Somente Leitura Ativado</strong>
            Você pode visualizar o plano bimestral do Diretor de Turma (PPDT) desta escola, mas apenas o superintendente responsável por <span className="font-extrabold text-amber-950">{filterEscola}</span> pode editar perfil do coordenador, adicionar novas ações ou alterar o status das diretrizes.
          </div>
        </div>
      )}

      {/* Coordinator Details Card */}
      <div className="bg-white border border-slate-200/90 p-5 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-700 text-white flex items-center justify-center font-black text-sm tracking-tighter shrink-0 font-serif shadow-inner">
            PPDT
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-150 tracking-wider inline-block">Coordenador de PDTs da Unidade</span>
            <h4 className="text-base font-black text-slate-900 mt-1">{activeCoordinator.nome}</h4>
            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-3 mt-1 flex-wrap">
              <span className="font-mono">E-mail: {activeCoordinator.email}</span>
              <span>•</span>
              <span className="font-mono">Contato: {activeCoordinator.telefone}</span>
            </div>
          </div>
        </div>

        {hasSchoolWriteAccess(filterEscola) ? (
          <button
            onClick={handleOpenEditCoord}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-blue-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 shadow-sm cursor-pointer"
          >
            <Edit size={12} /> Editar Coordenador
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-slate-550 font-mono text-[11px] bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl block shrink-0" title="Apenas o superintendente responsável pode mapear a coordenação">
            <Lock size={12} className="text-amber-500" />
            Perfil Restrito
          </span>
        )}
      </div>

      {/* Bimonthly Action Plan for PDTs */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Ações do Plano Bimestral PDT ({filterBimestre})</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Roteiro de ações ativas e agendamentos executados especificamente pelo coordenador e PPDTs auxiliares.</p>
          </div>

          {hasSchoolWriteAccess(filterEscola) && (
            <button
              onClick={handleOpenAddAction}
              className="px-3.5 py-2 bg-blue-700 hover:bg-blue-850 text-white rounded-xl text-xs font-black uppercase transition flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} /> Nova Ação PDT
            </button>
          )}
        </div>

        {filteredActs.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl max-w-full">
            <Clock className="text-slate-400 mx-auto mb-2" size={24} />
            <h4 className="font-extrabold text-slate-800 uppercase text-xs">Nenhuma Ação Mapeada</h4>
            <p className="text-[11px] text-slate-405 mt-1 max-w-md mx-auto">
              Nenhuma ação PPDT está planejada para esta escola no <strong>{filterBimestre}</strong>. Clique em "Nova Ação PDT" para adicionar uma rotina de acompanhamento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Iniciativa / Ação do PDT</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Progresso</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredActs.map(act => (
                  <tr key={act.id} className="hover:bg-slate-50/30 transition">
                    <td className="py-4 px-4 font-bold text-slate-900 text-sm max-w-sm">
                      {act.acao}
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-600">
                      {act.responsavel}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase border inline-block ${getActStatusBadge(act.status)}`}>
                        {act.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-3.5">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div className="bg-blue-700 h-full transition-all" style={{ width: `${act.progresso}%` }} />
                        </div>
                        <span className="font-mono text-[11px] font-black">{act.progresso}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        {hasSchoolWriteAccess(filterEscola) ? (
                          <>
                            <button
                              onClick={(e) => handleOpenEditAction(act, e)}
                              className="p-1 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit size={10} /> Editar
                            </button>
                            <button
                              onClick={(e) => handleDeleteAction(act.id, e)}
                              className="p-1 text-rose-750 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[9px] bg-slate-50 border border-slate-200 px-2 py-1 rounded" title="Apenas o coordenador da escola pode efetuar novos registros">
                            <Lock size={10} className="text-amber-500" />
                            Apenas Leitura
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Coordinator Modal Popup */}
      {showCoordForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl relative">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase">Editar Coordenador do PDT</h4>
                <p className="text-[10px] text-slate-500">{filterEscola}</p>
              </div>
              <button onClick={() => setShowCoordForm(false)} className="text-slate-401 hover:text-slate-650">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCoordinator} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Nome do Coordenador Geral *</label>
                <input
                  type="text"
                  required
                  value={coordNome}
                  onChange={(e) => setCoordNome(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-850"
                  placeholder="Ex: Prof. Roberto de Oliveira"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">E-mail corporativo *</label>
                <input
                  type="email"
                  required
                  value={coordEmail}
                  onChange={(e) => setCoordEmail(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-mono rounded-xl text-slate-850"
                  placeholder="Ex: roberto@sefor3.org"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Telefone de Contato</label>
                <input
                  type="text"
                  value={coordTel}
                  onChange={(e) => setCoordTel(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-mono rounded-xl text-slate-850"
                  placeholder="Ex: (85) 99999-9999"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCoordForm(false)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs uppercase rounded-xl transition cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / New Action Modal Popup */}
      {showActForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase">
                  {editingAct ? 'Editar Iniciativa PDT' : 'Adicionar Nova Iniciativa ao Plano'}
                </h4>
                <p className="text-[10px] text-slate-500">{filterEscola} • {filterBimestre}</p>
              </div>
              <button onClick={() => setShowActForm(false)} className="text-slate-401 hover:text-slate-650">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAction} className="p-5 space-y-4">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold">
                  {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Iniciativa / Nome da Ação *</label>
                <input
                  type="text"
                  required
                  value={formAcao}
                  onChange={(e) => setFormAcao(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-850"
                  placeholder="Ex: Reunião com responsáveis de alunos sinalizados na Busca Ativa"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Profissional Responsável *</label>
                <input
                  type="text"
                  required
                  value={formResp}
                  onChange={(e) => setFormResp(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-850"
                  placeholder="Ex: Prof. Ricardo / Tutores do 3º Ano"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Status da Execução *</label>
                  <select
                    value={formStatus}
                    onChange={(e) => {
                      const nextSt = e.target.value as any;
                      setFormStatus(nextSt);
                      if (nextSt === 'Concluído') setFormProgresso(100);
                      else if (nextSt === 'Planejado') setFormProgresso(0);
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl text-slate-805 text-slate-850"
                  >
                    <option value="Planejado">Planejado</option>
                    <option value="Em Execução">Em Execução</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase text-slate-700 block">Progresso Real (%)</label>
                    <span className="text-[10px] font-mono font-black text-blue-700">{formProgresso}%</span>
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
                        setFormStatus('Planejado');
                      } else {
                        setFormStatus('Em Execução');
                      }
                    }}
                    className="w-full h-2 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-blue-650 mt-2.5"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowActForm(false)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs uppercase rounded-xl transition cursor-pointer"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================
   4. RECOMPOSIÇÃO DE APRENDIZAGEM VIEW
   ======================================================== */
export function RecomposicaoView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [activeSuperId, setActiveSuperId] = useState('all');

  // Filter aligned across components via localStorage/events
  const [filterEscola, setFilterEscola] = useState('EEM Diva Cabral');

  // Monitor Superintendent changes
  useEffect(() => {
    const handleSuperChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleSuperChange);
    setActiveSuperId(getActiveSuperintendentId());
    return () => window.removeEventListener('sefor3_active_superintendent_change', handleSuperChange);
  }, []);

  const visibleSchools = schools.filter(s => isSchoolVisible(s.nome));

  useEffect(() => {
    if (visibleSchools.length > 0) {
      const isCurrentVisible = visibleSchools.some(s => schoolNamesMatch(s.nome, filterEscola));
      if (!isCurrentVisible) {
        setFilterEscola(visibleSchools[0].nome);
      }
    }
  }, [activeSuperId, schools, filterEscola, visibleSchools]);
  const [filterTurma, setFilterTurma] = useState('Todos');
  const [filterBimestre, setFilterBimestre] = useState('1º Bimestre');

  // Core structured recomposição data holder
  const [recomposicaos, setRecomposicaos] = useState<RecomposicaoItem[]>(INITIAL_RECOMPOSICAO);
  
  // States to read grades and active busca ativa student count for alerts of cohesive tabs
  const [grades, setGrades] = useState<any[]>(SEED_GRADES);
  const [baStudents, setBaStudents] = useState<BuscaAtivaStudent[]>(INITIAL_BUSCA_ATIVA);

  // Editor states
  const [editingItem, setEditingItem] = useState<RecomposicaoItem | null>(null);
  const [editDescricao, setEditDescricao] = useState('');
  const [editFocoIntervencao, setEditFocoIntervencao] = useState('');
  const [editProgresso, setEditProgresso] = useState(50);
  const [errorMsg, setErrorMsg] = useState('');

  // Watch Auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsFirebaseMode(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Sync schools to feed selectors
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

  // Synchronize cross-view filters on mount and when changed elsewhere
  useEffect(() => {
    const syncFilters = () => {
      const active = getSharedFilters();
      setFilterEscola(active.escola);
      setFilterTurma(active.turma);
      setFilterBimestre(active.bimestre);
    };
    window.addEventListener('sefor3_filter_change', syncFilters);
    syncFilters();
    return () => window.removeEventListener('sefor3_filter_change', syncFilters);
  }, []);

  // Sync data
  useEffect(() => {
    if (!isFirebaseMode) {
      // Load local state
      const localRec = localStorage.getItem('sefor3_recomposicao');
      if (localRec) {
        setRecomposicaos(JSON.parse(localRec));
      } else {
        localStorage.setItem('sefor3_recomposicao', JSON.stringify(INITIAL_RECOMPOSICAO));
        setRecomposicaos(INITIAL_RECOMPOSICAO);
      }

      const localBa = localStorage.getItem('sefor3_busca_ativa_students');
      if (localBa) setBaStudents(JSON.parse(localBa));

      return;
    }

    // Subscribe to dynamic Firebase updates
    const unsubRec = subscribeToCollection('recomposicao', (loaded) => {
      if (loaded.length > 0) {
        setRecomposicaos(loaded);
      } else {
        setRecomposicaos(INITIAL_RECOMPOSICAO);
      }
    });

    const unsubBa = subscribeToCollection('busca_ativa', (loaded) => {
      if (loaded.length > 0) setBaStudents(loaded);
    });

    const unsubGrades = subscribeToCollection('grades', (loaded) => {
      if (loaded.length > 0) setGrades(loaded);
    });

    return () => {
      unsubRec();
      unsubBa();
      unsubGrades();
    };
  }, [isFirebaseMode]);

  // Helper to retrieve/generate items for selected combination so that no slot is blank!
  const getAlignedPlans = (): RecomposicaoItem[] => {
    // We expect the selected class filter. Since 'Todos' can be selected, we fallback to '3º Ano A - Matutino' to show a specific representative plan in Recomposição
    const targetTurma = filterTurma === 'Todos' ? '3º Ano A - Matutino' : filterTurma;
    
    // Find already stored custom plans
    const filtered = recomposicaos.filter(
      r => schoolNamesMatch(r.escola, filterEscola) && r.turma === targetTurma && r.bimestre === filterBimestre
    );

    if (filtered.length > 0) {
      return filtered;
    }

    // Generate high-quality realistic defaults on-the-fly to guarantee everything is editable and has content
    return [
      {
        id: `rec-pt-${filterEscola}-${targetTurma}-${filterBimestre}`.replace(/\s+/g, '-'),
        escola: filterEscola,
        turma: targetTurma,
        bimestre: filterBimestre,
        disciplina: 'Língua Portuguesa',
        descricao: `Plano estrutural de reposição rápida em Língua Portuguesa para os alunos da turma ${targetTurma} no ${filterBimestre}. Foco nas proficiências prioritárias do SPAECE.`,
        focoIntervencao: 'D4 - Distinguir um fato da opinião em textos informativos.',
        progresso: 45
      },
      {
        id: `rec-mat-${filterEscola}-${targetTurma}-${filterBimestre}`.replace(/\s+/g, '-'),
        escola: filterEscola,
        turma: targetTurma,
        bimestre: filterBimestre,
        disciplina: 'Matemática',
        descricao: `Roteiros semanais de reforço focado em sistemas lineares aplicados a problemas concretos para a turma ${targetTurma} no ${filterBimestre}.`,
        focoIntervencao: 'D16 - Resolver problemas envolvendo equações e inequações de 1º grau.',
        progresso: 35
      }
    ];
  };

  const handleOpenEditPlan = (plan: RecomposicaoItem) => {
    setEditingItem(plan);
    setEditDescricao(plan.descricao);
    setEditFocoIntervencao(plan.focoIntervencao);
    setEditProgresso(plan.progresso);
    setErrorMsg('');
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!hasSchoolWriteAccess(filterEscola)) {
      setErrorMsg('Acesso Negado: Você não tem permissão para editar os dados de recomposição desta escola.');
      return;
    }

    if (!editDescricao.trim() || !editFocoIntervencao.trim()) {
      setErrorMsg('Por favor, preencha todos os campos do plano de recomposição.');
      return;
    }

    const updatedPayload: RecomposicaoItem = {
      ...editingItem,
      descricao: editDescricao,
      focoIntervencao: editFocoIntervencao,
      progresso: Number(editProgresso)
    };

    if (isFirebaseMode) {
      try {
        await updateDocument('recomposicao', updatedPayload.id, updatedPayload);
      } catch (err: any) {
        setErrorMsg('Erro ao gravar plano no Firebase: ' + err.message);
        return;
      }
    } else {
      // Save local
      const isExistInStore = recomposicaos.some(r => r.id === updatedPayload.id);
      let nextStore = [];
      if (isExistInStore) {
        nextStore = recomposicaos.map(r => r.id === updatedPayload.id ? updatedPayload : r);
      } else {
        nextStore = [...recomposicaos, updatedPayload];
      }
      localStorage.setItem('sefor3_recomposicao', JSON.stringify(nextStore));
      setRecomposicaos(nextStore);
    }

    setEditingItem(null);
  };

  // Cohesive feature: Count active Busca Ativa students under selected school + class + bimester
  const targetTurmaForChecks = filterTurma === 'Todos' ? '3º Ano A - Matutino' : filterTurma;
  const activeBaCount = baStudents.filter(
    s => schoolNamesMatch(s.escola, filterEscola) && s.turma === targetTurmaForChecks && s.bimestre === filterBimestre
  ).length;

  const bimesterCriticalRisco = baStudents.some(
    s => schoolNamesMatch(s.escola, filterEscola) && s.turma === targetTurmaForChecks && s.bimestre === filterBimestre && (s.risco === 'Crítico' || s.risco === 'Alto')
  );

  // Cohesive feature: Fetch average grades from same selected class/bimester (from SEED_GRADES fallback/grades)
  const activeClassGrades = grades.filter(g => {
    // Fase 1G: só a identidade da ESCOLA (lado esquerdo) é normalizada aqui
    // — o substring hack por TURMA (g.turma.includes(...)) é uma mitigação
    // diferente e deliberadamente fora de escopo desta fase, ver
    // docs/plano-migracao-grades-schoolId.md (grades não tem FK de escola).
    const isSchoolMatch = (schoolNamesMatch(filterEscola, 'EEM Diva Cabral') && g.turma.includes('Diva')) ||
                         (schoolNamesMatch(filterEscola, 'EEM Figueiredo Correia') && g.turma.includes('Figueiredo')) ||
                         (schoolNamesMatch(filterEscola, 'EEM José Leopoldino da Silva') && g.turma.includes('Leopoldino')) ||
                         (schoolNamesMatch(filterEscola, 'EEM São Francisco Canindezinho') && g.turma.includes('Canindezinho')) ||
                         (schoolNamesMatch(filterEscola, 'EEMTI Anísio Teixeira') && g.turma.includes('Anísio')) ||
                         (schoolNamesMatch(filterEscola, 'EEMTI Estado do Amazonas') && g.turma.includes('Amazonas')) ||
                         (schoolNamesMatch(filterEscola, 'EEMTI Senador Osires Pontes') && g.turma.includes('Osires'));

    const isTurmaMatch = g.turma === targetTurmaForChecks;
    const isBimestreMatch = g.bimestre === filterBimestre;
    return isSchoolMatch && isTurmaMatch && isBimestreMatch;
  });

  const avgPortuguesValue = activeClassGrades.length > 0 
    ? Number((activeClassGrades.reduce((sum, g) => sum + g.portugues, 0) / activeClassGrades.length).toFixed(1))
    : 6.2;

  const avgMatematicaValue = activeClassGrades.length > 0 
    ? Number((activeClassGrades.reduce((sum, g) => sum + g.matematica, 0) / activeClassGrades.length).toFixed(1))
    : 5.8;

  return (
    <div className="space-y-6">
      {/* Scope Header */}
      <div>
        <span className="text-[10px] text-orange-700 tracking-wider uppercase font-black font-mono font-sans">SEFOR 3 - CICLO DE ENSINO ACELERADO</span>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Recomposição de Aprendizagem</h2>
        <p className="text-xs text-slate-500">Desenho e calibração de rotas de reforço com base nos descritores críticos do SPAECE para Língua Portuguesa e Matemática.</p>
      </div>

      {/* Aligned Selector Component */}
      <SifecSharedFilterPanel 
        schools={visibleSchools}
        filterEscola={filterEscola}
        filterTurma={filterTurma}
        filterBimestre={filterBimestre}
        setFilterEscola={setFilterEscola}
        setFilterTurma={setFilterTurma}
        setFilterBimestre={setFilterBimestre}
        studentsList={baStudents}
      />

      {!hasSchoolWriteAccess(filterEscola) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex items-start gap-3 shadow-sm">
          <Lock className="text-amber-500 shrink-0 mt-0.5 animate-pulse" size={18} />
          <div className="text-left leading-normal text-xs font-medium">
            <strong className="font-extrabold text-amber-950 block text-xs uppercase tracking-wide">Modo de Somente Leitura Ativado</strong>
            Você pode visualizar o Plano de Recomposição da Aprendizagem desta escola, mas apenas o superintendente responsável por <span className="font-extrabold text-amber-950">{filterEscola}</span> pode ajustar descritores, registrar dotações de carga horária ou preencher relatórios de plano estruturado.
          </div>
        </div>
      )}

      {/* Aligned Diagnostic Panel: Tells the status of the selected turma in Busca Ativa and Notas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Connection Widget 1: Attendance correlation */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-start gap-3.5 shadow-sm">
          <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-150 shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider font-mono">Correlação do {filterBimestre} (Busca Ativa)</span>
            <span className="text-xs font-extrabold text-slate-900 block mt-1">
              {activeBaCount} Estudante(s) Monitorados nesta Turma
            </span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {bimesterCriticalRisco 
                ? '⚠️ Alerta Vermelho: Alunos infrequentes de Alto/Crítico risco exigem flexibilidade nos roteiros de recomposição.' 
                : '✅ Frequência Estável: Esta turma possui baixa evasão neste bimestre. Foco total em descritores cognitivos.'}
            </p>
          </div>
        </div>

        {/* Connection Widget 2: Grades correlation */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-start gap-3.5 shadow-sm">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl border border-blue-150 shrink-0">
            <Presentation size={18} />
          </div>
          <div>
            <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider font-mono">Média Histórica Escolar do Boletim</span>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-extrabold text-slate-800">
                Língua Portuguesa: <code className="text-blue-700 font-mono font-extrabold bg-blue-50/50 px-1 py-0.5 rounded">{avgPortuguesValue}</code>
              </span>
              <span className="text-xs font-extrabold text-slate-800">
                Matemática: <code className="text-emerald-700 font-mono font-extrabold bg-emerald-50/50 px-1 py-0.5 rounded">{avgMatematicaValue}</code>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {avgMatematicaValue < 6.0 
                ? 'Critério em Alerta: O plano de reforço da Matemática deve detalhar mais horas de plantão síncrono.' 
                : 'Critério Confortável: Bom rendimento global aparente. Prossiga com nivelamento regular.'}
            </p>
          </div>
        </div>
      </div>

      {/* List of active Recomposição Plans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        {getAlignedPlans().map((rec) => (
          <div key={rec.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-350 transition relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-orange-550 to-amber-500" />
            <div className="space-y-3.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded text-[9px] font-black uppercase tracking-wider font-mono">
                    {rec.disciplina}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">Foco: {rec.escola} • {rec.turma}</span>
                </div>
                
                {hasSchoolWriteAccess(filterEscola) ? (
                  <button
                    onClick={() => handleOpenEditPlan(rec)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-extrabold rounded-xl border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                    title="Editar Plano de Recomposição"
                  >
                    <Edit size={11} /> Ajustar Plano
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[9px] bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-xl" title="Apenas o superintendente responsável pode mapear a recomposição">
                    <Lock size={10} className="text-amber-500" />
                    Leitura
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-extrabold text-slate-450 block">Habilidade Descritora do SPAECE</span>
                <p className="text-xs font-black text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-150 leading-relaxed font-mono">
                  {rec.focoIntervencao}
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-extrabold text-slate-405 block">Roteiro Pedagógico Regional</span>
                <p className="text-xs text-slate-650 leading-relaxed font-medium">
                  {rec.descricao}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-2">
              <div className="flex justify-between items-center text-xs font-black text-slate-800">
                <span className="uppercase text-[9px] text-slate-500">Carga Recomendada de Aulas Aplicadas</span>
                <span className="text-orange-700 font-mono text-[13px]">{rec.progresso}% da Grade</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <div 
                  className="bg-gradient-to-r from-orange-450 to-orange-600 h-full transition-all duration-500" 
                  style={{ width: `${rec.progresso}%` }} 
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Editor Modal for Recomposição Plan */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl relative">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center rounded-t-2xl">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Sliders size={14} className="text-orange-700" />
                  Calibrar Roteiro de Recomposição SIFEC
                </h4>
                <p className="text-[10px] text-slate-500">Altere o foco do descritor e Carga Horária Aplicada no {filterBimestre}.</p>
              </div>
              <button 
                onClick={() => setEditingItem(null)} 
                className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-220 text-rose-700 rounded-xl text-xs font-bold leading-normal">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Disciplina</span>
                  <span className="font-extrabold text-slate-800">{editingItem.disciplina}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block font-bold uppercase">Escola / Turma</span>
                  <span className="font-extrabold text-slate-800 truncate block">{editingItem.escola} • {editingItem.turma}</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Descritor Crítico SPAECE / Habilidade do Bimestre *</label>
                <input
                  type="text"
                  required
                  value={editFocoIntervencao}
                  onChange={(e) => setEditFocoIntervencao(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs rounded-xl font-mono font-bold text-slate-850"
                  placeholder="Ex: D4 - Distinguir um fato da opinião relativa a esse fato."
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Roteiro Pedagógico Regional de Resolução *</label>
                <textarea
                  required
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 text-xs rounded-xl text-slate-850 leading-relaxed font-medium"
                  placeholder="Descreva as ações aplicadas para mitigar essas lacunas de aprendizagem..."
                />
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">
                    Carga Recomendada de Aulas Aplicadas (%)
                  </label>
                  <span className="text-xs font-mono font-extrabold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-150">
                    {editProgresso}% Carga
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={editProgresso}
                    onChange={(e) => setEditProgresso(Number(e.target.value))}
                    className="flex-1 h-2 bg-slate-250 rounded-lg appearance-none cursor-pointer accent-orange-650"
                  />
                </div>
                <p className="text-[9px] text-slate-400">Arraste para ajustar o nível de aplicação das trilhas pedagógicas no trimestre.</p>
              </div>

              <div className="pt-3 border-t border-slate-150 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs uppercase rounded-xl transition shadow-sm cursor-pointer"
                >
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================
   5. SLIDES DE VISITA (PDF) VIEW (FALLBACK DECK IF NEEDED)
   ======================================================== */
export function SlidesView() {
  return null;
}
