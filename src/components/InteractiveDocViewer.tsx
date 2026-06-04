import { useState } from 'react';
import { ProjectFile } from '../types';
import { USER_PROJECT_FILES } from '../data/projectData';
import { FileCode, Activity, Eye, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function InteractiveDocViewer() {
  const [activeFile, setActiveFile] = useState<ProjectFile>(USER_PROJECT_FILES[0]);

  // Find warnings inside the file content to display inline
  const getLineIssues = (fileName: string, lineText: string) => {
    const issues: { type: 'warning' | 'info' | 'success'; message: string }[] = [];

    if (fileName === "package.json") {
      if (lineText.includes('"@supabase/supabase-js"')) {
        issues.push({
          type: 'warning',
          message: "⚠️ Redundância de Mídia/Infraestrutura: O package.json aponta '@supabase/supabase-js' ao lado de 'firebase'. Unifique os BaaS para evitar bundles inflados nas escolas da regional."
        });
      }
      if (lineText.includes('"firebase"')) {
        issues.push({
          type: 'info',
          message: "ℹ️ Sincronização offline: O Firebase é perfeito para garantir que técnicos em campo preencham formulários de visitas mesmo sem conexão móvel."
        });
      }
      if (lineText.includes('"react": "^19.1.2"')) {
        issues.push({
          type: 'success',
          message: "✨ Motor de Renderização Moderno: Uso do React 19 está otimizado para o Concurrent Mode e carregamento de componentes de indicadores."
        });
      }
    }

    if (fileName === "tsconfig.app.json") {
      if (lineText.includes('"strict": false')) {
        issues.push({
          type: 'warning',
          message: "⚠️ Risco à Escalabilidade: 'strict': false anula a proteção contra nulos (null pointer crashes) na listagem de matrículas e IDEB."
        });
      }
      if (lineText.includes('"noImplicitAny": false')) {
        issues.push({
          type: 'warning',
          message: "⚠️ Tipos Anônimos: 'noImplicitAny': false silencia erros de compilação perigosos na lógica de cálculo de médias escolares."
        });
      }
    }

    if (fileName === "firestore.rules") {
      if (lineText.includes("allow read, write: if false;")) {
        issues.push({
          type: 'success',
          message: "🔒 Portão Mestre Seguro: Negar tudo por padrão garante conformidade com regras rígidas de privacidade de dados estudantis."
        });
      }
      if (lineText.includes("affectedKeys().hasOnly")) {
        issues.push({
          type: 'success',
          message: "🛡️ Proteção Atômica: hasOnly(['matriculas', 'idebMedio']) garante que gestores mudem apenas o permitido."
        });
      }
    }

    return issues;
  };

  const lines = activeFile.content.split('\n');

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden text-slate-850 font-sans" id="doc-viewer-card">
      {/* File Viewer Header */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100 text-blue-700">
            <FileCode size={22} id="file-code-icon" />
          </div>
          <div>
            <h3 className="text-base font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Inspetor de Arquivos do Sistema
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-mono px-2.5 py-0.5 rounded-full border border-emerald-250 uppercase tracking-widest font-black">
                Arquivo Ativo
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-normal">Audite a estrutura real identificada no seu sistema CREDE / SEFOR 3.</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 max-w-full">
          {USER_PROJECT_FILES.map((file) => (
            <button
              id={`file-tab-${file.name.replace('.', '-')}`}
              key={file.name}
              onClick={() => setActiveFile(file)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                activeFile.name === file.name
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {file.name}
            </button>
          ))}
        </div>
      </div>

      {/* Description Banner */}
      <div className="bg-white px-6 py-3 border-b border-slate-150 flex items-start gap-2.5 text-xs text-slate-600">
        <Eye size={16} className="text-blue-600 mt-0.5" id="view-mode-icon" />
        <div>
          <span className="font-bold text-slate-800">Função:</span> {activeFile.description}
        </div>
      </div>

      {/* Code Editor Container */}
      <div className="overflow-x-auto font-mono text-xs leading-5 max-h-[420px] bg-slate-950 text-slate-200" id="code-content-scroller">
        <div className="min-w-full inline-block py-2">
          {lines.map((line, idx) => {
            const lineNum = idx + 1;
            const issues = getLineIssues(activeFile.name, line);
            const hasWarnings = issues.some(i => i.type === 'warning');
            const hasSuccess = issues.some(i => i.type === 'success');

            return (
              <div key={idx} className="flex flex-col">
                <div 
                  className={`flex items-start transition-colors ${
                    hasWarnings 
                      ? 'bg-amber-950/45 border-l-2 border-orange-500/60' 
                      : hasSuccess 
                      ? 'bg-emerald-950/40 border-l-2 border-emerald-500/60'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <span className="w-12 select-none text-slate-500 text-right pr-4 font-mono text-[11px] block py-0.5 border-r border-slate-800">
                    {lineNum}
                  </span>
                  <span className="pl-4 font-mono text-slate-200 whitespace-pre py-0.5 select-all overflow-x-auto block">
                    {line || " "}
                  </span>
                </div>

                {/* Issues list rendering */}
                {issues.map((issue, iIdx) => (
                  <div
                    key={iIdx}
                    className={`flex items-start border-l-4 ml-12 px-4 py-2 mt-0.5 text-xs font-sans gap-2 select-text ${
                      issue.type === 'warning'
                        ? 'bg-orange-950/85 border-orange-500 text-orange-200'
                        : issue.type === 'success'
                        ? 'bg-emerald-950/85 border-emerald-500 text-emerald-200'
                        : 'bg-blue-950/85 border-blue-500 text-blue-200'
                    }`}
                  >
                    {issue.type === 'warning' && <AlertTriangle size={14} className="mt-0.5 text-orange-400 shrink-0" />}
                    {issue.type === 'success' && <CheckCircle2 size={14} className="mt-0.5 text-emerald-400 shrink-0" />}
                    {issue.type === 'info' && <Info size={14} className="mt-0.5 text-blue-400 shrink-0" />}
                    <div>
                      {issue.message}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
