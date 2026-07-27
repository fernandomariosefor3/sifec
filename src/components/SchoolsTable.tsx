import type { ReactNode } from 'react';
import { MapPin, Edit, Lock, ClipboardList, AlertTriangle } from 'lucide-react';
import { isCurrentUserAdmin } from '../lib/superintendentService';
import { COVERAGE_STATUS_LABELS, describeCoverageStatus, formatEnrollmentValue } from '../lib/enrollmentCalculations';
import type { SchoolEnrollmentSummary } from '../hooks/useSchoolEnrollmentSummaries';

const COVERAGE_BADGE_CLASSES: Record<string, string> = {
  completo: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  parcial: 'bg-amber-50 border-amber-200 text-amber-700',
  nao_informado: 'bg-slate-100 border-slate-200 text-slate-500',
};

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

interface SchoolsTableProps {
  schools: School[];
  summaries: Record<string, SchoolEnrollmentSummary>;
  summariesLoading: boolean;
  summaryErrors: Record<string, string>;
  onEdit: (school: School) => void;
  onOpenEnrollmentPanel: (school: School) => void;
}

// Enquanto carrega, mostra "Carregando..."; sem resumo confirmado (ainda
// não carregou, ou falhou), mostra "Não informado" — nunca 0 por ausência
// do dado (seção 10 do plano). Zero só aparece depois que o resumo
// carregou e confirmou o valor real.
function summaryCell(loading: boolean, hasSummary: boolean, value: ReactNode): ReactNode {
  if (loading) return <span className="text-slate-400 font-normal">Carregando...</span>;
  if (!hasSummary) return <span className="text-slate-400 font-normal">Não informado</span>;
  return value;
}

// Duas colunas ficam fixas durante a rolagem horizontal (correção de
// usabilidade — a tabela é larga e o usuário perdia a referência de qual
// escola e qual ação estava vendo): o nome da escola à esquerda, as ações
// à direita. `border-separate` (em vez de `border-collapse`) evita o bug
// conhecido de `position: sticky` quebrar dentro de tabelas com bordas
// colapsadas em alguns navegadores (Safari). Fundo sólido (`bg-white`) nas
// células fixas para o conteúdo das colunas do meio nunca aparecer por trás
// durante a rolagem.
const STICKY_LEFT_CLASSES = 'sticky left-0 z-10 bg-white';
const STICKY_RIGHT_CLASSES = 'sticky right-0 z-10 bg-white';

