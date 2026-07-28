import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  Edit, 
  Check, 
  Eye, 
  Trash2, 
  Award, 
  CloudLightning, 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  ShieldCheck, 
  School,
  X,
  Search,
  Filter,
  Flame,
  UserCheck,
  Lock
} from 'lucide-react';
import { auth, loginWithGoogle, logout } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  seedFirestoreDatabase,
  subscribeToCollection,
  updateDocument,
  addDocument,
  deleteDocument,
  SEED_GRADES,
  SEED_TURMAS,
  SEED_SCHOOLS
} from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId, hasSchoolWriteAccess, schoolNamesMatch } from '../lib/superintendentService';

interface StudentGrade {
  id: string;
  nome: string;
  turma: string;
  portugues: number;
  matematica: number;
  ciencias: number;
  bimestre: string;
}

interface SchoolBimesterStatus {
  id: string;
  nome: string;
  cidade: string;
  lancamentosBimestre: { b1: string; b2: string; b3: string; b4: string };
  mediaBimestre: { b1: number; b2: number; b3: number; b4: number };
}

export default function NotasView() {
  // Tab states: 'grades' or 'monitoring'
  const [subTab, setSubTab] = useState<'grades' | 'monitoring'>('monitoring');
  
  // Real or mock states
  const [grades, setGrades] = useState<StudentGrade[]>(SEED_GRADES);
  const [turmas, setTurmas] = useState<any[]>(SEED_TURMAS);
  const [schools, setSchools] = useState<any[]>(SEED_SCHOOLS);
  
  const [selectedStudent, setSelectedStudent] = useState<StudentGrade | null>(null);
  const [activeSuperId, setActiveSuperId] = useState('all');

  // Connection states
  const [isFirebaseMode, setIsFirebaseMode] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle');
  const [syncLog, setSyncLog] = useState<string>('');

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

  // Form states for edit modal
  const [port, setPort] = useState(0);
  const [mat, setMat] = useState(0);
  const [cien, setCien] = useState(0);

  // Extra editing states for school-wide bimester releases
  const [editingSchoolLancamento, setEditingSchoolLancamento] = useState<any | null>(null);
  const [schoolLancamentoTurmas, setSchoolLancamentoTurmas] = useState<any[]>([]);

  // Add student form states
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentTurma, setNewStudentTurma] = useState('');
  const [newStudentBimestre, setNewStudentBimestre] = useState('1º Bimestre');
  const [newStudentPort, setNewStudentPort] = useState(0);
  const [newStudentMat, setNewStudentMat] = useState(0);
  const [newStudentCien, setNewStudentCien] = useState(0);

  // Filters
  const [selectedBimestreFilter, setSelectedBimestreFilter] = useState<'Todos' | '1º Bimestre' | '2º Bimestre' | '3º Bimestre' | '4º Bimestre'>('Todos');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState('');

  // Track Auth state changes for Google authentication
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        setIsFirebaseMode(true);
      }
    });
    return () => unsubscribe();
  }, []);

  // Monitor snapshot updates in Firebase mode
  useEffect(() => {
    if (!isFirebaseMode) {
      // Offline reset fallback
      setGrades(SEED_GRADES);
      setTurmas(SEED_TURMAS);
      setSchools(SEED_SCHOOLS);
      return;
    }

    // Subscribe to dynamic Firebase updates
    const unsubSchools = subscribeToCollection('schools', (loaded) => {
      if (loaded.length > 0) setSchools(loaded);
    });
    
    const unsubTurmas = subscribeToCollection('turmas', (loaded) => {
      if (loaded.length > 0) setTurmas(loaded);
    });

    const unsubGrades = subscribeToCollection('grades', (loaded) => {
      if (loaded.length > 0) setGrades(loaded);
    });

    return () => {
      unsubSchools();
      unsubTurmas();
      unsubGrades();
    };
  }, [isFirebaseMode]);

  const handleLogin = async () => {
    try {
      setSyncStatus('syncing');
      setSyncLog('Solicitando autenticação com conta institucional Seduc...');
      const user = await loginWithGoogle();
      setSyncLog(`Usuário ${user.displayName || user.email} logado. Ativando sincronização.`);
      setSyncStatus('completed');
      setIsFirebaseMode(true);
    } catch (err: any) {
      setSyncLog(`Erro Autenticação: ${err.message}`);
      setSyncStatus('error');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsFirebaseMode(false);
      setCurrentUser(null);
      setSyncStatus('idle');
      setSyncLog('Desconectado do servidor remoto do Firebase.');
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleSyncDatabase = async () => {
    setSyncStatus('syncing');
    setSyncLog('Verificando conexão e enviando templates de controle regional...');
    try {
      const seeded = await seedFirestoreDatabase();
      if (seeded) {
        setSyncLog('Sucesso: Banco de dados inicializado com sucesso no Firestore remoto!');
      } else {
        setSyncLog('Firebase já contém dados ou sincronização rápida efetuada.');
      }
      setSyncStatus('completed');
    } catch (err: any) {
      setSyncLog(`Erro na Carga de Dados: ${err.message}`);
      setSyncStatus('error');
    }
  };

  const calculateAverage = (student: StudentGrade) => {
    return Number(((student.portugues + student.matematica + student.ciencias) / 3).toFixed(1));
  };

  const getStatusLabel = (average: number) => {
    if (average >= 6.0) return { label: 'Aprovado', style: 'bg-emerald-50 border-emerald-250 text-emerald-800 font-bold' };
    if (average >= 5.0) return { label: 'Recuperação', style: 'bg-amber-50 border-amber-250 text-amber-800 font-bold' };
    return { label: 'Retido', style: 'bg-rose-50 border-rose-250 text-rose-800 font-bold' };
  };

  const handleOpenEdit = (student: StudentGrade) => {
    setSelectedStudent(student);
    setPort(student.portugues);
    setMat(student.matematica);
    setCien(student.ciencias);
  };

  const handleSaveGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const newAverage = Number(((Number(port) + Number(mat) + Number(cien)) / 3).toFixed(1));

    if (isFirebaseMode) {
      // Save directly to Firebase
      try {
        setSyncStatus('syncing');
        setSyncLog(`Gravando boletim de ${selectedStudent.nome} no Firestore...`);
        
        await updateDocument('grades', selectedStudent.id, {
          portugues: Number(port),
          matematica: Number(mat),
          ciencias: Number(cien)
        });

        // Co-update linked class (turma) average
        const activeClass = turmas.find(t => t.nome === selectedStudent.turma) || turmas[0];
        if (activeClass) {
          const updatedMedia = { ...activeClass.mediaBimestre, b1: newAverage };
          await updateDocument('turmas', activeClass.id, {
            mediaBimestre: updatedMedia
          });
        }

        setSyncLog(`Boletim de ${selectedStudent.nome} atualizado no Firebase.`);
        setSyncStatus('completed');
      } catch (err: any) {
        setSyncLog(`Erro ao gravar dados: ${err.message}`);
        setSyncStatus('error');
      }
    } else {
      // Save local
      const updated = grades.map(s => {
        if (s.id === selectedStudent.id) {
          return {
            ...s,
            portugues: Number(port),
            matematica: Number(mat),
            ciencias: Number(cien)
          };
        }
        return s;
      });
      setGrades(updated);

      // Local update for matching class average
      const updatedTurmas = turmas.map(t => {
        if (t.nome === selectedStudent.turma) {
          return {
            ...t,
            mediaBimestre: { ...t.mediaBimestre, b1: newAverage }
          };
        }
        return t;
      });
      setTurmas(updatedTurmas);
    }

    setSelectedStudent(null);
  };

  const handleOpenEditLancamento = (sch: any) => {
    setEditingSchoolLancamento(sch);
    const related = turmas.filter(t => t.escolaId === sch.id || schoolNamesMatch(t.escolaNome, sch.nome));
    setSchoolLancamentoTurmas(JSON.parse(JSON.stringify(related))); // deep copy to edit locally first
  };

  const handleToggleTurmaBimStatus = (turmaId: string, bim: 'b1' | 'b2' | 'b3' | 'b4') => {
    setSchoolLancamentoTurmas(schoolLancamentoTurmas.map(t => {
      if (t.id === turmaId) {
        const cur = t.lancamentosBimestre?.[bim] || 'Pendente';
        const next = cur === 'Lançado' ? 'Pendente' : 'Lançado';
        return {
          ...t,
          lancamentosBimestre: {
            ...t.lancamentosBimestre,
            [bim]: next
          }
        };
      }
      return t;
    }));
  };

  const handleTurmaMediaChange = (turmaId: string, bim: 'b1' | 'b2' | 'b3' | 'b4', value: string) => {
    const numeric = parseFloat(value) || 0;
    setSchoolLancamentoTurmas(schoolLancamentoTurmas.map(t => {
      if (t.id === turmaId) {
        return {
          ...t,
          mediaBimestre: {
            ...t.mediaBimestre,
            [bim]: numeric
          }
        };
      }
      return t;
    }));
  };

  const handleSaveSchoolLancamentos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchoolLancamento) return;

    if (isFirebaseMode) {
      try {
        setSyncStatus('syncing');
        setSyncLog(`Gravando status de lançamentos para ${editingSchoolLancamento.nome} no Firestore...`);
        for (const t of schoolLancamentoTurmas) {
          await updateDocument('turmas', t.id, {
            lancamentosBimestre: t.lancamentosBimestre,
            mediaBimestre: t.mediaBimestre
          });
        }
        setSyncLog(`Lançamentos de ${editingSchoolLancamento.nome} gravados com sucesso!`);
        setSyncStatus('completed');
      } catch (err: any) {
        setSyncLog(`Erro ao gravar lançamentos: ${err.message}`);
        setSyncStatus('error');
      }
    } else {
      // Offline local store update
      const updatedTurmas = turmas.map(t => {
        const matched = schoolLancamentoTurmas.find(st => st.id === t.id);
        return matched ? matched : t;
      });
      setTurmas(updatedTurmas);
    }
    setEditingSchoolLancamento(null);
  };

  const handleAddStudentGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentTurma) return;

    const newId = `grade-${Date.now()}`;
    const freshRecord: StudentGrade = {
      id: newId,
      nome: newStudentName,
      turma: newStudentTurma,
      portugues: Number(newStudentPort),
      matematica: Number(newStudentMat),
      ciencias: Number(newStudentCien),
      bimestre: newStudentBimestre
    };

    if (isFirebaseMode) {
      try {
        setSyncStatus('syncing');
        setSyncLog(`Adicionando boletim de ${newStudentName} no Firestore...`);
        await addDocument('grades', newId, freshRecord);
        setSyncLog(`Boletim de ${newStudentName} adicionado no Firebase.`);
        setSyncStatus('completed');
      } catch (err: any) {
        setSyncLog(`Erro ao criar boletim: ${err.message}`);
        setSyncStatus('error');
      }
    } else {
      setGrades([freshRecord, ...grades]);
    }

    // Reset fields and close modal
    setIsAddingStudent(false);
    setNewStudentName('');
    setNewStudentTurma('');
    setNewStudentPort(0);
    setNewStudentMat(0);
    setNewStudentCien(0);
  };

  const handleDeleteGrade = async (studentId: string) => {
    if (!window.confirm('Tem certeza de que deseja remover esta nota/boletim definitivamente?')) return;

    const studentName = grades.find(g => g.id === studentId)?.nome || 'aluno';
    if (isFirebaseMode) {
      try {
        setSyncStatus('syncing');
        setSyncLog(`Limpando boletim de ${studentName} no Firestore remoto...`);
        await deleteDocument('grades', studentId);
        setSyncLog(`Boletim de ${studentName} removido com sucesso.`);
        setSyncStatus('completed');
      } catch (err: any) {
        setSyncLog(`Erro ao remover: ${err.message}`);
        setSyncStatus('error');
      }
    } else {
      setGrades(grades.filter(g => g.id !== studentId));
    }
  };

  // Filter schools based on active superintendent
  const visibleSchools = schools.filter(s => isSchoolVisible(s.nome));

  const visibleTurmas = turmas.filter(t =>
    visibleSchools.some(sch => sch.id === t.escolaId || schoolNamesMatch(sch.nome, t.escolaNome))
  );

  // Derived computations for Schools and Bimesters
  // Grouping classes and detecting if bimester launch is missing
  const schoolsMatrixData: SchoolBimesterStatus[] = visibleSchools.map(sch => {
    // Collect classes in this school
    const schoolClasses = visibleTurmas.filter(t => t.escolaId === sch.id || schoolNamesMatch(t.escolaNome, sch.nome));
    
    // Check launch status (if any class is Pending, the school has a partial/pending status)
    const b1Status = schoolClasses.every(t => t.lancamentosBimestre?.b1 === 'Lançado') ? 'Lançado' : 'Pendente';
    const b2Status = schoolClasses.every(t => t.lancamentosBimestre?.b2 === 'Lançado') ? 'Lançado' : 'Pendente';
    const b3Status = schoolClasses.every(t => t.lancamentosBimestre?.b3 === 'Lançado') ? 'Lançado' : 'Pendente';
    const b4Status = schoolClasses.every(t => t.lancamentosBimestre?.b4 === 'Lançado') ? 'Lançado' : 'Pendente';

    // Calculate bimester average grade of these classes
    const getAvg = (bim: string) => {
      const activeVals = schoolClasses
        .map(t => t.mediaBimestre?.[bim] || 0)
        .filter(v => v > 0);
      if (activeVals.length === 0) return 0.0;
      return Number((activeVals.reduce((sum, v) => sum + v, 0) / activeVals.length).toFixed(1));
    };

    return {
      id: sch.id,
      nome: sch.nome,
      cidade: sch.cidade,
      lancamentosBimestre: { b1: b1Status, b2: b2Status, b3: b3Status, b4: b4Status },
      mediaBimestre: { b1: getAvg('b1'), b2: getAvg('b2'), b3: getAvg('b3'), b4: getAvg('b4') }
    };
  });

  // Extract ONLY classes (turmas) with average scores below Seduc goal of 6.0
  const lowPerformingClasses = visibleTurmas.filter(t => {
    // Check matching averages that are launch states > 0 but less than 6.0
    const b1Val = t.mediaBimestre?.b1 || 0;
    const b2Val = t.mediaBimestre?.b2 || 0;
    
    const isB1Low = b1Val > 0 && b1Val < 6.0;
    const isB2Low = b2Val > 0 && b2Val < 6.0;
    
    return isB1Low || isB2Low;
  });

  // Total status summaries helper
  const pendingSchoolsCount = schoolsMatrixData.filter(
    s => s.lancamentosBimestre.b1 === 'Pendente' || s.lancamentosBimestre.b2 === 'Pendente'
  ).length;

  return (
    <div className="space-y-6">
      {/* 1. Header with custom title & Toggle Tab selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-105 pb-5">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 — PACTUAÇÃO PEDAGÓGICA</span>
          <h2 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">Lançamento & Monitoramento de Notas</h2>
          <p className="text-xs text-slate-500 font-normal mt-1">
            Gestão analítica de médias bimestrais por escola e identificação instantânea de turmas com desempenho abaixo do pacto.
          </p>
        </div>

        {/* View choice triggers */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shrink-0 self-start">
          <button
            onClick={() => setSubTab('monitoring')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
              subTab === 'monitoring' ? 'bg-brand-turquoise text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Monitorar Bimestres
          </button>
          <button
            onClick={() => setSubTab('grades')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
              subTab === 'grades' ? 'bg-brand-turquoise text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Planilha de Alunos
          </button>
        </div>
      </div>

      {/* 2. Top Banner: Firebase Integration Center — apenas em desenvolvimento.
          Login/logout de produção são feitos pelo fluxo central em App.tsx;
          este painel manual (com seed) nunca deve existir no bundle publicado. */}
      {import.meta.env.DEV && (
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isFirebaseMode ? 'bg-brand-green/10 border-brand-green/20 text-brand-green' : 'bg-brand-orange/10 border-brand-orange/20 text-brand-orange'
            }`}>
              {isFirebaseMode ? <ShieldCheck size={20} /> : <CloudLightning size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">Ativar Conexão com Firebase (dev)</h3>
                <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded border uppercase ${
                  isFirebaseMode ? 'bg-brand-green/10 border-brand-green/20 text-brand-green' : 'bg-brand-orange/10 border-brand-orange/20 text-brand-orange'
                }`}>
                  {isFirebaseMode ? 'ONLINE' : 'CACHE MOCK'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-normal leading-normal mt-1 max-w-2xl">
                {isFirebaseMode
                  ? `Conectado ao projeto Firebase "${firebaseConfig.projectId}" (ambiente de desenvolvimento local).`
                  : `Em modo offline demonstrativo. Para puxar as informações reais do Firebase e registrar alterações no Firestore, ative o canal de dados abaixo.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {isFirebaseMode ? (
              <>
                <button
                  onClick={handleSyncDatabase}
                  className="px-3.5 py-2 bg-white border border-slate-250 hover:border-slate-350 active:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
                >
                  <RefreshCw size={13} className={syncStatus === 'syncing' ? 'animate-spin text-brand-turquoise' : ''} />
                  Inserir Cópia Temp / Seed
                </button>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-2 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl transition"
                >
                  Desconectar
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Database size={13} />
                Puxar do Firebase
              </button>
            )}
          </div>
        </div>

        {/* Sync logs info */}
        {syncLog && (
          <div className="mt-3.5 pt-3 border-t border-slate-200 flex items-center gap-2 text-[10px] font-mono text-slate-500 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
            <span>{syncLog}</span>
          </div>
        )}
      </div>
      )}

      {subTab === 'monitoring' ? (
        /* ==================== MONITORING SUB-TAB ==================== */
        <div className="space-y-8">
          
          {/* Quick indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 border border-brand-orange/20 text-brand-orange flex items-center justify-center shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Escolas com Lançamento Pendente</span>
                <div className="text-xl font-extrabold text-slate-900 mt-0.5">{pendingSchoolsCount} Unidades</div>
                <span className="text-[10px] text-slate-500">Com bimester atrasado ou parcial.</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Flame size={18} className="animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Turmas Abaixo da Média Regional</span>
                <div className="text-xl font-extrabold text-rose-800 mt-0.5">{lowPerformingClasses.length} Turmas</div>
                <span className="text-[10px] text-slate-500">Média inferior ao limite pactuado de 6.0.</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-brand-green/10 border border-brand-green/20 text-brand-green flex items-center justify-center shrink-0">
                <Users size={18} />
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider block">Estudantes no Alvo</span>
                <div className="text-xl font-extrabold text-slate-900">
                  {lowPerformingClasses.reduce((sum, t) => sum + (t.alunosSinalizados || 0), 0)} Alunos
                </div>
                <span className="text-[10px] text-slate-500">Em plano intensivo de recomposição.</span>
              </div>
            </div>
          </div>

          {/* Core Feature 1: Bimester Grade Launch Control Matrix */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <span className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                  <School size={15} className="text-brand-turquoise" />
                  Painel Geral de Lançamento por Bimestre Sefor 3
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">Cruzamento de status administrativo para verificar se as notas foram lançadas.</p>
              </div>
              <span className="text-[10px] bg-brand-turquoise/10 border border-brand-turquoise/25 text-brand-turquoise font-mono font-bold px-2.5 py-0.5 rounded uppercase">
                Meta do Estado: 100% de Lançamento
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-6">Escola / Unidade</th>
                    <th className="py-3 px-6">Cidade</th>
                    <th className="py-3 px-6 text-center">1º Bimestre</th>
                    <th className="py-3 px-6 text-center">2º Bimestre</th>
                    <th className="py-3 px-6 text-center">3º Bimestre</th>
                    <th className="py-3 px-6 text-center">4º Bimestre</th>
                    <th className="py-3 px-6 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-750 font-medium">
                  {schoolsMatrixData.map((sch) => {
                    const canEditLaunch = hasSchoolWriteAccess(sch.nome);
                    return (
                      <tr key={sch.id} className="hover:bg-slate-50/30 transition">
                        <td className="py-3.5 px-6 font-extrabold text-slate-905 text-sm">{sch.nome}</td>
                        <td className="py-3.5 px-6 text-slate-500 text-xs">{sch.cidade}</td>
                        
                        {/* B1 */}
                        <td className="py-3.5 px-6 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block border ${
                              sch.lancamentosBimestre.b1 === 'Lançado'
                                ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
                                : 'bg-amber-50 border-amber-150 text-amber-800'
                            }`}>
                              {sch.lancamentosBimestre.b1}
                            </span>
                            {sch.mediaBimestre.b1 > 0 && (
                              <span className="text-[10px] mt-0.5 font-bold font-mono text-slate-500">Média: {sch.mediaBimestre.b1}</span>
                            )}
                          </div>
                        </td>

                        {/* B2 */}
                        <td className="py-3.5 px-6 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block border ${
                              sch.lancamentosBimestre.b2 === 'Lançado'
                                ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
                                : 'bg-amber-50 border-amber-150 text-amber-800'
                            }`}>
                              {sch.lancamentosBimestre.b2}
                            </span>
                            {sch.mediaBimestre.b2 > 0 && (
                              <span className="text-[10px] mt-0.5 font-bold font-mono text-slate-500">Média: {sch.mediaBimestre.b2}</span>
                            )}
                          </div>
                        </td>

                        {/* B3 */}
                        <td className="py-3.5 px-6 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block border ${
                              sch.lancamentosBimestre.b3 === 'Lançado'
                                ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
                                : 'bg-amber-50 border-amber-150 text-amber-800'
                            }`}>
                              {sch.lancamentosBimestre.b3}
                            </span>
                            {sch.mediaBimestre.b3 > 0 && (
                              <span className="text-[10px] mt-0.5 font-bold font-mono text-slate-500">Média: {sch.mediaBimestre.b3}</span>
                            )}
                          </div>
                        </td>

                        {/* B4 */}
                        <td className="py-3.5 px-6 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase inline-block border ${
                              sch.lancamentosBimestre.b4 === 'Lançado'
                                ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
                                : 'bg-amber-50 border-amber-150 text-amber-800'
                            }`}>
                              {sch.lancamentosBimestre.b4}
                            </span>
                            {sch.mediaBimestre.b4 > 0 && (
                              <span className="text-[10px] mt-0.5 font-bold font-mono text-slate-500">Média: {sch.mediaBimestre.b4}</span>
                            )}
                          </div>
                        </td>

                        {/* Aco */}
                        <td className="py-3.5 px-6 text-right">
                          {canEditLaunch ? (
                            <button
                              onClick={() => handleOpenEditLancamento(sch)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-brand-turquoise/10 hover:text-brand-turquoise hover:border-brand-turquoise/20 text-slate-700 border border-slate-200 text-[11px] font-bold rounded-lg transition"
                            >
                              <Edit size={12} className="inline mr-1" /> Editar Notas
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md" title="Sem permissão para este usuário">
                              <Lock size={10} className="text-amber-500" />
                              Restrito
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Core Feature 2: High Alert Classes - Turmas Abaixo da Média Pactuada (6.0) */}
          <div className="bg-white border border-slate-205 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Flame size={16} className="text-rose-600 animate-pulse" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Turmas com Rendimento Crítico / Desempenho Abaixo da Média (6.0)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Identificação precoce de turmas que necessitam de suporte pedagógico imediato e visitas da CREDE.</p>
              </div>
              <span className="text-[10px] bg-red-50 border border-red-150 text-red-700 font-mono px-2.5 py-0.5 rounded font-black uppercase">
                Atenção Obrigatória
              </span>
            </div>

            {lowPerformingClasses.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhuma turma atualmente está abaixo da média pactuada de 6.0. Parabéns à CREDE!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-6">Unidade Escolar</th>
                      <th className="py-3 px-6">Identificação da Turma</th>
                      <th className="py-3 px-6 text-center">Frequência / Período</th>
                      <th className="py-3 px-6 text-center">Média Atual Registrada</th>
                      <th className="py-3 px-6 text-center">Alunos Fora do Pacto</th>
                      <th className="py-3 px-6 text-right">Direcionamento Pedagógico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-750 font-medium">
                    {lowPerformingClasses.map((t) => {
                      // Detect low average for highlight
                      const currentAvg = t.mediaBimestre?.b1 || t.mediaBimestre?.b2 || 4.5;
                      const worstSubject = currentAvg < 5.5 ? "Matemática" : "Língua Portuguesa";
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/30 transition">
                          <td className="py-3.5 px-6 font-extrabold text-slate-900 text-sm">
                            {t.escolaNome}
                          </td>
                          <td className="py-3.5 px-6 text-slate-650">
                            <div>
                              <span className="font-extrabold text-slate-800 text-xs">{t.nome}</span>
                              <span className="text-[10px] text-rose-600 block bg-rose-50 border border-rose-100 px-1.5 py-0.2 rounded w-max mt-0.5 font-bold uppercase font-mono">Foco: {worstSubject}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-6 text-center text-slate-500 font-mono text-xs">{t.periodo}</td>
                          <td className="py-3.5 px-6 text-center">
                            <span className="font-extrabold font-mono text-rose-700 bg-rose-50 border border-rose-150 px-2 py-0.5 rounded text-xs">
                              {currentAvg.toFixed(1)} / 10
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-center">
                            <span className="text-slate-800 font-bold font-mono bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-xs">
                              {t.alunosSinalizados} alunos
                            </span>
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button 
                                onClick={() => alert(`Notificação pedagógica encaminhada para o Professor Diretor de Turma (PPDT) de ${t.nome}`)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-700 text-[10px] font-bold rounded-lg transition"
                              >
                                Notificar PDT
                              </button>
                              <button 
                                onClick={() => alert(`Visita agendada à ${t.escolaNome} focando em recomposição pedagógica para a classe ${t.nome}.`)}
                                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-lg transition"
                              >
                                Agendar Visita
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================== GRADES SHEET SUB-TAB ==================== */
        <div className="space-y-6">
          
          {/* Advanced Search and filter toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            
            {/* Find student name input */}
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Buscar aluno no censo por parte do nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-xl"
              />
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            </div>

            {/* School/Uni filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                <Filter size={13} />
                Filtro de Escola:
              </div>
              <select
                value={selectedSchoolFilter}
                onChange={(e) => setSelectedSchoolFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 p-2 rounded-xl focus:outline-none focus:border-brand-turquoise"
              >
                <option value="Todas">Todas as Escolas</option>
                {visibleSchools.map(s => (
                  <option key={s.id} value={s.nome}>{s.nome}</option>
                ))}
              </select>

              <select
                value={selectedBimestreFilter}
                onChange={(e) => setSelectedBimestreFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 p-2 rounded-xl focus:outline-none focus:border-brand-turquoise"
              >
                <option value="Todos">Todos os Bimestres</option>
                <option value="1º Bimestre">1º Bimestre</option>
                <option value="2º Bimestre">2º Bimestre</option>
                <option value="3º Bimestre">3º Bimestre</option>
                <option value="4º Bimestre">4º Bimestre</option>
              </select>
            </div>
          </div>

          {/* Table display */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-150 flex items-center justify-between bg-slate-50/50">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-brand-turquoise" />
                Planilha Geral Sincronizada com o Firebase
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsAddingStudent(true)}
                  className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                >
                  <Plus size={12} /> Registrar Notas Aluno
                </button>
                <span className="text-[10px] bg-brand-turquoise/10 border border-brand-turquoise/20 text-brand-turquoise font-mono px-2 py-0.5 rounded font-black uppercase">
                  {grades.filter(g => visibleTurmas.some(t => t.nome === g.turma)).length} Boletins Mapeados
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-6">Nome do Aluno</th>
                    <th className="py-3 px-6">Turma Regulada</th>
                    <th className="py-3 px-6 text-center">Português</th>
                    <th className="py-3 px-6 text-center">Matemática</th>
                    <th className="py-3 px-6 text-center">Ciências</th>
                    <th className="py-3 px-6 text-center">Média do Aluno</th>
                    <th className="py-3 px-6 text-center">Situação Final</th>
                    <th className="py-3 px-6 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
                  {grades
                    .filter(g => {
                      const matchesSuper = visibleTurmas.some(t => t.nome === g.turma);
                      if (!matchesSuper) return false;

                      if (selectedSchoolFilter !== 'Todas') {
                        const matchedClass = visibleTurmas.find(t => t.nome === g.turma);
                        if (!matchedClass || !schoolNamesMatch(matchedClass.escolaNome, selectedSchoolFilter)) return false;
                      }

                      const matchesSearch = g.nome.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesBim = selectedBimestreFilter === 'Todos' || g.bimestre === selectedBimestreFilter;
                      return matchesSearch && matchesBim;
                    })
                    .map((student) => {
                      const avg = calculateAverage(student);
                      const status = getStatusLabel(avg);
                      const matchedClass = visibleTurmas.find(t => t.nome === student.turma);
                      const canEdit = matchedClass ? hasSchoolWriteAccess(matchedClass.escolaNome) : true;
                      return (
                        <tr key={student.id} className="hover:bg-slate-50/50 transition">
                           <td className="py-3 px-6 font-extrabold text-slate-900 text-sm">{student.nome}</td>
                           <td className="py-3 px-6 text-slate-500">{student.turma}</td>
                           <td className="py-3 px-6 text-center font-mono font-bold text-slate-800">{student.portugues.toFixed(1)}</td>
                           <td className="py-3 px-6 text-center font-mono font-bold text-slate-800">{student.matematica.toFixed(1)}</td>
                           <td className="py-3 px-6 text-center font-mono font-bold text-slate-800">{student.ciencias.toFixed(1)}</td>
                           <td className="py-3 px-6 text-center">
                             <span className="font-extrabold text-brand-turquoise font-mono bg-brand-turquoise/5 px-2.5 py-0.5 rounded border border-brand-turquoise/20">{avg.toFixed(1)}</span>
                           </td>
                           <td className="py-3 px-6 text-center">
                             <span className={`px-2.5 py-0.5 rounded border text-[10px] ${status.style}`}>
                                 {status.label}
                             </span>
                           </td>
                           <td className="py-3 px-6 text-right text-xs">
                             {canEdit ? (
                               <div className="flex justify-end items-center gap-1">
                                 <button
                                   onClick={() => handleOpenEdit(student)}
                                   className="p-1.5 hover:bg-slate-100 hover:text-brand-turquoise text-slate-400 rounded-lg transition"
                                   title="Editar Notas"
                                 >
                                   <Edit size={14} />
                                 </button>
                                 <button
                                   onClick={() => handleDeleteGrade(student.id)}
                                   className="p-1.5 hover:bg-rose-50 hover:text-rose-600 text-slate-400 rounded-lg transition"
                                   title="Excluir Registro"
                                 >
                                   <Trash2 size={13} />
                                 </button>
                               </div>
                             ) : (
                               <span className="text-[10px] font-mono text-slate-400 inline-flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200" title="Sem permissão de gerenciamento escolar para esta unidade">
                                 <Lock size={10} className="text-amber-500" />
                                 Leitura
                                </span>
                             )}
                           </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. Popup editor modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-205 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Lançar Notas / Boletim Escolar</h4>
                <p className="text-[10px] text-slate-500 truncate max-w-xs">{selectedStudent.nome}</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveGrades} className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block text-slate-500">Português</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={10}
                    value={port}
                    onChange={(e) => setPort(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block text-slate-500">Matemática</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={10}
                    value={mat}
                    onChange={(e) => setMat(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block text-slate-500">Ciências</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={10}
                    value={cien}
                    onChange={(e) => setCien(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[10px] text-slate-500 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                <span>
                  Qualquer nota inserida re-calcula instantaneamente as médias da turma no Firebase para Auditorias de Faturamento.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStudent(null)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold text-xs uppercase rounded-xl transition shadow-sm"
                >
                  Salvar Boletim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Edit school bimester launches modal */}
      {editingSchoolLancamento && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-205 rounded-2xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Editar Lançamento de Notas / Bimestres</h4>
                <p className="text-[10px] text-slate-500 font-bold truncate max-w-md">{editingSchoolLancamento.nome}</p>
              </div>
              <button onClick={() => setEditingSchoolLancamento(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSchoolLancamentos} className="p-5 space-y-4">
              <p className="text-[11px] text-slate-500">Configure o status de lançamento ("Lançado" vs "Pendente") clicando em cada bimestre, e defina as médias correspondentes se necessário para cada uma das turmas registradas:</p>
              
              <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1">
                {schoolLancamentoTurmas.map((t) => (
                  <div key={t.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">{t.nome}</span>
                      <span className="text-[9px] font-mono font-black text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded">{t.periodo}</span>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {['b1', 'b2', 'b3', 'b4'].map((bKey) => {
                        const bNum = bKey === 'b1' ? '1º Bim' : bKey === 'b2' ? '2º Bim' : bKey === 'b3' ? '3º Bim' : '4º Bim';
                        const status = t.lancamentosBimestre?.[bKey] || 'Pendente';
                        const media = t.mediaBimestre?.[bKey] || 0;
                        return (
                          <div key={bKey} className="bg-white border border-slate-200 p-2 rounded-lg space-y-1">
                            <span className="text-[9px] font-bold text-slate-400 block">{bNum}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleTurmaBimStatus(t.id, bKey as any)}
                              className={`w-full text-center py-0.5 text-[10px] font-bold rounded border ${
                                status === 'Lançado'
                                  ? 'bg-emerald-50 border-emerald-150 text-emerald-800 hover:bg-emerald-100'
                                  : 'bg-amber-50 border-amber-150 text-amber-800 hover:bg-amber-100'
                              } transition`}
                            >
                              {status}
                            </button>
                            <input
                              type="number"
                              step={0.1}
                              min={0}
                              max={10}
                              placeholder="Média"
                              value={media || ''}
                              onChange={(e) => handleTurmaMediaChange(t.id, bKey as any, e.target.value)}
                              className="w-full text-center p-1 border border-slate-200 text-[10px] font-mono rounded bg-slate-50"
                              title="Média Pactuada"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setEditingSchoolLancamento(null)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold text-xs uppercase rounded-xl transition shadow-sm"
                >
                  Salvar Lançamentos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Add student grade record modal */}
      {isAddingStudent && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-205 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Novo Boletim / Lançar Aluno</h4>
                <p className="text-[10px] text-slate-500 font-bold">Lançamento direto na grade do Censo Escolar</p>
              </div>
              <button onClick={() => setIsAddingStudent(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddStudentGrade} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-700 block">Nome do Aluno</label>
                <input
                  type="text"
                  required
                  placeholder="Nome completo do aluno do censo..."
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-700 block">Turma Regulada</label>
                  <select
                    required
                    value={newStudentTurma}
                    onChange={(e) => setNewStudentTurma(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs rounded-xl"
                  >
                    <option value="">Selecione...</option>
                    {visibleTurmas.map(t => (
                      <option key={t.id} value={t.nome}>{t.nome} ({t.escolaNome})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-705 block">Bimestre de Referência</label>
                  <select
                    value={newStudentBimestre}
                    onChange={(e) => setNewStudentBimestre(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs rounded-xl font-bold"
                  >
                    <option value="1º Bimestre">1º Bimestre</option>
                    <option value="2º Bimestre">2º Bimestre</option>
                    <option value="3º Bimestre">3º Bimestre</option>
                    <option value="4º Bimestre">4º Bimestre</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-705 block">Português</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={10}
                    value={newStudentPort}
                    onChange={(e) => setNewStudentPort(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-750 block">Matemática</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={10}
                    value={newStudentMat}
                    onChange={(e) => setNewStudentMat(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-750 block">Ciências</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={10}
                    value={newStudentCien}
                    onChange={(e) => setNewStudentCien(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setIsAddingStudent(false)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-turquoise hover:bg-brand-turquoise-dark text-white font-extrabold text-xs uppercase rounded-xl transition shadow-sm"
                >
                  Adicionar Boletim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
