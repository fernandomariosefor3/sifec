// Auditoria da reestruturação SIFEC — documentação em tela do critério de
// ranking (nunca só um comentário no código): indicadores, pesos,
// pontuação, tratamento de dados ausentes/indisponíveis, critério de
// desempate, e o aviso permanente de que é um critério técnico provisório,
// nunca uma metodologia oficial validada pela SEFOR 3. Lê os pesos
// diretamente de RISK_WEIGHTS — nunca duplica os números aqui, para nunca
// divergir do que o código realmente calcula.
import { Info } from 'lucide-react';
import { RISK_WEIGHTS } from '../../lib/schoolRiskRanking';

interface RankingMethodologyPanelProps {
  totalEscolas: number;
  anoLetivo: number;
  bimestre: number;
}

export default function RankingMethodologyPanel({ totalEscolas, anoLetivo, bimestre }: RankingMethodologyPanelProps) {
  return (
    <details className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-600">
      <summary className="cursor-pointer font-bold text-slate-700 flex items-center gap-1.5">
        <Info size={13} /> Como o ranking de urgência/risco é calculado
      </summary>
      <div className="mt-3 space-y-2">
        <p className="font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          Critério técnico provisório de apoio ao acompanhamento — nunca uma metodologia oficial validada pela SEFOR 3.
          A equipe pedagógica deve revisar os pesos abaixo antes de tratar este ranking como definitivo.
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>Inconsistência de dados: {RISK_WEIGHTS.pontosPorInconsistencia} pontos cada.</li>
          <li>Pendência em aberto: {RISK_WEIGHTS.pontosPorPendencia} pontos cada.</li>
          <li>Fluxo (só quando o dado é confiável): abandono × {RISK_WEIGHTS.multiplicadorAbandono}, reprovação × {RISK_WEIGHTS.multiplicadorReprovacao}.</li>
          <li>Notas: fonte indisponível = {RISK_WEIGHTS.pontosNotasIndisponiveis} pts; sem percentual calculável = {RISK_WEIGHTS.pontosNotasSemPercentualCalculavel} pts; percentual real = (100 − percentual) × {RISK_WEIGHTS.multiplicadorPercentualNotasFaltante}.</li>
          <li>Sem nenhuma visita no ano: {RISK_WEIGHTS.pontosSemVisitaNoAno} pontos.</li>
          <li>Qualidade geral dos dados: até {RISK_WEIGHTS.qualidadeDadosPenalidade.indisponivel} pontos adicionais.</li>
        </ul>
        <p>
          <strong>Dados ausentes ou indisponíveis nunca viram zero</strong> — pesam no escore como risco (nunca como
          "sem problema"). Uma escola com 3 ou mais fontes indisponíveis, ou qualidade geral "Indisponível", sai do
          ranking numerado e aparece como <strong>"Dados insuficientes"</strong>.
        </p>
        <p><strong>Desempate:</strong> ordem alfabética do nome da escola. <strong>Período considerado:</strong> {bimestre}º bimestre de {anoLetivo}. <strong>Escolas avaliadas:</strong> {totalEscolas}.</p>
      </div>
    </details>
  );
}
