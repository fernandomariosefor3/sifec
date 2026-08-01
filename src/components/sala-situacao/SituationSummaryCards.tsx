// Fase 2D — Sala de Situação: cartões consolidados da carteira/visão
// selecionada (seção 14 do plano). Puramente apresentacional — os totais já
// chegam calculados por calculatePortfolioSituationSummary.
import { GraduationCap, LayoutGrid, Users, CalendarCheck, FileCheck2, AlertTriangle, CloudOff } from 'lucide-react';
import type { PortfolioSituationSummary } from '../../types/schoolSituation';

interface SituationSummaryCardsProps {
  summary: PortfolioSituationSummary;
  loading: boolean;
}

export default function SituationSummaryCards({ summary, loading }: SituationSummaryCardsProps) {
  const {
    escolasAcompanhadas,
    escolasComAnoConfigurado,
    turmasAtivas,
    matriculaAtual,
    escolasComRegistroMensalEmDia,
    percentualPreenchimentoNotas,
    escolasComFluxoInformado,
    escolasComPendencias,
    escolasComFontesIndisponiveis,
  } = summary;

  const cards = [
    {
      label: 'Escolas acompanhadas', icon: <GraduationCap size={16} />,
      value: escolasAcompanhadas,
      detail: `${escolasComAnoConfigurado} com ano letivo configurado`,
      accent: 'border-brand-turquoise/20 bg-brand-turquoise/10 text-brand-turquoise',
    },
    {
      label: 'Turmas ativas', icon: <LayoutGrid size={16} />,
      value: turmasAtivas,
      detail: `${matriculaAtual.toLocaleString('pt-BR')} matrículas atuais`,
      accent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Registro mensal em dia', icon: <CalendarCheck size={16} />,
      value: escolasComRegistroMensalEmDia,
      detail: `de ${escolasAcompanhadas} escola(s)`,
      accent: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    {
      label: 'Preenchimento de notas', icon: <Users size={16} />,
      value: percentualPreenchimentoNotas == null ? '—' : `${percentualPreenchimentoNotas.toFixed(1)}%`,
      detail: percentualPreenchimentoNotas == null ? 'Selecione uma escola para carregar' : 'média das escolas carregadas',
      accent: 'border-violet-200 bg-violet-50 text-violet-700',
    },
    {
      label: 'Fluxo informado', icon: <FileCheck2 size={16} />,
      value: escolasComFluxoInformado,
      detail: `de ${escolasAcompanhadas} escola(s)`,
      accent: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      label: 'Escolas com pendências', icon: <AlertTriangle size={16} />,
      value: escolasComPendencias,
      detail: `de ${escolasAcompanhadas} escola(s)`,
      accent: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    {
      // Revisão do code review do PR #16, seção 9: quantas escolas do
      // conjunto têm ao menos uma fonte indisponível — nunca contabilizada
      // como "dado não informado" nos outros cartões, sempre visível
      // separadamente.
      label: 'Fontes indisponíveis', icon: <CloudOff size={16} />,
      value: escolasComFontesIndisponiveis,
      detail: escolasComFontesIndisponiveis === 0
        ? 'nenhuma escola com falha de leitura'
        : `de ${escolasAcompanhadas} escola(s) com dados parcialmente indisponíveis`,
      accent: 'border-orange-200 bg-orange-50 text-orange-700',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(card => (
        <div key={card.label} className={`bg-white border rounded-2xl p-5 shadow-sm ${card.accent.split(' ')[0]}`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">{card.label}</span>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.accent.split(' ').slice(1).join(' ')}`}>
              {card.icon}
            </span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono mt-2">
            {loading ? '—' : card.value}
          </div>
          <p className="text-[11px] text-slate-500 font-bold mt-1">{loading ? '' : card.detail}</p>
        </div>
      ))}
    </div>
  );
}
