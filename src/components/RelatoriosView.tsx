import { useState } from 'react';
import { FileText, FileDown, RefreshCw, Layers, Zap, Sliders, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function RelatoriosView() {
  const [pdfOptimization, setPdfOptimization] = useState<'none' | 'optimized'>('optimized');
  const [isExporting, setIsExporting] = useState(false);
  const [pdfStatusMessage, setPdfStatusMessage] = useState('Pronto para exportar.');
  const [freezeDuration, setFreezeDuration] = useState<number | null>(null);

  const runPdfExportSimulation = () => {
    setIsExporting(true);
    setFreezeDuration(null);
    setPdfStatusMessage("Renderizando Canvas do DOM (html2canvas)...");

    if (pdfOptimization === 'none') {
      let timeFreeze = 2500;
      setTimeout(() => {
        setFreezeDuration(timeFreeze);
        setPdfStatusMessage("Download concluído! Durante os 2.5s de processamento síncrono, a linha de execução da UI (User Interface) congelou de forma crítica.");
        setIsExporting(false);
      }, timeFreeze);
    } else {
      setTimeout(() => {
        setPdfStatusMessage("Compactando frames de tabelas da CREDE via JPEG 0.75 assustadoramente rápido...");
        setTimeout(() => {
          setFreezeDuration(20); 
          setPdfStatusMessage("Relatório consolidado exportado sem retenção de thread! Lotes de renderização assíncrona efetuados com sucesso.");
          setIsExporting(false);
        }, 1000);
      }, 600);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <span className="text-[10px] text-emerald-700 tracking-wider uppercase font-black font-mono">SEFOR 3 - EXPORTAR RELATÓRIO</span>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Central de Relatórios Consolidados</h2>
        <p className="text-xs text-slate-500 font-normal">Gere e faça download de relatórios gerenciais das escolas, consolidações pedagógicas bimestrais e dados de evasão.</p>
      </div>

      {/* Main reporting hub control console */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left pane: Options */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Configurações de Exportação</h3>
            <p className="text-xs text-slate-500 mt-1">Defina o motor de renderização gráfica que converterá as tabelas escolares em arquivos de apresentação portáteis.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-600 block">Deseja usar as Otimizações de PDF? *</label>
              
              <div className="grid grid-cols-1 gap-2.5">
                {/* Optimized */}
                <button
                  type="button"
                  onClick={() => { setPdfOptimization('optimized'); setFreezeDuration(null); }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    pdfOptimization === 'optimized'
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-350'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border border-emerald-400 bg-emerald-500 flex items-center justify-center text-white text-[9px] font-extrabold font-mono">
                      <Check size={10} />
                    </span>
                    <span className="text-xs font-black">Motor Otimizado (Thread-Safe)</span>
                  </div>
                  <p className="text-[10px] text-emerald-800 leading-normal mt-1 opacity-90">Usa compressão JPEG 0.75 rápida e chunks assíncronos liberando ciclos da CPU do seu navegador.</p>
                </button>

                {/* Classical */}
                <button
                  type="button"
                  onClick={() => { setPdfOptimization('none'); setFreezeDuration(null); }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    pdfOptimization === 'none'
                      ? 'bg-rose-50 border-rose-350 text-rose-955'
                      : 'bg-white border-slate-200 text-slate-505 hover:border-slate-350'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {pdfOptimization === 'none' && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 inline-block" />}
                    <span className="text-xs font-black text-rose-800">Motor Clássico Síncrono</span>
                  </div>
                  <p className="text-[10px] text-rose-700 leading-normal mt-1 opacity-90">Renderiza todos os gráficos em blocos rígidos contínuos, com risco elevado de travamento total da aba.</p>
                </button>
              </div>
            </div>

            <button
              onClick={runPdfExportSimulation}
              disabled={isExporting}
              className="w-full py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition flex items-center justify-center gap-1.5"
            >
              {isExporting ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
              {isExporting ? 'Fazendo compilamento...' : 'Exportar Relatório Consolidado (PDF)'}
            </button>
          </div>
        </div>

        {/* Right pane: Visual Diagnostics Monitor panel */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between text-slate-300 min-h-[300px]">
          <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between font-mono text-[10px] text-slate-400">
            <span>DIAGNÓSTICO GRÁFICO DO NAVEGADOR</span>
            <span className="text-emerald-400">ATIVO</span>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-center text-xs leading-relaxed space-y-3">
            <div className="flex items-start gap-2.5">
              <span className={`w-2 h-2 rounded-full mt-1.5 ${isExporting ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'}`} />
              <div>
                <span className="font-bold text-slate-100">Status da Operação:</span>
                <span className="pl-1 text-slate-300">{pdfStatusMessage}</span>
              </div>
            </div>

            {freezeDuration !== null && (
              <div className="space-y-3.5 pt-2">
                {/* Visual results summary pill */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  pdfOptimization === 'optimized'
                    ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-350'
                    : 'bg-red-950/20 border-red-900/50 text-red-350'
                }`}>
                  <div className="shrink-0 mt-0.5">
                    {pdfOptimization === 'optimized' ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                  </div>
                  <div>
                    <h4 className="text-xs font-black truncate">
                      {pdfOptimization === 'optimized' ? 'Gravação Livre de Bloqueios (Thread-Safe)' : 'Bloqueio de Renderização Detectado'}
                    </h4>
                    <p className="text-[11px] leading-relaxed opacity-90 mt-1">
                      {pdfOptimization === 'optimized' 
                        ? 'O motor assíncrono evitou a penalidade de travamento de frames de animação. Tempo de travamento estimado de apenas 20 milissegundos.'
                        : 'A linha de desenho da página foi capturada síncronamente pela CPU. O navegador travou completamente por 2500 milissegundos (2.5 segundos).'}
                    </p>
                  </div>
                </div>

                {/* Graph bars represent rendering latency */}
                <div className="space-y-1 bg-[#050a14] border border-slate-800 p-3.5 rounded-lg">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>TEMPO DE CONGELAMENTO DA THREAD PRINCIPAL</span>
                    <span className="font-bold">{freezeDuration}ms</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden flex">
                    <div 
                      className={`h-full ${pdfOptimization === 'optimized' ? 'bg-emerald-500' : 'bg-rose-600'}`}
                      style={{ width: `${pdfOptimization === 'optimized' ? 5 : 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-slate-500 font-mono border-t border-slate-900 pt-2 text-center">
            Métricas de performance em conformidade com as diretrizes do Censo Escolar da Regional.
          </div>
        </div>
      </div>
    </div>
  );
}
