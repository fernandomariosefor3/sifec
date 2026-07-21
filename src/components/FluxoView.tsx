import React, { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, AlertTriangle, CheckCircle, Edit, X, Search, MapPin, Percent, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { subscribeToCollection, updateDocument, SEED_SCHOOLS } from '../lib/firebaseService';
import { isSchoolVisible, getActiveSuperintendentId, hasSchoolWriteAccess } from '../lib/superintendentService';

interface BimesterFluxo {
  aprovadosPct: number;
  reprovadosPct: number;
  abandonosPct: number;
}

interface SchoolFluxo {
  id: string;
  nome: string;
  cidade: string;
  matriculas: number;
  frequencia?: number;
  aprovacao?: number;
  evasao?: number;
  bimestres?: {
    b1: BimesterFluxo;
    b2: BimesterFluxo;
    b3: BimesterFluxo;
    b4: BimesterFluxo;
  };
}

// Initial flow metrics mapped specifically to the 7 schools
const DEFAULT_FLUXO_VALUES: Record<string, { frequencia: number; aprovacao: number; evasao: number }> = {
  'diva-cabral': { frequencia: 87.2, aprovacao: 89.8, evasao: 1.5 },
  'figueiredo-correia': { frequencia: 94.5, aprovacao: 94.8, evasao: 1.0 },
  'jose-leopoldino': { frequencia: 92.1, aprovacao: 91.7, evasao: 1.6 },
  'canindezinho': { frequencia: 88.0, aprovacao: 90.0, evasao: 2.2 },
  'anisio-teixeira': { frequencia: 91.5, aprovacao: 90.2, evasao: 1.4 },
  'estado-amazonas': { frequencia: 93.8, aprovacao: 94.2, evasao: 1.1 },
  'osires-pontes': { frequencia: 90.8, aprovacao: 90.2, evasao: 1.7 }
};

export default function FluxoView() {
  const [schools, setSchools] = useState<SchoolFluxo[]>([]);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedBim, setSelectedBim] = useState<'geral' | 'b1' | 'b2' | 'b3' | 'b4'>('geral');
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolFluxo | null>(null);

  // Form states
  const [freqInput, setFreqInput] = useState('');
  const [aprovInput, setAprovInput] = useState('');
  const [evasaoInput, setEvasaoInput] = useState('');
  const [formError, setFormError] = useState('');

  // Bimester state variables for editing
  const [b1Aprov, setB1Aprov] = useState('');
  const [b1Reprov, setB1Reprov] = useState('');
  const [b1Aband, setB1Aband] = useState('');

  const [b2Aprov, setB2Aprov] = useState('');
  const [b2Reprov, setB2Reprov] = useState('');
  const [b2Aband, setB2Aband] = useState('');

  const [b3Aprov, setB3Aprov] = useState('');
  const [b3Reprov, setB3Reprov] = useState('');
  const [b3Aband, setB3Aband] = useState('');

  const [b4Aprov, setB4Aprov] = useState('');
  const [b4Reprov, setB4Reprov] = useState('');
  const [b4Aband, setB4Aband] = useState('');

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

  // Merge SEED_SCHOOLS with default flow values including bimesters
  const getInitialFluxoLocal = (): SchoolFluxo[] => {
    return SEED_SCHOOLS.map(s => {
      const defaultValue = DEFAULT_FLUXO_VALUES[s.id] || { frequencia: 91.0, aprovacao: 91.0, evasao: 1.5 };
      const b1_apv = Math.min(defaultValue.aprovacao + 1.2, 99.5);
      const b1_ab = Math.max(defaultValue.evasao * 0.2, 0.1);
      const b1_rep = Math.max(100 - b1_apv - b1_ab, 0);

      const b2_apv = Math.min(defaultValue.aprovacao + 0.5, 99.5);
      const b2_ab = Math.max(defaultValue.evasao * 0.4, 0.2);
      const b2_rep = Math.max(100 - b2_apv - b2_ab, 0);

      const b3_apv = Math.min(defaultValue.aprovacao - 0.2, 99.5);
      const b3_ab = Math.max(defaultValue.evasao * 0.6, 0.3);
      const b3_rep = Math.max(100 - b3_apv - b3_ab, 0);

      const b4_apv = Math.min(defaultValue.aprovacao - 1.5, 99.5);
      const b4_ab = defaultValue.evasao;
      const b4_rep = Math.max(100 - b4_apv - b4_ab, 0);

      return {
        id: s.id,
        nome: s.nome,
        cidade: s.cidade,
        matriculas: s.matriculas,
        frequencia: defaultValue.frequencia,
        aprovacao: defaultValue.aprovacao,
        evasao: defaultValue.evasao,
        bimestres: {
          b1: { aprovadosPct: Number(b1_apv.toFixed(1)), reprovadosPct: Number(b1_rep.toFixed(1)), abandonosPct: Number(b1_ab.toFixed(1)) },
          b2: { aprovadosPct: Number(b2_apv.toFixed(1)), reprovadosPct: Number(b2_rep.toFixed(1)), abandonosPct: Number(b2_ab.toFixed(1)) },
          b3: { aprovadosPct: Number(b3_apv.toFixed(1)), reprovadosPct: Number(b3_rep.toFixed(1)), abandonosPct: Number(b3_ab.toFixed(1)) },
          b4: { aprovadosPct: Number(b4_apv.toFixed(1)), reprovadosPct: Number(b4_rep.toFixed(1)), abandonosPct: Number(b4_ab.toFixed(1)) }
        }
      };
    });
  };

  // Subscribe/Fetch schools logic with bimester mapping
  useEffect(() => {
    if (!isFirebaseMode) {
      setSchools(getInitialFluxoLocal());
      return;
    }

    const unsubSchools = subscribeToCollection('schools', (loaded) => {
      if (loaded.length > 0) {
        const formatted: SchoolFluxo[] = loaded.map((s: any) => {
          const defaults = DEFAULT_FLUXO_VALUES[s.id] || { frequencia: 91.0, aprovacao: 91.0, evasao: 1.5 };
          const base_aprov = s.aprovacao !== undefined ? s.aprovacao : defaults.aprovacao;
          const base_evasao = s.evasao !== undefined ? s.evasao : defaults.evasao;

          const b1_apv = Math.min(base_aprov + 1.2, 99.5);
          const b1_ab = Math.max(base_evasao * 0.2, 0.1);
          const b1_rep = Math.max(100 - b1_apv - b1_ab, 0);

          const b2_apv = Math.min(base_aprov + 0.5, 99.5);
          const b2_ab = Math.max(base_evasao * 0.4, 0.2);
          const b2_rep = Math.max(100 - b2_apv - b2_ab, 0);

          const b3_apv = Math.min(base_aprov - 0.2, 99.5);
          const b3_ab = Math.max(base_evasao * 0.6, 0.3);
          const b3_rep = Math.max(100 - b3_apv - b3_ab, 0);

          const b4_apv = Math.min(base_aprov - 1.5, 99.5);
          const b4_ab = base_evasao;
          const b4_rep = Math.max(100 - b4_apv - b4_ab, 0);

          return {
            id: s.id,
            nome: s.nome,
            cidade: s.cidade,
            matriculas: s.matriculas,
            frequencia: s.frequencia !== undefined ? s.frequencia : defaults.frequencia,
            aprovacao: base_aprov,
            evasao: base_evasao,
            bimestres: s.bimestres || {
              b1: { aprovadosPct: Number(b1_apv.toFixed(1)), reprovadosPct: Number(b1_rep.toFixed(1)), abandonosPct: Number(b1_ab.toFixed(1)) },
              b2: { aprovadosPct: Number(b2_apv.toFixed(1)), reprovadosPct: Number(b2_rep.toFixed(1)), abandonosPct: Number(b2_ab.toFixed(1)) },
              b3: { aprovadosPct: Number(b3_apv.toFixed(1)), reprovadosPct: Number(b3_rep.toFixed(1)), abandonosPct: Number(b3_ab.toFixed(1)) },
              b4: { aprovadosPct: Number(b4_apv.toFixed(1)), reprovadosPct: Number(b4_rep.toFixed(1)), abandonosPct: Number(b4_ab.toFixed(1)) }
            }
          };
        });
        setSchools(formatted);
      } else {
        setSchools(getInitialFluxoLocal());
      }
    });

    return () => unsubSchools();
  }, [isFirebaseMode]);

  // Filter schools based on active superintendent
  const visibleSchools = schools.filter(s => isSchoolVisible(s.nome));

  // Calculations derived dynamically from the filtered schools list state and selected bimester tab
  const getBimStat = (s: SchoolFluxo, type: 'aprov' | 'reprov' | 'evasao') => {
    if (selectedBim === 'geral') {
      return type === 'aprov' ? (s.aprovacao || 0) : type === 'evasao' ? (s.evasao || 0) : Math.max(100 - (s.aprovacao || 0) - (s.evasao || 0), 0);
    }
    const bKey = selectedBim;
    const bim = s.bimestres?.[bKey] || { aprovadosPct: s.aprovacao || 91, reprovadosPct: Math.max(100 - (s.aprovacao || 91) - (s.evasao || 1.5), 0), abandonosPct: s.evasao || 1.5 };
    return type === 'aprov' ? bim.aprovadosPct : type === 'evasao' ? bim.abandonosPct : bim.reprovadosPct;
  };

  const totalMatriculas = visibleSchools.reduce((sum, s) => sum + s.matriculas, 0);
  
  const avgFrequencia = visibleSchools.length > 0 
    ? Number((visibleSchools.reduce((sum, s) => sum + (s.frequencia || 0), 0) / visibleSchools.length).toFixed(1))
    : 0;

  const avgAprovacao = visibleSchools.length > 0
    ? Number((visibleSchools.reduce((sum, s) => sum + getBimStat(s, 'aprov'), 0) / visibleSchools.length).toFixed(1))
    : 0;

  const avgEvasao = visibleSchools.length > 0
    ? Number((visibleSchools.reduce((sum, s) => sum + getBimStat(s, 'evasao'), 0) / visibleSchools.length).toFixed(1))
    : 0;

  const avgReprovacao = visibleSchools.length > 0
    ? Number((visibleSchools.reduce((sum, s) => sum + getBimStat(s, 'reprov'), 0) / visibleSchools.length).toFixed(1))
    : 0;

  const handleOpenEdit = (school: SchoolFluxo) => {
    setEditingSchool(school);
    setFreqInput(school.frequencia?.toString() || '');
    setAprovInput(school.aprovacao?.toString() || '');
    setEvasaoInput(school.evasao?.toString() || '');

    const defaults = DEFAULT_FLUXO_VALUES[school.id] || { frequencia: 91.0, aprovacao: 91.0, evasao: 1.5 };
    const b = school.bimestres || {
      b1: { aprovadosPct: defaults.aprovacao + 1.2, reprovadosPct: Math.max(100 - (defaults.aprovacao + 1.2) - (defaults.evasao * 0.2), 0), abandonosPct: defaults.evasao * 0.2 },
      b2: { aprovadosPct: defaults.aprovacao + 0.5, reprovadosPct: Math.max(100 - (defaults.aprovacao + 0.5) - (defaults.evasao * 0.4), 0), abandonosPct: defaults.evasao * 0.4 },
      b3: { aprovadosPct: defaults.aprovacao - 0.2, reprovadosPct: Math.max(100 - (defaults.aprovacao - 0.2) - (defaults.evasao * 0.6), 0), abandonosPct: defaults.evasao * 0.6 },
      b4: { aprovadosPct: defaults.aprovacao - 1.5, reprovadosPct: Math.max(100 - (defaults.aprovacao - 1.5) - defaults.evasao, 0), abandonosPct: defaults.evasao }
    };

    setB1Aprov(b.b1.aprovadosPct.toString());
    setB1Reprov(b.b1.reprovadosPct.toString());
    setB1Aband(b.b1.abandonosPct.toString());

    setB2Aprov(b.b2.aprovadosPct.toString());
    setB2Reprov(b.b2.reprovadosPct.toString());
    setB2Aband(b.b2.abandonosPct.toString());

    setB3Aprov(b.b3.aprovadosPct.toString());
    setB3Reprov(b.b3.reprovadosPct.toString());
    setB3Aband(b.b3.abandonosPct.toString());

    setB4Aprov(b.b4.aprovadosPct.toString());
    setB4Reprov(b.b4.reprovadosPct.toString());
    setB4Aband(b.b4.abandonosPct.toString());

    setFormError('');
  };

  const handleSaveFluxo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;

    const parsedFreq = parseFloat(freqInput);
    if (isNaN(parsedFreq) || parsedFreq < 0 || parsedFreq > 100) {
      setFormError('Por favor, digite taxas percentuais de frequência válidas entre 0 e 100.');
      return;
    }

    // Parse all bimester values
    const b1_ap = parseFloat(b1Aprov);
    const b1_rep = parseFloat(b1Reprov);
    const b1_ab = parseFloat(b1Aband);

    const b2_ap = parseFloat(b2Aprov);
    const b2_rep = parseFloat(b2Reprov);
    const b2_ab = parseFloat(b2Aband);

    const b3_ap = parseFloat(b3Aprov);
    const b3_rep = parseFloat(b3Reprov);
    const b3_ab = parseFloat(b3Aband);

    const b4_ap = parseFloat(b4Aprov);
    const b4_rep = parseFloat(b4Reprov);
    const b4_ab = parseFloat(b4Aband);

    if (
      isNaN(b1_ap) || b1_ap < 0 || b1_ap > 100 || isNaN(b1_rep) || b1_rep < 0 || b1_rep > 100 || isNaN(b1_ab) || b1_ab < 0 || b1_ab > 100 ||
      isNaN(b2_ap) || b2_ap < 0 || b2_ap > 100 || isNaN(b2_rep) || b2_rep < 0 || b2_rep > 100 || isNaN(b2_ab) || b2_ab < 0 || b2_ab > 100 ||
      isNaN(b3_ap) || b3_ap < 0 || b3_ap > 100 || isNaN(b3_rep) || b3_rep < 0 || b3_rep > 100 || isNaN(b3_ab) || b3_ab < 0 || b3_ab > 100 ||
      isNaN(b4_ap) || b4_ap < 0 || b4_ap > 100 || isNaN(b4_rep) || b4_rep < 0 || b4_rep > 100 || isNaN(b4_ab) || b4_ab < 0 || b4_ab > 100
    ) {
      setFormError('Todas as taxas bimestrais precisam ser percentuais entre 0 e 100.');
      return;
    }

    if (!hasSchoolWriteAccess(editingSchool.nome)) {
      setFormError('Acesso Negado: Você não tem permissão para editar os dados desta escola.');
      return;
    }

    // Compute average annual values automatically
    const computedAprov = Number(((b1_ap + b2_ap + b3_ap + b4_ap) / 4).toFixed(1));
    const computedEvasao = Number(((b1_ab + b2_ab + b3_ab + b4_ab) / 4).toFixed(1));

    const updatedData = {
      frequencia: parsedFreq,
      aprovacao: computedAprov,
      evasao: computedEvasao,
      bimestres: {
        b1: { aprovadosPct: b1_ap, reprovadosPct: b1_rep, abandonosPct: b1_ab },
        b2: { aprovadosPct: b2_ap, reprovadosPct: b2_rep, abandonosPct: b2_ab },
        b3: { aprovadosPct: b3_ap, reprovadosPct: b3_rep, abandonosPct: b3_ab },
        b4: { aprovadosPct: b4_ap, reprovadosPct: b4_rep, abandonosPct: b4_ab }
      }
    };

    if (isFirebaseMode) {
      try {
        await updateDocument('schools', editingSchool.id, updatedData);
      } catch (err: any) {
        setFormError('Erro ao gravar no Firebase: ' + err.message);
        return;
      }
    } else {
      setSchools(schools.map(s => s.id === editingSchool.id ? { ...s, ...updatedData } : s));
    }

    setEditingSchool(null);
    setFormError('');
  };

  const filteredSchools = visibleSchools.filter(s => 
    s.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 - GESTÃO ESCOLAR</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Fluxo Escolar Coordenador</h2>
          <p className="text-xs text-slate-500 font-normal">Supervisione e edite as taxas reais de frequência, aprovação, reprovação e abandono por bimestres.</p>
        </div>

        {/* Bimester Selector Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setSelectedBim('geral')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              selectedBim === 'geral' ? 'bg-white text-emerald-800 shadow-sm border border-slate-200' : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            Consolidado Anual
          </button>
          <button
            onClick={() => setSelectedBim('b1')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              selectedBim === 'b1' ? 'bg-white text-emerald-800 shadow-sm border border-slate-200' : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            1º Bim
          </button>
          <button
            onClick={() => setSelectedBim('b2')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              selectedBim === 'b2' ? 'bg-white text-emerald-800 shadow-sm border border-slate-200' : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            2º Bim
          </button>
          <button
            onClick={() => setSelectedBim('b3')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              selectedBim === 'b3' ? 'bg-white text-emerald-800 shadow-sm border border-slate-200' : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            3º Bim
          </button>
          <button
            onClick={() => setSelectedBim('b4')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition ${
              selectedBim === 'b4' ? 'bg-white text-emerald-800 shadow-sm border border-slate-200' : 'text-slate-550 hover:text-slate-800'
            }`}
          >
            4º Bim
          </button>
        </div>
      </div>

      {/* Dynamic Global KPI Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Frequência ou Aprovação Geral */}
        <div className="bg-white border border-brand-turquoise/20 rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                {selectedBim === 'geral' ? 'Média Regional de Frequência' : `Aprovação Média (${selectedBim.toUpperCase()})`}
              </span>
              <span className="bg-brand-turquoise/10 border border-brand-turquoise/20 text-brand-turquoise text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <CheckCircle size={10} /> Meta: {selectedBim === 'geral' ? '92.0%' : '85.0%'}
              </span>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 font-mono mt-3">
              {selectedBim === 'geral' ? `${avgFrequencia}%` : `${avgAprovacao}%`}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">
              {selectedBim === 'geral' ? 'Frequência média geral das unidades escolares.' : 'Média das taxas de aprovação por bimestre.'}
            </p>
          </div>
        </div>

        {/* KPI 2: Aprovação Geral ou Reprovação */}
        <div className="bg-white border border-brand-orange/20 rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                {selectedBim === 'geral' ? 'Média Regional de Aprovação' : `Reprovação Média (${selectedBim.toUpperCase()})`}
              </span>
              <span className="bg-brand-orange/10 border border-brand-orange/20 text-brand-orange text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <TrendingUp size={10} /> {selectedBim === 'geral' ? 'Meta LDB: 85%' : 'Alerta'}
              </span>
            </div>
            <div className="text-3xl font-extrabold text-slate-900 font-mono mt-3">
              {selectedBim === 'geral' ? `${avgAprovacao}%` : `${avgReprovacao}%`}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">
              {selectedBim === 'geral' ? 'Média consolidada anual da taxa de aprovação.' : 'Taxa de reprovação calculada.'}
            </p>
          </div>
        </div>

        {/* KPI 3: Evasão/Abandono */}
        <div className="bg-white border border-brand-coral/20 rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                {selectedBim === 'geral' ? 'Índice Geral de Abandono' : `Abandonos Médios (${selectedBim.toUpperCase()})`}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 border ${
                avgEvasao > 2.0 
                  ? 'bg-rose-50 border-rose-150 text-rose-700' 
                  : 'bg-emerald-50 border-emerald-100 text-emerald-700'
              }`}>
                <AlertTriangle size={10} /> Alerta Seduc: 2.0%
              </span>
            </div>
            <div className={`text-3xl font-extrabold font-mono mt-3 ${avgEvasao > 2.0 ? 'text-rose-700' : 'text-slate-900'}`}>{avgEvasao}%</div>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">Média geral regional de abandono escolar acumulado.</p>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Buscar unidade escolar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-brand-turquoise focus:outline-none text-xs text-slate-800 rounded-xl"
          />
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
        </div>
        <div className="text-xs text-slate-400 font-mono font-bold uppercase tracking-wider">
          {visibleSchools.length} Escolas Reguladas ({selectedBim === 'geral' ? 'Foco Consolidado' : `Foco ${selectedBim.toUpperCase()}`})
        </div>
      </div>

      {/* Main flow-stats container table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-6">Unidade Escolar</th>
                <th className="py-3.5 px-6">Sede / Cidade</th>
                <th className="py-3.5 px-6 text-right">Alunos Cadastrados</th>
                {selectedBim === 'geral' ? (
                  <>
                    <th className="py-3.5 px-6 text-center">Frequência Geral (%)</th>
                    <th className="py-3.5 px-6 text-center">Aprovação Geral (%)</th>
                    <th className="py-3.5 px-6 text-center">Evasão Geral (%)</th>
                  </>
                ) : (
                  <>
                    <th className="py-3.5 px-6 text-center bg-emerald-50/40 text-emerald-800">Aprovados (%) ({selectedBim.toUpperCase()})</th>
                    <th className="py-3.5 px-6 text-center bg-rose-50/40 text-rose-800">Reprovados (%) ({selectedBim.toUpperCase()})</th>
                    <th className="py-3.5 px-6 text-center bg-amber-50/40 text-amber-800">Abandonos (%) ({selectedBim.toUpperCase()})</th>
                  </>
                )}
                <th className="py-3.5 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
              {filteredSchools.map((s) => {
                const isEvasaoHigh = (s.evasao || 0) > 2.0;
                const isFreqLow = (s.frequencia || 0) < 92.0;

                const bimAprov = getBimStat(s, 'aprov');
                const bimReprov = getBimStat(s, 'reprov');
                const bimEvasao = getBimStat(s, 'evasao');

                return (
                  <tr key={s.id} className="hover:bg-slate-50/30 transition">
                    <td className="py-4 px-6 font-extrabold text-slate-900 text-sm">{s.nome}</td>
                    <td className="py-4 px-6 text-slate-500">{s.cidade}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{s.matriculas}</td>
                    {selectedBim === 'geral' ? (
                      <>
                        <td className="py-4 px-6 text-center">
                          <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                            isFreqLow 
                              ? 'text-rose-700 bg-rose-50 border border-rose-100' 
                              : 'text-brand-turquoise bg-brand-turquoise/10 border border-brand-turquoise/20'
                          }`}>
                            {s.frequencia?.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className="font-mono font-bold text-brand-orange bg-brand-orange/10 border border-brand-orange/20 px-2 py-0.5 rounded text-xs">
                            {s.aprovacao?.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                            isEvasaoHigh 
                              ? 'text-rose-700 bg-rose-50 border border-rose-100' 
                              : 'text-slate-650 bg-slate-100 border border-slate-200'
                          }`}>
                            {s.evasao?.toFixed(1)}%
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-4 px-6 text-center bg-emerald-55/5">
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-150 text-xs">
                            {bimAprov.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center bg-rose-55/5">
                          <span className="font-mono font-bold text-rose-800 bg-rose-50 px-2.5 py-1 rounded border border-rose-150 text-xs">
                            {bimReprov.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center bg-amber-55/5">
                          <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 text-xs">
                            {bimEvasao.toFixed(1)}%
                          </span>
                        </td>
                      </>
                    )}
                    <td className="py-4 px-6 text-right">
                      {hasSchoolWriteAccess(s.nome) ? (
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-brand-turquoise/10 hover:text-brand-turquoise hover:border-brand-turquoise/20 text-slate-700 border border-slate-200 text-[11px] font-bold rounded-lg transition"
                        >
                          <Edit size={13} className="inline mr-1" /> Editar Fluxo
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md" title="Sem permissão de alteração para este usuário">
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

      {/* Edit Metrics Popup Form */}
      {editingSchool && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white border border-slate-205 rounded-2xl w-full max-w-4xl shadow-2xl relative overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-150 px-5 py-4 flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">Editar Fluxo Escolar Regional</h4>
                <p className="text-[10px] text-slate-500 font-bold max-w-lg mt-0.5">{editingSchool.nome}</p>
              </div>
              <button onClick={() => setEditingSchool(null)} className="text-slate-400 hover:text-slate-600 transition">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveFluxo} className="p-6 space-y-6">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-bold">
                  {formError}
                </div>
              )}

              {/* Upper Section frequency input */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="text-[11px] font-black uppercase text-slate-800">Carga Regional Consolidada</h5>
                  <div className="text-[10px] text-slate-400 font-mono">Consolidação automática calculada do período</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 block">Frequência Geral (%) *</label>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={100}
                      required
                      value={freqInput}
                      onChange={(e) => setFreqInput(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-250 focus:outline-none focus:border-slate-350 text-xs font-mono rounded-xl font-bold text-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center bg-white p-2 rounded-xl border border-slate-200">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Média Aprovação</div>
                      <div className="text-sm font-black text-emerald-800 font-mono">
                        {((parseFloat(b1Aprov) + parseFloat(b2Aprov) + parseFloat(b3Aprov) + parseFloat(b4Aprov)) / 4 || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Média Abandono</div>
                      <div className="text-sm font-black text-rose-800 font-mono">
                        {((parseFloat(b1Aband) + parseFloat(b2Aband) + parseFloat(b3Aband) + parseFloat(b4Aband)) / 4 || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Four columns for B1, B2, B3, B4 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 1º Bimestre */}
                <div className="bg-slate-50/50 border border-slate-150 p-3 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1.5 text-center uppercase tracking-wider">
                    1º Bimestre
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-black text-emerald-800 uppercase block">Aprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b1Aprov || ''} onChange={(e) => setB1Aprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-rose-800 uppercase block">Reprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b1Reprov || ''} onChange={(e) => setB1Reprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-amber-800 uppercase block">Abandonos (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b1Aband || ''} onChange={(e) => setB1Aband(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* 2º Bimestre */}
                <div className="bg-slate-50/50 border border-slate-150 p-3 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1.5 text-center uppercase tracking-wider">
                    2º Bimestre
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-black text-emerald-800 uppercase block">Aprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b2Aprov || ''} onChange={(e) => setB2Aprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-rose-800 uppercase block">Reprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b2Reprov || ''} onChange={(e) => setB2Reprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-amber-800 uppercase block">Abandonos (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b2Aband || ''} onChange={(e) => setB2Aband(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* 3º Bimestre */}
                <div className="bg-slate-50/50 border border-slate-150 p-3 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1.5 text-center uppercase tracking-wider">
                    3º Bimestre
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-black text-emerald-800 uppercase block">Aprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b3Aprov || ''} onChange={(e) => setB3Aprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-rose-800 uppercase block">Reprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b3Reprov || ''} onChange={(e) => setB3Reprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-amber-800 uppercase block">Abandonos (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b3Aband || ''} onChange={(e) => setB3Aband(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* 4º Bimestre */}
                <div className="bg-slate-50/50 border border-slate-150 p-3 rounded-xl space-y-3">
                  <div className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-1.5 text-center uppercase tracking-wider">
                    4º Bimestre
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] font-black text-emerald-800 uppercase block">Aprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b4Aprov || ''} onChange={(e) => setB4Aprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-rose-800 uppercase block">Reprovados (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b4Reprov || ''} onChange={(e) => setB4Reprov(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-amber-800 uppercase block">Abandonos (%)</label>
                      <input
                        type="number" step={0.1} min={0} max={100} required
                        value={b4Aband || ''} onChange={(e) => setB4Aband(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 focus:outline-none focus:border-brand-turquoise text-xs rounded-lg font-mono text-center font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom save/cancel buttons */}
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSchool(null)}
                  className="px-4 py-2 border border-slate-250 hover:bg-slate-55 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase rounded-xl transition shadow-sm"
                >
                  Salvar Fluxo Regional
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