export default function SchoolsTable({ schools, summaries, summariesLoading, summaryErrors, onEdit, onOpenEnrollmentPanel }: SchoolsTableProps) {
  // Edição do registro mestre (nome/INEP/indicadores) é restrita a
  // administrador (revisão final PR #8, seção 4) — superintendente comum
  // só usa "Preencher dados 2026". Calculado uma vez, não por linha.
  const canEditMasterRecord = isCurrentUserAdmin();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-6">Código INEP</th>
              <th className={`py-3.5 px-6 ${STICKY_LEFT_CLASSES}`}>Nome da Unidade Escolar</th>
              <th className="py-3.5 px-6">Sede / Cidade</th>
              <th className="py-3.5 px-6 text-right">Matrícula inicial 2026</th>
              <th className="py-3.5 px-6 text-right">Matrícula atual</th>
              <th className="py-3.5 px-6 text-right">Variação</th>
              <th className="py-3.5 px-6 text-right">Turmas ativas</th>
              <th className="py-3.5 px-6 text-center">Cobertura mensal</th>
              <th className="py-3.5 px-6 text-right">Média/turma</th>
              <th className="py-3.5 px-6 text-right">Entradas acum.</th>
              <th className="py-3.5 px-6 text-right">Saídas acum.</th>
              <th className="py-3.5 px-6">Última atualização</th>
              <th className="py-3.5 px-6 text-center">Meta SPAECE 2026</th>
              <th className="py-3.5 px-6 text-center">Meta IDEB</th>
              <th className="py-3.5 px-6 text-center">Status</th>
              <th className={`py-3.5 px-6 text-right ${STICKY_RIGHT_CLASSES}`}>Ações</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 font-medium">
            {schools.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-12 text-center text-slate-400 font-normal border-b border-slate-100">
                  Nenhuma escola corresponde aos critérios de pesquisa informados.
                </td>
              </tr>
            ) : (
              schools.map((school) => {
                const summary = summaries[school.id];
                const hasSummary = summary != null;
                const summaryError = summaryErrors[school.id];
                return (
                  <tr key={school.id} className="hover:bg-slate-55/40 transition">
                    <td className="py-4 px-6 font-mono text-slate-500 text-[11px] font-bold border-b border-slate-100">{school.codInep}</td>
                    <td className={`py-4 px-6 font-extrabold text-slate-900 text-sm border-b border-slate-100 ${STICKY_LEFT_CLASSES}`}>
                      {school.nome}
                      {summaryError && (
                        <span title={summaryError} className="ml-1.5 inline-flex text-amber-500 align-middle">
                          <AlertTriangle size={12} />
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 border-b border-slate-100">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-slate-400" />
                        {school.cidade}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, formatEnrollmentValue(summary?.matriculaInicial))}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, formatEnrollmentValue(summary?.matriculaAtual))}
                    </td>
                    <td className="py-4 px-6 text-right font-bold border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary?.variacao == null ? (
                        <span className="text-slate-400 font-normal">Não informado</span>
                      ) : (
                        <span className={summary.variacao >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {summary.variacao >= 0 ? `+${summary.variacao}` : summary.variacao}
                        </span>
                      ))}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-700 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary?.turmasAtivas)}
                    </td>
                    <td className="py-4 px-6 text-center border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary && (() => {
                        const status = describeCoverageStatus(summary.coveredClassCount, summary.turmasAtivas);
                        return (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${COVERAGE_BADGE_CLASSES[status]}`}
                            title={status === 'parcial' ? `Parcial: ${summary.partialMatriculaAtual} alunos em ${summary.coveredClassCount} de ${summary.turmasAtivas} turmas` : undefined}
                          >
                            {summary.coveredClassCount} de {summary.turmasAtivas} — {COVERAGE_STATUS_LABELS[status]}
                          </span>
                        );
                      })())}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-700 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary?.mediaPorTurma == null ? 'Não informado' : summary.mediaPorTurma.toFixed(1))}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-700 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary?.entradasAcumuladas)}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-700 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary?.saidasAcumuladas)}
                    </td>
                    <td className="py-4 px-6 text-[11px] text-slate-500 border-b border-slate-100">
                      {summaryCell(summariesLoading, hasSummary, summary?.ultimaAtualizacao ? summary.ultimaAtualizacao.slice(0, 10) : 'Não informado')}
                    </td>
                    <td className="py-4 px-6 text-center border-b border-slate-100">
                      <span className="font-extrabold text-brand-turquoise font-mono text-xs">{school.idebMedio.toFixed(1)}</span>
                    </td>
                    <td className="py-4 px-6 text-center font-mono font-bold text-slate-500 border-b border-slate-100">{school.metaIdeb.toFixed(1)}</td>
                    <td className="py-4 px-6 text-center border-b border-slate-100">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        school.status === 'Ativo'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {school.status}
                      </span>
                    </td>
                    <td className={`py-4 px-6 text-right border-b border-slate-100 ${STICKY_RIGHT_CLASSES}`}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Ação PRINCIPAL — antes era só um ícone de prancheta, o que
                            escondia o único caminho para preencher matrícula/turmas/
                            registro mensal. Agora tem texto visível, tooltip e
                            aria-label (correção de usabilidade). */}
                        <button
                          onClick={() => onOpenEnrollmentPanel(school)}
                          className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap"
                          title="Preencher dados 2026 — matrícula inicial, turmas e registro mensal"
                          aria-label={`Preencher dados 2026 da escola ${school.nome}`}
                        >
                          <ClipboardList size={14} />
                          Preencher dados 2026
                        </button>
                        {/* Ação secundária — cadastro mestre (nome/INEP/indicadores),
                            restrita a administrador. */}
                        {canEditMasterRecord ? (
                          <button
                            onClick={() => onEdit(school)}
                            className="p-1.5 hover:bg-slate-100 hover:text-blue-750 text-slate-400 rounded-lg transition"
                            title="Editar cadastro mestre (nome, INEP, indicadores)"
                            aria-label={`Editar cadastro mestre da escola ${school.nome}`}
                          >
                            <Edit size={14} />
                          </button>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md"
                            title="Edição do cadastro mestre restrita a administrador"
                          >
                            <Lock size={10} className="text-amber-500" />
                            Restrito
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
