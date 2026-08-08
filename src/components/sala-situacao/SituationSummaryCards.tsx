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
    escolasComNotasConsideradas,
    escolasComFluxoInformado,
    escolasComPendencias,
    escolasComFontesIndisponiveis,
  } = summary;

  // Nova identidade visual — paleta reduzida e semântica (seção 1): neutro
  // para indicadores informativos, âmbar só para atenção real, vermelho só
  // para o que precisa de ação — nunca uma cor decorativa por cartão.
  const cards = [
    {
      label: 'Escolas acompanhadas', icon: <GraduationCap size={16} />,
      value: escolasAcompanhadas,
      detail: `${escolasComAnoConfigurado} com ano letivo configurado`,
      accent: 'neutral',
    },
    {
      label: 'Turmas ativas', icon: <LayoutGrid size={16} />,
      value: turmasAtivas,
      detail: `${matriculaAtual.toLocaleString('pt-BR')} matrículas atuais`,
      accent: 'neutral',
    },
    {
      label: 'Registro mensal em dia', icon: <CalendarCheck size={16} />,
      value: escolasComRegistroMensalEmDia,
      detail: `de ${escolasAcompanhadas} escola(s)`,
      accent: 'neutral',
    },
    {
      // Revisão do code review do PR #17, seção 5: percentual ponderado
      // (soma de lançamentos realizados / soma de lançamentos esperados de
      // toda a carteira/visão global) — nunca a média simples do percentual
      // de cada escola.
      label: 'Preenchimento de notas', icon: <Users size={16} />,
      value: percentualPreenchimentoNotas == null ? '—' : `${percentualPreenchimentoNotas.toFixed(1)}%`,
      detail: percentualPreenchimentoNotas == null
        ? 'Nenhuma escola com dado calculável'
        : `ponderado — ${escolasComNotasConsideradas} escola(s) consideradas`,
      accent: 'neutral',
    },
    {
      label: 'Fluxo informado', icon: <FileCheck2 size={16} />,
      value: escolasComFluxoInformado,
      detail: `de ${escolasAcompanhadas} escola(s)`,
      accent: 'neutral',
    },
    {
      label: 'Escolas com pendências', icon: <AlertTriangle size={16} />,
      value: escolasComPendencias,
      detail: `de ${escolasAcompanhadas} escola(s)`,
      accent: 'attention',
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
      accent: escolasComFontesIndisponiveis === 0 ? 'neutral' : 'critical',
    },
  ] as const;

  const ACCENT_CLASSES: Record<'neutral' | 'attention' | 'critical', string> = {
    neutral: 'text-brand-green bg-brand-green-light',
    attention: 'text-brand-orange-dark bg-brand-orange-light',
    critical: 'text-brand-coral-dark bg-brand-coral-light',
  };

  const CARD_BG_CLASSES: Record<'neutral' | 'attention' | 'critical', string> = {
    neutral: 'bg-brand-green-light border-brand-green/30',
    attention: 'bg-brand-orange-light border-brand-orange/30',
    critical: 'bg-brand-coral-light border-brand-coral/30',
  };

  const VALUE_CLASSES: Record<'neutral' | 'attention' | 'critical', string> = {
    neutral: 'text-brand-green-dark',
    attention: 'text-brand-orange-dark',
    critical: 'text-brand-coral-dark',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(card => (
        <div key={card.label} className={`${CARD_BG_CLASSES[card.accent]} border rounded-xl p-4 shadow-sm`}>
          <div className="flex items-center justify-between">
            <span className="text-label uppercase text-slate-400">{card.label}</span>
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ACCENT_CLASSES[card.accent]}`}>
              {card.icon}
            </span>
          </div>
          <div className={`text-xl font-extrabold mt-2 ${VALUE_CLASSES[card.accent]}`}>
            {loading ? '—' : card.value}
          </div>
          <p className="text-caption text-slate-500 font-semibold mt-1">{loading ? '' : card.detail}</p>
        </div>
      ))}
    </div>
  );
}
