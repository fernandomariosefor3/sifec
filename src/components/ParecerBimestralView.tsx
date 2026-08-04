// Reestruturação SIFEC — Parecer Bimestral: funcionalidade transversal nova,
// 9 cards navegáveis que reúnem, só para LEITURA, o que já existe nos
// demais módulos (Gestão de Escolas, Fluxo, Notas, Farol do Estudante, Sala
// de Situação, Ciclo de Gestão, Recomposição) por escola+ano+bimestre. O
// único dado que este módulo GRAVA é o campo de Conclusão/Encaminhamentos
// (ver parecerBimestralService.ts) — todo o resto é derivado das coleções
// já existentes, nunca duplicado.
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Award, BarChart3, CheckCircle2, ClipboardList,
  FileText, GraduationCap, Printer, Radar, ShieldAlert, Users,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import {
  getSuperintendents,
  getActiveSuperintendentId,
  getAdminSchoolScope,
  getSchoolsForCurrentScope,
} from '../lib/superintendentService';
import { getClassroomsForSchoolYear, listClassroomsForSchool } from '../lib/classService';
import { buildAnoLetivoOptions } from '../lib/anoLetivoOptions';
import { listBimonthlyEnrollmentsForSchool } from '../lib/bimonthlyEnrollmentService';
import { getSchoolFlowResult } from '../lib/schoolFlowService';
import { calculateSchoolFlowPercentuais } from '../lib/schoolFlowCalculations';
import { listGradeEntryMonitoringForSchool } from '../lib/gradeEntryMonitoringService';
import {
  consolidateGradeEntryMonitoring,
  classifyCompletionColorBand,
  COMPLETION_COLOR_BAND_INFO,
} from '../lib/gradeEntryMonitoringCalculations';
import { listFarolEstudanteForSchool } from '../lib/farolEstudanteService';
import { FAROL_ACERTO_LIMITE } from '../types/farolEstudante';
import { useSchoolSituation } from '../hooks/useSchoolSituation';
import { rankSchoolsByRisk } from '../lib/schoolRiskRanking';
import { getCdgPlan, isCdgTaskOverdue, listCdgTasksForSchool } from '../lib/cdgService';
import { listRecomposicaoPlansForSchool } from '../lib/recomposicaoPlanService';
import {
  ParecerBimestralValidationError,
  getParecerBimestralNote,
  saveParecerBimestralNote,
} from '../lib/parecerBimestralService';
import type { Bimestre } from '../types/gradeEntryMonitoring';
import type { Turma } from '../types/classroom';
import type { BimonthlyEnrollment } from '../types/bimonthlyEnrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import type { FarolEstudanteItem } from '../types/farolEstudante';
import type { CdgPlan, CdgTask } from '../types/cdgPlan';
import type { RecomposicaoPlan } from '../types/recomposicaoPlan';

interface SchoolLike { id: string; nome: string; codInep: string; regiao?: '4ª' | '5ª' }

const CARD_TITLES = [
  'Capa', 'Matrícula', 'Fluxo Escolar', 'Notas Informadas', 'Farol do Estudante',
  'Sala de Situação', 'Ciclo de Gestão', 'Recomposição', 'Conclusão / Encaminhamentos',
] as const;

interface ParecerData {
  turmas: Turma[];
  bimonthly: BimonthlyEnrollment[];
  flow: SchoolFlowResult | null;
  monitoring: GradeEntryMonitoring[];
  farol: FarolEstudanteItem[];
  cdgPlan: CdgPlan | null;
  cdgTasks: CdgTask[];
  recomposicao: RecomposicaoPlan[];
}

