// Fase 2D — Sala de Situação: detalhe de uma escola (seção 14 do plano) —
// estrutura, matrícula, fluxo, notas agregadas, visitas, pendências,
// inconsistências e origem dos indicadores. Nunca nome de estudante, nota
// individual ou observação nominal.
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { SchoolSituation } from '../../types/schoolSituation';
import { DataQualityBadge } from './SituationDataQualityPanel';
import SituationPendingItems from './SituationPendingItems';

interface SituationSchoolDetailProps {
  situation: SchoolSituation;
  onClose: () => void;
}

// Rótulo amigável para a fonte técnica de uma falha (revisão do code
// review do PR #16, seção 9) — o nome da coleção continua visível (em
// font-mono, menor) só como diagnóstico secundário, nunca como a
// informação principal exibida ao usuário.
const SOURCE_FRIENDLY_LABELS: Record<string, string> = {
  school_years: 'Estrutura escolar (ano letivo)',
  turmas: 'Turmas',
  enrollment_snapshots: 'Matrícula mensal',
  school_flow_results: 'Fluxo escolar',
  grade_entry_monitoring: 'Notas bimestrais agregadas',
  visitas: 'Visitas técnicas',
  schoolSituation: 'Sala de Situação desta escola',
};

function friendlySourceLabel(source: string): string {
  return SOURCE_FRIENDLY_LABELS[source] ?? source;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-800 font-mono">{value}</span>
    </div>
  );
}

function Section({ title, quality, children }: { title: string; quality: SchoolSituation['qualidadeGeral']; children: ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-slate-800">{title}</h4>
        <DataQualityBadge state={quality} />
      </div>
      {children}
    </div>
  );
}

export default function SituationSchoolDetail({ situation, onClose }: SituationSchoolDetailProps) {
  const { estrutura, matricula, fluxo, notas, visitas, pendencias, inconsistencias, sourceFailures } = situation;
  // Distingue "notas nunca solicitadas" (visão global sem escola
  // selecionada) de "notas indisponíveis por falha de leitura" — as duas
  // deixam `notas` null, mas só a segunda tem uma entrada correspondente em
  // sourceFailures (seção 9 do code review do PR #16).
  const notasIndisponiveis = sourceFailures.some(f => f.source === 'grade_entry_monitoring');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">
            Detalhe da escola — {situation.anoLetivo}
          </span>
          <h3 className="text-lg font-bold text-slate-900">{situation.escolaNome}</h3>
          <p className="text-[11px] text-slate-400 font-mono">INEP {situation.codInep}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhe"
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
        >
          <X size={14} />
        </button>
      </div>

      {sourceFailures.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700">
          <p className="font-bold mb-1">Algumas fontes de dados não puderam ser carregadas:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {sourceFailures.map(f => (
              <li key={f.source}>
                <span className="font-bold">{friendlySourceLabel(f.source)}</span>: {f.message}{' '}
                <span className="font-mono text-rose-400 text-[10px]">({f.source})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Estrutura escolar" quality={estrutura.dataQuality}>
          <StatRow label="Turmas cadastradas" value={estrutura.turmasCadastradas} />
          <StatRow label="Turmas ativas" value={estrutura.turmasAtivas} />
          <StatRow label="Matrícula inicial" value={estrutura.matriculaInicial ?? 'Não informado'} />
          <StatRow label="Matrícula atual" value={estrutura.matriculaAtual ?? 'Não informado'} />
          <StatRow label="Média por turma" value={estrutura.mediaAlunosPorTurma?.toFixed(1) ?? 'Não informado'} />
        </Section>

        <Section title="Matrícula e movimentos" quality={matricula.dataQuality}>
          <StatRow label="Novas matrículas" value={matricula.novasMatriculas} />
          <StatRow label="Transferências (entrada)" value={matricula.transferenciasEntrada} />
          <StatRow label="Transferências (saída)" value={matricula.transferenciasSaida} />
          <StatRow label="Abandono registrado" value={matricula.abandono} />
          <StatRow label="Matrícula final calculada" value={matricula.matriculaFinalCalculada ?? 'Incompleta'} />
          <StatRow label="Último mês preenchido" value={matricula.ultimoMesPreenchido ?? 'Não informado'} />
          <StatRow label="Meses pendentes" value={matricula.quantidadeMesesPendentes} />
        </Section>

        <Section title="Fluxo escolar" quality={fluxo.dataQuality}>
          <StatRow label="Situação" value={fluxo.status === 'nao_informado' ? 'Fluxo não informado' : fluxo.status} />
          <StatRow label="Aprovados" value={`${fluxo.aprovados} (${fluxo.percentualAprovacao.toFixed(1)}%)`} />
          <StatRow label="Reprovados" value={`${fluxo.reprovados} (${fluxo.percentualReprovacao.toFixed(1)}%)`} />
          <StatRow label="Abandono" value={`${fluxo.abandono} (${fluxo.percentualAbandono.toFixed(1)}%)`} />
        </Section>

        <Section title="Notas bimestrais agregadas" quality={notas ? notas.dataQuality : (notasIndisponiveis ? 'indisponivel' : 'sem_dados')}>
          {notas ? (
            <>
              <StatRow label="Turmas cadastradas" value={notas.turmasCadastradas} />
              <StatRow label="Turmas com relatório" value={notas.turmasComRelatorio} />
              <StatRow label="Turmas sem relatório" value={notas.turmasSemRelatorio} />
              <StatRow label="Turmas com preenchimento completo" value={notas.turmasCompletas} />
              <StatRow label="Turmas com preenchimento parcial" value={notas.turmasParciais} />
              <StatRow label="Turmas sem preenchimento" value={notas.turmasSemPreenchimento} />
              <StatRow
                label="% de preenchimento geral"
                value={notas.percentualPreenchimentoGeral == null ? 'Não informado' : `${notas.percentualPreenchimentoGeral.toFixed(1)}%`}
              />
            </>
          ) : notasIndisponiveis ? (
            <p className="text-[11px] text-slate-400">Notas indisponíveis — falha ao carregar o acompanhamento de notas (ver aviso acima).</p>
          ) : (
            <p className="text-[11px] text-slate-400">Notas ainda não carregadas para esta escola.</p>
          )}
        </Section>

        <Section title="Visitas" quality={visitas.dataQuality}>
          <StatRow label="Visitas no ano" value={visitas.quantidadeVisitasNoAno} />
          <StatRow label="Última visita" value={visitas.dataUltimaVisita ?? 'Sem visita registrada'} />
        </Section>
      </div>

      {inconsistencias.length > 0 && (
        <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-sm">
          <h4 className="text-xs font-bold text-rose-700 mb-2">Inconsistências detectadas</h4>
          <ul className="space-y-1.5">
            {inconsistencias.map((inc, idx) => (
              <li key={`${inc.type}-${idx}`} className="text-[11px] text-slate-600">
                <span className="font-bold text-rose-600">{inc.type}</span> — {inc.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-xs font-bold text-slate-800 mb-2">Pendências desta escola</h4>
        <SituationPendingItems items={pendencias.map(p => ({ ...p, escolaNome: situation.escolaNome }))} />
      </div>
    </div>
  );
}
