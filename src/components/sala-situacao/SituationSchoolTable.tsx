// Fase 2D — Sala de Situação: tabela por escola (seção 14 do plano). Só
// agregados — nunca nome de estudante, nota individual ou observação
// nominal (o próprio SchoolSituation já vem sem esses campos).
//
// Revisão do code review do PR #16, seção 9: uma escola com sourceFailures
// mostra um aviso discreto direto na linha (nunca exige abrir o detalhe
// para descobrir que há falha), e uma célula cujo domínio está com
// dataQuality 'indisponivel' mostra "Indisponível" em vez do valor
// numérico — um 0/"Não informado" nunca substitui silenciosamente uma
// fonte que falhou.
import { ChevronRight, CloudOff } from 'lucide-react';
import type { SchoolSituation } from '../../types/schoolSituation';
import { DataQualityBadge } from './SituationDataQualityPanel';

const INDISPONIVEL_LABEL = 'Indisponível';

interface SituationSchoolTableProps {
  schools: readonly { id: string; nome: string; codInep: string }[];
  situations: Record<string, SchoolSituation>;
  loading: boolean;
  onSelectSchool: (schoolId: string) => void;
}

const FLOW_STATUS_LABELS: Record<string, string> = {
  nao_informado: 'Não informado',
  rascunho: 'Rascunho',
  confirmado: 'Confirmado',
};

export default function SituationSchoolTable({ schools, situations, loading, onSelectSchool }: SituationSchoolTableProps) {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400 font-bold">
        Carregando situação das escolas...
      </div>
    );
  }

  if (schools.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-400 font-bold">
        Nenhuma escola corresponde ao filtro atual.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-400 font-bold tracking-wider">
            <th className="text-left px-4 py-3">Escola</th>
            <th className="text-left px-3 py-3">INEP</th>
            <th className="text-right px-3 py-3">Turmas ativas</th>
            <th className="text-right px-3 py-3">Matrícula atual</th>
            <th className="text-left px-3 py-3">Últ. registro mensal</th>
            <th className="text-right px-3 py-3">Notas preenchidas</th>
            <th className="text-left px-3 py-3">Fluxo</th>
            <th className="text-left px-3 py-3">Última visita</th>
            <th className="text-left px-3 py-3">Qualidade</th>
            <th className="text-right px-3 py-3">Pendências</th>
            <th className="px-3 py-3" />
          </tr>
        </thead>
        <tbody>
          {schools.map(school => {
            const situation = situations[school.id];
            if (!situation) return null;
            const estruturaIndisponivel = situation.estrutura.dataQuality === 'indisponivel';
            const matriculaIndisponivel = situation.matricula.dataQuality === 'indisponivel';
            const fluxoIndisponivel = situation.fluxo.dataQuality === 'indisponivel';
            const visitasIndisponivel = situation.visitas.dataQuality === 'indisponivel';
            return (
              <tr key={school.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition">
                <td className="px-4 py-3 font-bold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span>{school.nome}</span>
                    {situation.sourceFailures.length > 0 && (
                      <span
                        title={situation.sourceFailures.map(f => f.message).join(' | ')}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-orange-200 bg-orange-50 text-orange-700 text-[9px] font-bold uppercase tracking-wide shrink-0"
                      >
                        <CloudOff size={10} />
                        {situation.sourceFailures.length} fonte{situation.sourceFailures.length > 1 ? 's' : ''} indisponível{situation.sourceFailures.length > 1 ? 'is' : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-slate-500">{school.codInep}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-700">
                  {estruturaIndisponivel ? INDISPONIVEL_LABEL : situation.estrutura.turmasAtivas}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-700">
                  {estruturaIndisponivel ? INDISPONIVEL_LABEL : (situation.estrutura.matriculaAtual ?? 'Não informado')}
                </td>
                <td className="px-3 py-3 font-mono text-slate-500">
                  {matriculaIndisponivel ? INDISPONIVEL_LABEL : (situation.matricula.ultimoMesPreenchido ?? 'Não informado')}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-700">
                  {situation.notas ? `${situation.notas.percentualPreenchimento.toFixed(0)}%` : '—'}
                </td>
                <td className="px-3 py-3 text-slate-600">
                  {fluxoIndisponivel ? INDISPONIVEL_LABEL : FLOW_STATUS_LABELS[situation.fluxo.status]}
                </td>
                <td className="px-3 py-3 font-mono text-slate-500">
                  {visitasIndisponivel ? INDISPONIVEL_LABEL : (situation.visitas.dataUltimaVisita ?? 'Sem visita')}
                </td>
                <td className="px-3 py-3"><DataQualityBadge state={situation.qualidadeGeral} /></td>
                <td className="px-3 py-3 text-right font-mono text-slate-700">{situation.pendencias.length}</td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectSchool(school.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-turquoise-dark hover:underline"
                  >
                    Ver detalhes <ChevronRight size={12} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