export default function ParecerBimestralView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  const [anoLetivo, setAnoLetivo] = useState(() => new Date().getFullYear());
  const anoLetivoOptions = buildAnoLetivoOptions();
  const [bimestre, setBimestre] = useState<Bimestre>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [cardIndex, setCardIndex] = useState(0);

  const [data, setData] = useState<ParecerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const [encaminhamentos, setEncaminhamentos] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => setIsFirebaseMode(!!user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setActiveSuperId(getActiveSuperintendentId());
      setAdminScope(getAdminSchoolScope());
    };
    window.addEventListener('sefor3_active_superintendent_change', handleChange);
    window.addEventListener('sefor3_admin_scope_change', handleChange);
    handleChange();
    return () => {
      window.removeEventListener('sefor3_active_superintendent_change', handleChange);
      window.removeEventListener('sefor3_admin_scope_change', handleChange);
    };
  }, []);

  const superintendents = getSuperintendents();
  const activeSuper = superintendents.find(s => s.id === activeSuperId) || (superintendents.length > 0 ? superintendents[0] : null);
  const visibleSchools: SchoolLike[] = useMemo(
    () => getSchoolsForCurrentScope({ superintendent: activeSuper, allSchools: SEED_SCHOOLS, isAuthenticated: isFirebaseMode, adminScope }),
    [activeSuper, isFirebaseMode, adminScope]
  );

  useEffect(() => {
    if (selectedSchoolId && !visibleSchools.some(s => s.id === selectedSchoolId)) {
      setSelectedSchoolId('');
    }
  }, [visibleSchools, selectedSchoolId]);

  const selectedSchool = visibleSchools.find(s => s.id === selectedSchoolId) ?? null;

  useEffect(() => { setCardIndex(0); }, [selectedSchoolId, anoLetivo, bimestre]);

  // Card 6 (Sala de Situação) precisa da posição no RANKING regional — só
  // dá para calcular olhando todas as escolas visíveis, mesmo princípio de
  // SalaDeSituacaoView.tsx.
  const { situations: allSituations, loading: situationsLoading } = useSchoolSituation({
    schools: visibleSchools,
    anoLetivo,
    bimestre,
    isFirebaseMode,
  });
  const ranking = useMemo(
    () => rankSchoolsByRisk(Object.values(allSituations)),
    [allSituations]
  );
  const rankingPosition = selectedSchool ? (ranking.findIndex(r => r.schoolId === selectedSchool.id) + 1 || null) : null;
  const selectedSituation = selectedSchool ? allSituations[selectedSchool.id] ?? null : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedSchool || !isFirebaseMode) {
        setData(null);
        return;
      }
      setLoading(true);
      setLoadError('');
      try {
        const [turmasRaw, bimonthly, flow, monitoring, farol, cdgPlan, cdgTasks, recomposicao, note] = await Promise.all([
          listClassroomsForSchool(selectedSchool.id),
          listBimonthlyEnrollmentsForSchool(selectedSchool.id, anoLetivo),
          getSchoolFlowResult(selectedSchool.id, anoLetivo),
          listGradeEntryMonitoringForSchool(selectedSchool.id, anoLetivo, bimestre),
          listFarolEstudanteForSchool(selectedSchool.id, anoLetivo),
          getCdgPlan(selectedSchool.id, anoLetivo),
          listCdgTasksForSchool(selectedSchool.id, anoLetivo),
          listRecomposicaoPlansForSchool(selectedSchool.id, anoLetivo),
          getParecerBimestralNote(selectedSchool.id, anoLetivo, bimestre),
        ]);
        if (cancelled) return;
        const turmas = getClassroomsForSchoolYear(turmasRaw, selectedSchool, anoLetivo);
        setData({ turmas, bimonthly, flow, monitoring, farol, cdgPlan, cdgTasks, recomposicao: recomposicao.filter(p => p.bimestre === bimestre) });
        setEncaminhamentos(note?.encaminhamentos ?? '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o parecer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedSchool, anoLetivo, bimestre, isFirebaseMode, reloadTick]);

  async function handleSaveNote() {
    setNoteError('');
    setNoteSuccess('');
    if (!selectedSchool) return;
    const email = auth.currentUser?.email;
    if (!email) {
      setNoteError('É preciso estar autenticado para salvar os encaminhamentos.');
      return;
    }
    setSavingNote(true);
    try {
      await saveParecerBimestralNote({
        schoolId: selectedSchool.id,
        codInep: selectedSchool.codInep,
        escolaNome: selectedSchool.nome,
        anoLetivo,
        bimestre,
        encaminhamentos,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      setNoteSuccess('Encaminhamentos salvos com sucesso.');
    } catch (err) {
      setNoteError(err instanceof ParecerBimestralValidationError ? err.message : 'Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingNote(false);
    }
  }

  const consolidatedNotas = data
    ? consolidateGradeEntryMonitoring(data.turmas.map(t => ({
        turmaId: t.id,
        turmaNome: t.nome,
        monitoring: data.monitoring.find(m => m.turmaId === t.id) ?? null,
      })))
    : null;

  const flowPercentuais = data?.flow ? calculateSchoolFlowPercentuais(data.flow) : null;
  const overdueTasks = data ? data.cdgTasks.filter(t => isCdgTaskOverdue(t, new Date().toISOString().slice(0, 10))) : [];

  function handlePrint() {
    window.print();
  }

  const canGoPrev = cardIndex > 0;
  const canGoNext = cardIndex < CARD_TITLES.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 print:hidden">
        <div>
          <span className="text-[10px] text-brand-green tracking-wider uppercase font-black font-mono">SEFOR 3 — RELATÓRIO FINAL</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Parecer Bimestral</h2>
          <p className="text-xs text-slate-500 font-normal max-w-2xl">
            Visão consolidada, por escola e bimestre, de matrícula, fluxo, notas, Farol do Estudante, Sala de Situação, Ciclo de Gestão e Recomposição.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} aria-label="Escola"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs font-bold rounded-xl max-w-[220px]">
            <option value="">Selecione a escola</option>
            {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={anoLetivo} onChange={e => setAnoLetivo(Number(e.target.value))} aria-label="Ano letivo"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs font-bold rounded-xl">
            {anoLetivoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          <select value={bimestre} onChange={e => setBimestre(Number(e.target.value) as Bimestre)} aria-label="Bimestre"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs font-bold rounded-xl">
            <option value={1}>1º Bimestre</option>
            <option value={2}>2º Bimestre</option>
            <option value={3}>3º Bimestre</option>
            <option value={4}>4º Bimestre</option>
          </select>
          {selectedSchool && (
            <button type="button" onClick={handlePrint}
              className="py-1.5 px-3 bg-brand-green hover:bg-brand-green/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm">
              <Printer size={14} /> Imprimir / Exportar PDF
            </button>
          )}
        </div>
      </div>

      {!selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs print:hidden">
          Selecione uma escola para montar o parecer bimestral.
        </div>
      ) : !isFirebaseMode ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs print:hidden">
          O Parecer Bimestral fica disponível após o login (reúne dados reais de várias fontes).
        </div>
      ) : loading || situationsLoading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs print:hidden">Carregando parecer...</div>
      ) : loadError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold flex items-center justify-between gap-3 print:hidden">
          <span>{loadError}</span>
          <button type="button" onClick={() => setReloadTick(t => t + 1)} className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition shrink-0">
            Tentar novamente
          </button>
        </div>
      ) : data ? (
        <>
          {/* Navegação entre cards — nunca aparece na impressão. */}
          <div className="flex items-center justify-between print:hidden">
            <button type="button" disabled={!canGoPrev} onClick={() => setCardIndex(i => i - 1)}
              className="px-3 py-1.5 bg-white border border-slate-250 hover:border-brand-green rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-30">
              <ArrowLeft size={14} /> Anterior
            </button>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {CARD_TITLES.map((title, idx) => (
                <button key={title} type="button" onClick={() => setCardIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${idx === cardIndex ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {idx + 1}. {title}
                </button>
              ))}
            </div>
            <button type="button" disabled={!canGoNext} onClick={() => setCardIndex(i => i + 1)}
              className="px-3 py-1.5 bg-white border border-slate-250 hover:border-brand-green rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-30">
              Próximo <ArrowRight size={14} />
            </button>
          </div>

          {/* Na tela: só o card ativo. Na impressão (print:block/print:hidden
              controlam cada bloco individualmente abaixo): todos os 9 cards
              empilhados, um por página. */}
          <div className="space-y-6">
            <div className={cardIndex === 0 ? 'block' : 'hidden print:block print:break-before-page'}>
              <CapaCard school={selectedSchool} anoLetivo={anoLetivo} bimestre={bimestre} superintendente={activeSuper?.nome ?? null} />
            </div>
            <div className={cardIndex === 1 ? 'block' : 'hidden print:block print:break-before-page'}>
              <MatriculaCard school={selectedSchool} turmas={data.turmas} bimonthly={data.bimonthly} />
            </div>
            <div className={cardIndex === 2 ? 'block' : 'hidden print:block print:break-before-page'}>
              <FluxoCard flow={data.flow} percentuais={flowPercentuais} />
            </div>
            <div className={cardIndex === 3 ? 'block' : 'hidden print:block print:break-before-page'}>
              <NotasCard consolidated={consolidatedNotas} />
            </div>
            <div className={cardIndex === 4 ? 'block' : 'hidden print:block print:break-before-page'}>
              <FarolCard items={data.farol} />
            </div>
            <div className={cardIndex === 5 ? 'block' : 'hidden print:block print:break-before-page'}>
              <SituacaoCard situation={selectedSituation} position={rankingPosition} total={ranking.length} />
            </div>
            <div className={cardIndex === 6 ? 'block' : 'hidden print:block print:break-before-page'}>
              <CdgCard plan={data.cdgPlan} overdueTasks={overdueTasks} totalTasks={data.cdgTasks.length} />
            </div>
            <div className={cardIndex === 7 ? 'block' : 'hidden print:block print:break-before-page'}>
              <RecomposicaoCard planos={data.recomposicao} />
            </div>
            <div className={cardIndex === 8 ? 'block' : 'hidden print:block print:break-before-page'}>
              <ConclusaoCard
                encaminhamentos={encaminhamentos}
                onChange={setEncaminhamentos}
                onSave={handleSaveNote}
                saving={savingNote}
                error={noteError}
                success={noteSuccess}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function CardShell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 print:border-0 print:shadow-none">
      <h3 className="text-sm font-black uppercase text-slate-700 mb-4 flex items-center gap-2">{icon} {title}</h3>
      {children}
    </div>
  );
}

function CapaCard({ school, anoLetivo, bimestre, superintendente }: { school: SchoolLike; anoLetivo: number; bimestre: Bimestre; superintendente: string | null }) {
  return (
    <CardShell icon={<FileText size={16} />} title="Capa">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div><span className="block text-slate-400 font-bold uppercase text-[9px]">Escola</span><span className="text-lg font-black text-slate-900">{school.nome}</span></div>
        <div><span className="block text-slate-400 font-bold uppercase text-[9px]">INEP / Região</span><span className="font-mono font-bold text-slate-700">{school.codInep} — {school.regiao ?? 'Não informado'}</span></div>
        <div><span className="block text-slate-400 font-bold uppercase text-[9px]">Bimestre</span><span className="font-bold text-slate-700">{bimestre}º Bimestre / {anoLetivo}</span></div>
        <div><span className="block text-slate-400 font-bold uppercase text-[9px]">Data de emissão</span><span className="font-mono font-bold text-slate-700">{new Date().toISOString().slice(0, 10)}</span></div>
        <div><span className="block text-slate-400 font-bold uppercase text-[9px]">Superintendente responsável</span><span className="font-bold text-slate-700">{superintendente ?? 'Não informado'}</span></div>
      </div>
    </CardShell>
  );
}

function MatriculaCard({ school, turmas, bimonthly }: { school: SchoolLike; turmas: Turma[]; bimonthly: BimonthlyEnrollment[] }) {
  const turmasAtivas = turmas.filter(t => t.ativa !== false).length;
  return (
    <CardShell icon={<GraduationCap size={16} />} title="Matrícula">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[1, 2, 3, 4].map(b => {
          const item = bimonthly.find(m => m.bimestre === b);
          return (
            <div key={b} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">{b}º Bimestre</div>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5">{item ? item.matricula : 'Não informado'}</div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-slate-600 mb-2"><strong>{turmasAtivas}</strong> turma(s) ativa(s) de <strong>{turmas.length}</strong> cadastrada(s).</div>
      <ul className="text-[11px] space-y-1">
        {turmas.map(t => <li key={t.id} className="flex justify-between border-b border-slate-100 py-1"><span>{t.nome}</span><span className="font-mono">{t.matriculaAtual ?? '—'} alunos</span></li>)}
      </ul>
    </CardShell>
  );
}

function FluxoCard({ flow, percentuais }: { flow: SchoolFlowResult | null; percentuais: ReturnType<typeof calculateSchoolFlowPercentuais> | null }) {
  return (
    <CardShell icon={<BarChart3 size={16} />} title="Fluxo Escolar">
      {!flow || !percentuais ? (
        <p className="text-xs text-slate-400">Fluxo escolar ainda não informado para este ano letivo.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <div className="text-[9px] uppercase text-slate-500 font-bold">Aprovação</div>
            <div className="text-lg font-black text-emerald-700">{percentuais.percentualAprovacao.toFixed(0)}%</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <div className="text-[9px] uppercase text-slate-500 font-bold">Reprovação</div>
            <div className="text-lg font-black text-amber-700">{percentuais.percentualReprovacao.toFixed(0)}%</div>
          </div>
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
            <div className="text-[9px] uppercase text-slate-500 font-bold">Abandono</div>
            <div className="text-lg font-black text-rose-700">{percentuais.percentualAbandono.toFixed(0)}%</div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function NotasCard({ consolidated }: { consolidated: ReturnType<typeof consolidateGradeEntryMonitoring> | null }) {
  const band = COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(consolidated?.percentualPreenchimentoGeral ?? null)];
  return (
    <CardShell icon={<ClipboardList size={16} />} title="Notas Informadas">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-lg mb-3 ${band.badgeClassName}`}>
        {consolidated?.percentualPreenchimentoGeral == null ? 'Não informado' : `${consolidated.percentualPreenchimentoGeral.toFixed(0)}%`}
      </div>
      <p className="text-xs text-slate-600">
        {consolidated?.turmasComRelatorio ?? 0} de {consolidated?.turmasCadastradas ?? 0} turma(s) com relatório informado neste bimestre.
      </p>
    </CardShell>
  );
}

function FarolCard({ items }: { items: FarolEstudanteItem[] }) {
  return (
    <CardShell icon={<ShieldAlert size={16} />} title="Farol do Estudante">
      <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-[10px] text-rose-700 font-bold mb-3">
        Informação administrativa sensível — uso interno.
      </div>
      <p className="text-xs text-slate-600 mb-2"><strong>{items.length}</strong> estudante(s) com acerto abaixo de {FAROL_ACERTO_LIMITE}% neste bimestre.</p>
      <ul className="text-[11px] space-y-1">
        {items.map(item => (
          <li key={item.id} className="flex justify-between border-b border-slate-100 py-1">
            <span>{item.estudanteNome} — {item.turmaNome} ({item.disciplina})</span>
            <span className="font-mono font-bold text-rose-600">{item.percentualAcerto}%</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function SituacaoCard({ situation, position, total }: { situation: import('../types/schoolSituation').SchoolSituation | null; position: number | null; total: number }) {
  return (
    <CardShell icon={<Radar size={16} />} title="Sala de Situação">
      {situation ? (
        <>
          <p className="text-xs text-slate-600 mb-3">
            Posição no ranking regional de urgência: <strong>#{position ?? '—'}</strong> de {total} escola(s).
          </p>
          <p className="text-xs text-slate-600"><strong>{situation.pendencias.length}</strong> pendência(s) em aberto.</p>
        </>
      ) : (
        <p className="text-xs text-slate-400">Situação ainda não disponível para esta escola.</p>
      )}
    </CardShell>
  );
}

function CdgCard({ plan, overdueTasks, totalTasks }: { plan: CdgPlan | null; overdueTasks: CdgTask[]; totalTasks: number }) {
  return (
    <CardShell icon={<CheckCircle2 size={16} />} title="Ciclo de Gestão">
      <p className="text-xs text-slate-600 mb-2">
        Situação do plano: <strong>{plan?.situacao ?? 'Não informado'}</strong> — Status de execução: <strong>{plan?.statusExecucao ?? 'Não informado'}</strong>
      </p>
      <p className="text-xs text-slate-600">
        <strong>{overdueTasks.length}</strong> de {totalTasks} tarefa(s) atrasada(s).
      </p>
    </CardShell>
  );
}

function RecomposicaoCard({ planos }: { planos: RecomposicaoPlan[] }) {
  return (
    <CardShell icon={<Award size={16} />} title="Recomposição">
      {planos.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum plano de recomposição registrado para este bimestre.</p>
      ) : (
        <ul className="space-y-2 text-xs">
          {planos.map(p => (
            <li key={p.id} className="border border-slate-200 rounded-lg p-2">
              <div className="font-bold text-slate-800">{p.areaDisciplina} — {p.turno}</div>
              <div className="text-slate-500">Prazo: {p.prazo}</div>
              <p className="text-slate-600 mt-1">{p.descricao}</p>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function ConclusaoCard({ encaminhamentos, onChange, onSave, saving, error, success }: {
  encaminhamentos: string; onChange: (v: string) => void; onSave: () => void; saving: boolean; error: string; success: string;
}) {
  return (
    <CardShell icon={<Users size={16} />} title="Conclusão / Encaminhamentos">
      {error && <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{error}</div>}
      {success && <div className="mb-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg font-bold">{success}</div>}
      <textarea
        value={encaminhamentos}
        onChange={e => onChange(e.target.value)}
        rows={8}
        maxLength={4000}
        placeholder="Encaminhamentos da superintendência para a escola neste bimestre..."
        className="w-full p-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs rounded-lg print:border-slate-300"
      />
      <button type="button" onClick={onSave} disabled={saving}
        className="mt-3 py-2 px-4 bg-brand-green hover:bg-brand-green/90 text-white font-extrabold text-xs uppercase rounded-xl shadow-sm transition disabled:opacity-50 print:hidden">
        {saving ? 'Salvando...' : 'Salvar encaminhamentos'}
      </button>
    </CardShell>
  );
}
