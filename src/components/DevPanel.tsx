import { useState, useMemo } from 'react';
import {
  FileCode,
  Layers,
  Zap,
  Check,
  X,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Database,
  Play,
  Terminal,
  Laptop,
  GitBranch,
  Cloud,
  Eye,
  Info
} from 'lucide-react';
import { RECOMMENDATIONS } from '../data/projectData';
import { Recommendation } from '../types';
import InteractiveDocViewer from './InteractiveDocViewer';

interface DevPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DevPanel({ isOpen, onClose }: DevPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'auditoria' | 'simulator' | 'architect' | 'inspector'>('auditoria');
  
  // Recommendations state
  const [selectedRecId, setSelectedRecId] = useState<string>('rec-redundancia');
  const activeRec = useMemo(() => {
    return RECOMMENDATIONS.find(r => r.id === selectedRecId) || RECOMMENDATIONS[0];
  }, [selectedRecId]);

  // -- STATE FOR INTERACTIVE SIMULATOR (FIREBASE RULES) --
  const [simulatedRole, setSimulatedRole] = useState<'admin' | 'gestor' | 'tecnico' | 'unauthorized'>('gestor');
  const [simulatedAction, setSimulatedAction] = useState<string>('update_school_stats');
  const [simulatedCrede, setSimulatedCrede] = useState<string>('crede-03');
  const [simulatorLogs, setSimulatorLogs] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<'success' | 'failure' | null>(null);

  // -- STATE FOR PIPELINE SIMULATOR --
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'running' | 'success'>('idle');

  const runPipelineSimulation = () => {
    setIsSyncingAll(true);
    setPipelineStatus('running');
    setPipelineLogs([
      "🖥️ [Computador] Detectando modificações locais no arquivo 'firestore.rules'...",
      "🖥️ [Computador] Código de tipos strict habilitado temporariamente para validação pré-vôo.",
    ]);

    setTimeout(() => {
      setPipelineLogs(prev => [...prev, "🐙 [GitHub] Efetuando push para repositório: sefor3-gestao-regional em branch 'main'"]);
      setTimeout(() => {
        setPipelineLogs(prev => [...prev, "⚙️ [GitHub Actions] Iniciando pipeline de build e testes 'deploy-rules-to-firebase-crede.yml'..."]);
        setTimeout(() => {
          setPipelineLogs(prev => [...prev, "⚙️ [GitHub Actions] Linter verificado, build de produção bem-sucedido!"]);
          setTimeout(() => {
            setPipelineLogs(prev => [
              ...prev, 
              "🔥 [Firebase: crede] Autenticando token de infraestrutura...",
              "🔥 [Firebase: crede] Upload de firestore.rules para o console oficial aceito com sucesso!"
            ]);
            setTimeout(() => {
              setPipelineLogs(prev => [...prev, "🚀 [Pipeline] Sincronização Tríplice Completa! Regras da regional 'crede' propagadas globalmente. ✅"]);
              setIsSyncingAll(false);
              setPipelineStatus('success');
            }, 800);
          }, 800);
        }, 800);
      }, 850);
    }, 700);
  };

  // -- STATE FOR COST/CACHING CALCULATOR --
  const [schoolsCount, setSchoolsCount] = useState<number>(7);
  const [dailyReadsPerSchool, setDailyReadsPerSchool] = useState<number>(120);
  const [useReactQuery, setUseReactQuery] = useState<boolean>(true);

  // Simulator core rules interpreter logic
  const handleRunSimulation = () => {
    setIsSimulating(true);
    setSimulationResult(null);
    setSimulatorLogs([
      `[Firebase] Inicializando simulador local do Firestore...`,
      `[Request] Efetuando chamada para /crede/${simulatedCrede}/escolas/escola-ceara-10`
    ]);

    setTimeout(() => {
      const logs = [];
      let isAllowed = false;

      logs.push(`[Auth] Identidade: request.auth.uid = "uid_${simulatedRole}"`);
      logs.push(`[Auth] Provedor de Email: Seduc Verified = ${simulatedRole !== 'unauthorized'}`);

      if (simulatedRole === 'unauthorized') {
        logs.push(`[Eval] Erro: Usuário sem login detectado (request.auth == null).`);
        logs.push(`[Rule] Match /crede/{credeId}/escolas/{escolaId} => REJEITADO (Falhou: emailVerified())`);
        isAllowed = false;
      } else {
        logs.push(`[Eval] Autorizado: isSignedIn() && emailVerified() => VERDADEIRO`);

        if (simulatedAction === 'read_all_escolas') {
          logs.push(`[Rule] allow read: if emailVerified() => PERMITIDO`);
          isAllowed = true;
        } else if (simulatedAction === 'create_escola') {
          logs.push(`[Check] Chamada: Create (Escola nova)`);
          logs.push(`[Check] exists(/databases/$(database)/documents/crede/${simulatedCrede}/admins/uid_${simulatedRole})`);
          if (simulatedRole === 'admin') {
            logs.push(`[Check] Registro localizado nos admins da Regional.`);
            logs.push(`[Rule] allow create: if isCredeAdmin(credeId) => PERMITIDO`);
            isAllowed = true;
          } else {
            logs.push(`[Check] Relação de administrador não encontrada para uid_${simulatedRole}.`);
            logs.push(`[Rule] allow create: if isCredeAdmin(credeId) => REJEITADO`);
            isAllowed = false;
          }
        } else if (simulatedAction === 'update_school_stats') {
          logs.push(`[Check] Chamada: Update (Mudança de Matrículas / IDEB)`);
          logs.push(`[Check] request.resource.data.diff(resource.data).affectedKeys()`);
          logs.push(`[Eval] Chaves enviadas: ['matriculas', 'idebMedio'] => hasOnly(['matriculas', 'idebMedio']) => VERDADEIRO`);
          if (simulatedRole === 'admin') {
            logs.push(`[Rule] Permitido via Admin da CREDE => PERMITIDO`);
            isAllowed = true;
          } else if (simulatedRole === 'gestor') {
            logs.push(`[Check] Staff Gestor de Escola localizado!`);
            logs.push(`[Rule] allow update: if isSchoolStaff(credeId, escolaId) => PERMITIDO`);
            isAllowed = true;
          } else {
            logs.push(`[Check] uid_tecnico não possui cargo administrativo de Direção Escolar.`);
            logs.push(`[Rule] allow update: if isSchoolStaff(...) => REJEITADO`);
            isAllowed = false;
          }
        } else if (simulatedAction === 'update_school_essential') {
          logs.push(`[Check] Chamada: Update de Chave Protegida (Tenta sobrescrever código INEP / Nome da Escola)`);
          logs.push(`[Check] request.resource.data.diff(resource.data).affectedKeys()`);
          logs.push(`[Eval] Chaves modificadas: ['codInep', 'nome']`);
          logs.push(`[Eval] hasOnly(['matriculas', 'idebMedio']) => FALSO (Tentativa de alteração de chave protegida!)`);
          if (simulatedRole === 'admin') {
            logs.push(`[Rule] Permitido via Admin Geral (isCredeAdmin) => PERMITIDO`);
            isAllowed = true;
          } else {
            logs.push(`[Rule] Rejeitado! Gestores e Técnicos de escola não podem alterar dados estruturais cadastrais => REJEITADO`);
            isAllowed = false;
          }
        } else if (simulatedAction === 'add_visita_tecnica') {
          logs.push(`[Rule] allow create: match /visitas/{visitaId} => isCredeAdmin() ou isSchoolStaff()`);
          if (simulatedRole === 'admin' || simulatedRole === 'gestor') {
            isAllowed = true;
          } else {
            logs.push(`[Rule] Técnicos só podem cadastrar relatórios com aprovação (isSchoolStaff) => REJEITADO`);
            isAllowed = false;
          }
        }
      }

      setSimulatorLogs(prev => [
        ...prev,
        ...logs,
        isAllowed 
          ? `[FIREBASE SUCCESS] Transação autorizada com sucesso! ✅` 
          : `[FIREBASE PERMISSION_DENIED] Erro de regra de segurança (Erro 403) ❌`
      ]);
      setSimulationResult(isAllowed ? 'success' : 'failure');
      setIsSimulating(false);
    }, 1000);
  };

  // Cost calculator data
  const monthlyCostEstimate = useMemo(() => {
    const rawReads = schoolsCount * dailyReadsPerSchool * 30; // monthly
    const readsWithCache = useReactQuery ? rawReads * 0.15 : rawReads; // cache saves 85% of reads
    const estimatedCostFirebase = (readsWithCache / 100000) * 0.06;
    
    return {
      rawReads: Math.round(rawReads),
      cachedReads: Math.round(readsWithCache),
      cost: estimatedCostFirebase < 0.01 ? "0.01" : estimatedCostFirebase.toFixed(2),
      savings: Math.round(rawReads - readsWithCache),
    };
  }, [schoolsCount, dailyReadsPerSchool, useReactQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
      <div 
        className="bg-slate-900 border border-slate-700/60 rounded-3xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header toolbar */}
        <div className="bg-[#0b1424] px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-blue-400">
              <Terminal size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-blue-950 border border-blue-800 text-blue-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider">DevOps Panel</span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                  Conexão Ativa
                </span>
              </div>
              <h2 className="text-sm font-extrabold text-white">Central de Auditoria, Sincronização & Simulação Sefor 3</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg border border-slate-705 transition flex items-center gap-1.5"
          >
            <X size={14} /> Fechar Painel dev
          </button>
        </div>

        {/* DevOps Triad Synchronization Panel (PC <-> GitHub <-> Firebase "crede") */}
        <div className="bg-[#0e1726] border-b border-slate-800 p-5 p-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-200">Sincronização Tríplice Ativa: Computador (PC) ↔ GitHub ↔ Firebase</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Seu projeto local está sincronizado sob a entidade do Firestore chamada <code className="text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded border border-emerald-900/50 font-mono font-bold">crede</code>.</p>
            </div>
            <button
              onClick={runPipelineSimulation}
              disabled={isSyncingAll}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shrink-0"
            >
              <RefreshCw size={12} className={isSyncingAll ? "animate-spin" : ""} />
              {isSyncingAll ? "Sincronizando..." : "Simular Git Push & Deploy 'crede'"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5">
              <Laptop size={15} className="text-emerald-400 mt-0.5" />
              <div className="flex-1 min-w-0 text-[11=px]">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Computador Local (PC Workspace)</div>
                <div className="text-xs font-bold text-white leading-tight">Ambiente de Desenvolvimento</div>
                <div className="text-[9px] text-emerald-400 font-mono mt-0.5">✓ Código Fortalecido</div>
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5">
              <GitBranch size={15} className="text-blue-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Repositório Remoto (GitHub)</div>
                <div className="text-xs font-bold text-white leading-tight">sefor3-regional (main)</div>
                <div className="text-[9px] text-blue-400 font-mono mt-0.5">{pipelineStatus === 'running' ? 'Executando Actions...' : 'Sincronizado'}</div>
              </div>
            </div>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-2.5">
              <Cloud size={15} className="text-orange-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Banco de Dados (Firebase)</div>
                <div className="text-xs font-bold text-white leading-tight">Coleção /crede</div>
                <div className="text-[9px] text-orange-400 font-mono mt-0.5">Ativo em Ceará-Region</div>
              </div>
            </div>
          </div>

          {pipelineLogs.length > 0 && (
            <div className="mt-3 bg-slate-950 rounded-lg p-3 font-mono text-[11px] text-slate-350 max-h-[100px] overflow-y-auto border border-slate-800">
              {pipelineLogs.map((log, index) => (
                <div key={index} className={log.includes("✅") ? "text-emerald-400" : log.includes("🔥") ? "text-orange-400" : ""}>{log}</div>
              ))}
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="bg-[#0b1424]/40 px-6 py-2 border-b border-slate-800 flex flex-wrap gap-2">
          {[
            { id: 'auditoria', label: 'Recomendações de Auditoria', icon: Sliders },
            { id: 'simulator', label: 'Simulador de Security Rules', icon: ShieldCheck },
            { id: 'architect', label: 'Cálculo de Caching (SWR/Query)', icon: Sliders },
            { id: 'inspector', label: 'Inspeção de Códigos do PC', icon: FileCode }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`py-1.5 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  activeSubTab === tab.id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Content Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-900/40 text-slate-200">
          
          {/* 1. AUDITORIA RECOMMENDS */}
          {activeSubTab === 'auditoria' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              <div className="lg:col-span-4 flex flex-col gap-3">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Pontos Críticos Avaliados</h4>
                <div className="space-y-2">
                  {RECOMMENDATIONS.map((rec) => (
                    <button
                      key={rec.id}
                      onClick={() => setSelectedRecId(rec.id)}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all flex flex-col ${
                        selectedRecId === rec.id
                          ? 'bg-[#1b2b48] border-blue-500 text-white'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-350'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          rec.severity === 'high' 
                            ? 'bg-rose-950/60 border-rose-800 text-rose-350' 
                            : 'bg-amber-950/60 border-amber-800 text-amber-350'
                        }`}>
                          {rec.severity}
                        </span>
                        <span className="text-[9px] font-mono opacity-60 uppercase">{rec.category}</span>
                      </div>
                      <h4 className="text-xs font-black leading-snug">{rec.title}</h4>
                      <p className="text-[10px] leading-relaxed opacity-75 mt-1 line-clamp-2">{rec.summary}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-8 bg-slate-950 rounded-2xl border border-slate-800/80 p-5 flex flex-col gap-4 overflow-y-auto">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest block font-bold">Diagnóstico Profundo</span>
                    <h3 className="text-sm font-bold text-white mt-0.5">{activeRec.title}</h3>
                  </div>
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-blue-400">
                    <Layers size={16} />
                  </div>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <h5 className="font-extrabold text-orange-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <AlertTriangle size={13} /> Diagnóstico da Falha:
                    </h5>
                    <p className="p-3 bg-red-950/20 text-slate-300 rounded-xl border border-red-950/50 leading-relaxed">
                      {activeRec.diagnostic}
                    </p>
                  </div>

                  <div>
                    <h5 className="font-extrabold text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <Check size={13} /> Correção Proposta para o Computador:
                    </h5>
                    <p className="p-3 bg-emerald-950/20 text-slate-300 rounded-xl border border-emerald-950/30 leading-relaxed">
                      {activeRec.solution}
                    </p>
                  </div>

                  {activeRec.codeSuggestion && (
                    <div className="flex flex-col gap-1.5">
                      <h5 className="font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileCode size={13} /> Bloco de Substituição Recomendado:
                      </h5>
                      <div className="relative rounded-xl overflow-hidden border border-slate-800">
                        <pre className="p-4 bg-[#050a14] rounded-xl text-[11px] font-mono leading-5 text-emerald-400 overflow-x-auto max-h-[180px]">
                          <code>{activeRec.codeSuggestion}</code>
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. FIRESTORE SECURITY RULES SIMULATOR */}
          {activeSubTab === 'simulator' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
              <div className="lg:col-span-5 bg-slate-950 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                    <ShieldCheck className="text-blue-400" size={16} />
                    Simular Permissões de Segurança
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">Interprete e faça debug das regras declaradas no <code className="text-orange-400 bg-slate-900 border border-slate-800 px-1 py-0.5 rounded font-mono">firestore.rules</code> em tempo real.</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block">1. Usuário Solicitante:</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'admin', label: 'Admin Regional (CREDE)', mail: 'admin@crede.ce.gov.br' },
                        { id: 'gestor', label: 'Diretor Escolar', mail: 'gestor@crede.ce.gov.br' },
                        { id: 'tecnico', label: 'Técnico Pedagógico', mail: 'tecnico@crede.ce.gov.br' },
                        { id: 'unauthorized', label: 'Visitante (Público)', mail: 'Sem Credenciais' }
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSimulatedRole(p.id as any)}
                          className={`p-2 rounded-xl text-left border ${
                            simulatedRole === p.id 
                              ? 'bg-blue-950 border-blue-500 text-blue-300' 
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="text-xs font-bold leading-tight">{p.label}</div>
                          <div className="text-[9px] opacity-75 font-mono truncate">{p.mail}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block">2. Ação Requisitada:</label>
                    <select
                      value={simulatedAction}
                      onChange={(e) => setSimulatedAction(e.target.value)}
                      className="w-full p-2.5 bg-slate-900 text-xs text-white rounded-xl border border-slate-850 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="read_all_escolas">📖 Ver Indicadores Regionais (Read /crede)</option>
                      <option value="create_escola">➕ Cadastrar Nova Escola na Regional (Create /crede/.../escolas)</option>
                      <option value="update_school_stats">📊 Atualizar Matrículas & IDEB (Update Chaves Mutáveis)</option>
                      <option value="update_school_essential">⚠️ Editar Código INEP & Nome (Update Chaves Administrativas)</option>
                      <option value="add_visita_tecnica">🗒️ Agendar Visita Pedagógica (Create /visitas)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block">3. CREDE Vinculada:</label>
                    <div className="flex gap-2">
                      {['crede-01', 'crede-03', 'crede-11'].map((crede) => (
                        <button
                          key={crede}
                          onClick={() => setSimulatedCrede(crede)}
                          className={`flex-1 py-1 px-2.5 rounded-lg border text-[11px] font-mono transition-all uppercase font-bold text-center ${
                            simulatedCrede === crede
                              ? 'bg-blue-950 border-blue-500 text-blue-300'
                              : 'bg-slate-900 border-slate-800 text-slate-500'
                          }`}
                        >
                          {crede === 'crede-03' ? 'CREDE 03 (Sefor 3)' : crede.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleRunSimulation}
                    disabled={isSimulating}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase cursor-pointer tracking-wider rounded-xl shadow mt-2 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isSimulating ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                    {isSimulating ? 'Interpretando regras...' : 'Disparar Chamada ao Firestore'}
                  </button>
                </div>
              </div>

              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col justify-between overflow-hidden min-h-[350px]">
                <div className="bg-slate-900/60 px-4 py-2 border-b border-slate-800 flex items-center justify-between font-mono text-[10px] text-slate-400">
                  <span>TERMINAL LOG: CONSOLE DA REGIONAL (FIREBASE GRATED)</span>
                  <span className="text-emerald-450 animate-pulse">● EMULAÇÃO EM TEMPO REAL</span>
                </div>

                <div className="p-4 font-mono text-[11px] text-slate-350 flex-1 space-y-1.5 overflow-y-auto leading-relaxed max-h-[290px]">
                  {simulatorLogs.length === 0 ? (
                    <div className="h-full flex flex-col justify-center items-center text-slate-600 text-center py-10 gap-2">
                      <Database size={28} />
                      <p className="max-w-xs text-[11px]">Nenhuma transação iniciada. Configure as seleções de payload à esquerda e clique para disparar.</p>
                    </div>
                  ) : (
                    simulatorLogs.map((log, idx) => {
                      let tagColor = "text-slate-400";
                      if (log.includes("[FIREBASE SUCCESS]")) tagColor = "text-emerald-400 font-bold bg-emerald-950/50 p-2.5 rounded border border-emerald-900/40 inline-block w-full mt-2";
                      if (log.includes("[FIREBASE PERMISSION_DENIED]")) tagColor = "text-rose-400 font-bold bg-rose-950/40 p-2.5 rounded border border-rose-900/40 inline-block w-full mt-2";
                      if (log.includes("[Rule]")) tagColor = "text-blue-400";
                      if (log.includes("[Eval]")) tagColor = "text-orange-400";
                      return (
                        <div key={idx} className={`${tagColor} py-0.5 whitespace-pre-wrap`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>

                {simulationResult && (
                  <div className={`p-3 bg-slate-900/50 border-t border-slate-800 text-[11px] flex items-center gap-2.5 ${
                    simulationResult === 'success' ? 'text-emerald-400 border-t-emerald-950' : 'text-rose-450 border-t-rose-950'
                  }`}>
                    {simulationResult === 'success' ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                    <div>
                      <span className="font-bold">{simulationResult === 'success' ? 'CONCEDIDO!' : 'NEGADO! (403)'}</span>
                      <span className="opacity-80 pl-1.5">
                        {simulationResult === 'success' 
                          ? 'A transação do banco atende 100% aos checks gramaticais do seu firestore.rules.'
                          : 'Tentativa abortada em modo sandbox para evitar corrupção de dados da CREDE.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. COST CALCULATOR */}
          {activeSubTab === 'architect' && (
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl flex flex-col gap-5">
              <div className="max-w-2xl">
                <span className="text-[10px] uppercase font-mono text-emerald-400 tracking-wider font-bold">Consumo de Banda por Categoria</span>
                <h3 className="text-sm font-bold text-white mt-1">Impacto Financeiro de Queries Repetitivas (Plano Blaze)</h3>
                <p className="text-xs text-slate-400 mt-1">Como cada requisição de documento no Firestore gera custos, aplicar soluções de caching como React Query / SWR previne sobrecargas econômicas e melhora o tempo de resposta do sistema educativo do Ceará.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Volume de Escolas na CREDE</span>
                  <input 
                    type="range"
                    min={10}
                    max={250}
                    value={schoolsCount}
                    onChange={(e) => setSchoolsCount(parseInt(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs font-mono font-bold text-white mt-1">
                    <span>Mínimo: 10</span>
                    <span className="text-blue-400">{schoolsCount} Escolas</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Leituras/Técnico por dia</span>
                  <input
                    type="range"
                    min={20}
                    max={500}
                    value={dailyReadsPerSchool}
                    onChange={(e) => setDailyReadsPerSchool(parseInt(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs font-mono font-bold text-white mt-1">
                    <span>Mínimo: 20</span>
                    <span className="text-blue-400">{dailyReadsPerSchool} Reads/doc</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white uppercase block">Caching Ativado?</span>
                    <span className="text-[10px] text-slate-400 leading-tight">Usa React Query Cache localmente</span>
                  </div>
                  <button
                    onClick={() => setUseReactQuery(p => !p)}
                    className={`w-12 h-6 rounded-full p-1 transition-all flex items-center ${
                      useReactQuery ? 'bg-blue-600 justify-end' : 'bg-slate-700 justify-start'
                    }`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full block shadow-sm" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80">
                  <span className="text-[9px] text-slate-500 uppercase font-black">Raw API Reads (Mensal)</span>
                  <div className="text-sm font-bold text-rose-450 font-mono mt-1">{(monthlyCostEstimate.rawReads / 1000).toLocaleString()}k reqs</div>
                  <p className="text-[9px] text-slate-400 mt-1 leading-snug">Cada troca de aba força reloads brutos síncronos no client.</p>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-850">
                  <span className="text-[9px] text-emerald-400 uppercase font-black">Optimized SWR (Mensal)</span>
                  <div className="text-sm font-bold text-emerald-400 font-mono mt-1">{(monthlyCostEstimate.cachedReads / 1000).toLocaleString()}k reqs</div>
                  <p className="text-[9px] text-slate-405 mt-1 leading-snug">TanStack Query restringe re-renders e economiza 85%.</p>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-850">
                  <span className="text-[9px] text-slate-500 uppercase font-black">Faturamento Mensal</span>
                  <div className="text-sm font-bold text-white font-mono mt-1">${monthlyCostEstimate.cost} USD</div>
                  <p className="text-[9px] text-slate-400 mt-1">Cobrado pela cota de requisições de documentos no Firebase.</p>
                </div>
                <div className="p-3 bg-emerald-950/20 rounded-xl border border-emerald-900/40">
                  <span className="text-[9px] text-emerald-300 uppercase font-black">Economia de Infra</span>
                  <div className="text-sm font-bold text-emerald-300 font-mono mt-1">{(monthlyCostEstimate.savings / 1000).toLocaleString()}k reqs</div>
                  <p className="text-[9px] text-emerald-400/80 mt-1">Redução de requisições no servidor de produção da regional.</p>
                </div>
              </div>
            </div>
          )}

          {/* 4. CODE INSPECTOR TAB */}
          {activeSubTab === 'inspector' && (
            <div className="h-full">
              <InteractiveDocViewer />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
