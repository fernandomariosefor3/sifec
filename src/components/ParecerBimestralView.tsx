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
  Eye, FileText, GraduationCap, Printer, Radar, ShieldAlert, Users,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import PageHeader from './ui/PageHeader';
import ContextBar from './ui/ContextBar';
import Badge from './ui/Badge';
import StateMessage from './ui/StateMessage';
import SurfaceCard from './ui/SurfaceCard';
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
import { listGradeEntryMonitoringByDisciplineForSchool } from '../lib/gradeEntryMonitoringDisciplineService';
import {
  consolidateGradeEntryMonitoring,
  consolidateGradeEntryMonitoringDisciplineByArea,
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
import type { Bimestre, GradeEntryMonitoring } from '../types/gradeEntryMonitoring';
import type { Turma } from '../types/classroom';
import type { BimonthlyEnrollment } from '../types/bimonthlyEnrollment';
import type { SchoolFlowResult } from '../types/schoolFlow';
import type { FarolEstudanteItem } from '../types/farolEstudante';
import type { CdgPlan, CdgTask } from '../types/cdgPlan';
import type { RecomposicaoPlan } from '../types/recomposicaoPlan';
import type { GradeEntryMonitoringByDiscipline } from '../types/gradeEntryMonitoringDiscipline';
// Correção final da auditoria da reestruturação, seção 5: SourceResult e
// ParecerBimestralData movidos para uma fonte canônica única em
// src/types/parecerBimestral.ts (não podem ficar definidos só dentro do
// componente) — reexportados aqui para não quebrar nenhum import existente
// que ainda aponte para este arquivo.
import type { ParecerBimestralData, SourceResult } from '../types/parecerBimestral';

export type { ParecerBimestralData, SourceResult };

interface SchoolLike { id: string; nome: string; codInep: string; regiao?: '4ª' | '5ª' }

const CARD_TITLES = [
  'Capa', 'Matrícula', 'Fluxo Escolar', 'Notas Informadas', 'Farol do Estudante',
  'Sala de Situação', 'Ciclo de Gestão', 'Recomposição', 'Conclusão / Encaminhamentos',
] as const;

function sourceOk<T>(value: T): SourceResult<T> {
  return { value, failed: false, errorMessage: null };
}

async function loadSource<T>(promise: Promise<T>, fallback: T): Promise<SourceResult<T>> {
  try {
    const value = await promise;
    return sourceOk(value);
  } catch (err) {
    return { value: fallback, failed: true, errorMessage: err instanceof Error ? err.message : String(err) };
  }
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
  const [previewMode, setPreviewMode] = useState(false);

  const [data, setData] = useState<ParecerBimestralData | null>(null);
  const [loading, setLoading] = useState(false);
  // Cada fonte já trata sua própria falha via loadSource/SourceResult (nunca
  // apaga as demais) — loadError só existe para um erro verdadeiramente
  // inesperado fora desse envelope (ex.: exceção síncrona antes do
  // Promise.all), caso em que não há nada de útil para mostrar por card.
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

  useEffect(() => { setCardIndex(0); setPreviewMode(false); }, [selectedSchoolId, anoLetivo, bimestre]);

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
        // Cada fonte é isolada via loadSource — a falha de UMA (ex.: Farol
        // sem permissão para essa escola) nunca apaga as demais 8 (auditoria
        // da reestruturação, seção 10, mesmo princípio de isolamento por
        // escola já aplicado ao agregado regional de Notas).
        const [turmasR, bimonthlyR, flowR, monitoringR, disciplinaR, farolR, cdgPlanR, cdgTasksR, recomposicaoR, noteR] = await Promise.all([
          loadSource(listClassroomsForSchool(selectedSchool.id), []),
          loadSource(listBimonthlyEnrollmentsForSchool(selectedSchool.id, anoLetivo), []),
          loadSource(getSchoolFlowResult(selectedSchool.id, anoLetivo), null),
          loadSource(listGradeEntryMonitoringForSchool(selectedSchool.id, anoLetivo, bimestre), []),
          loadSource(listGradeEntryMonitoringByDisciplineForSchool(selectedSchool.id, anoLetivo, bimestre), []),
          loadSource(listFarolEstudanteForSchool(selectedSchool.id, anoLetivo), []),
          loadSource(getCdgPlan(selectedSchool.id, anoLetivo), null),
          loadSource(listCdgTasksForSchool(selectedSchool.id, anoLetivo), []),
          loadSource(listRecomposicaoPlansForSchool(selectedSchool.id, anoLetivo), []),
          loadSource(getParecerBimestralNote(selectedSchool.id, anoLetivo, bimestre), null),
        ]);
        if (cancelled) return;
        const turmas: SourceResult<Turma[]> = {
          ...turmasR,
          value: getClassroomsForSchoolYear(turmasR.value, selectedSchool, anoLetivo),
        };
        setData({
          turmas,
          bimonthly: bimonthlyR,
          flow: flowR,
          monitoring: monitoringR,
          disciplina: disciplinaR,
          farol: farolR,
          cdgPlan: cdgPlanR,
          cdgTasks: cdgTasksR,
          recomposicao: { ...recomposicaoR, value: recomposicaoR.value.filter(p => p.bimestre === bimestre) },
        });
        setEncaminhamentos(noteR.value?.encaminhamentos ?? '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar o parecer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // selectedSchoolId (primitivo) substitui selectedSchool (objeto) de
    // propósito: getSuperintendents()/getSchoolsForCurrentScope() devolvem
    // um array NOVO a cada render (JSON.parse fresco do localStorage), então
    // `selectedSchool` nunca é referencialmente estável entre renders — usá-lo
    // direto aqui faria este efeito refazer a busca a cada re-render que ELE
    // MESMO provoca via setData (setData → re-render → novo selectedSchool →
    // efeito dispara de novo → nunca estabiliza). Mesmo padrão de
    // visibleSchoolIdsKey em NotasView.tsx / schoolIdsKey em useSchoolSituation.ts.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedSchoolId substitui selectedSchool de propósito (ver comentário acima)
  }, [selectedSchoolId, anoLetivo, bimestre, isFirebaseMode, reloadTick]);

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
    ? consolidateGradeEntryMonitoring(data.turmas.value.map(t => ({
        turmaId: t.id,
        turmaNome: t.nome,
        monitoring: data.monitoring.value.find(m => m.turmaId === t.id) ?? null,
      })))
    : null;

  const flowPercentuais = data?.flow.value ? calculateSchoolFlowPercentuais(data.flow.value) : null;
  const overdueTasks = data ? data.cdgTasks.value.filter(t => isCdgTaskOverdue(t, new Date().toISOString().slice(0, 10))) : [];

  function handlePrint() {
    window.print();
  }

  const canGoPrev = cardIndex > 0;
  const canGoNext = cardIndex < CARD_TITLES.length - 1;

  function cardWrapperClass(idx: number): string {
    if (previewMode) return 'block print:break-before-page';
    return idx === cardIndex ? 'block' : 'hidden print:block print:break-before-page';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="SEFOR 3 — Relatório final"
        title="Parecer Bimestral"
        description="Visão consolidada, por escola e bimestre, de matrícula, fluxo, notas, Farol do Estudante, Sala de Situação, Ciclo de Gestão e Recomposição."
        actions={
          selectedSchool && data && !loading ? (
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setPreviewMode(prev => !prev)}
                className={`py-2 px-3.5 rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition border ${previewMode ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-250 hover:border-brand-green'}`}>
                <Eye size={14} /> {previewMode ? 'Voltar à edição' : 'Visualizar parecer completo'}
              </button>
              <button type="button" onClick={handlePrint}
                className="py-2 px-3.5 bg-brand-green hover:bg-brand-green/90 text-white rounded-lg text-[13px] font-bold flex items-center gap-1.5 transition shadow-sm">
                <Printer size={14} /> Imprimir / Exportar PDF
              </button>
            </div>
          ) : undefined
        }
        context={
          <ContextBar className="print:hidden">
            <select value={selectedSchoolId} onChange={e => setSelectedSchoolId(e.target.value)} aria-label="Escola"
              className="py-1 px-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs font-bold rounded-lg max-w-[220px]">
              <option value="">Selecione a escola</option>
              {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
            <select value={anoLetivo} onChange={e => setAnoLetivo(Number(e.target.value))} aria-label="Ano letivo"
              className="py-1 px-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs font-bold rounded-lg">
              {anoLetivoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
            </select>
            <select value={bimestre} onChange={e => setBimestre(Number(e.target.value) as Bimestre)} aria-label="Bimestre"
              className="py-1 px-2 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs font-bold rounded-lg">
              <option value={1}>1º Bimestre</option>
              <option value={2}>2º Bimestre</option>
              <option value={3}>3º Bimestre</option>
              <option value={4}>4º Bimestre</option>
            </select>
          </ContextBar>
        }
        className="print:hidden"
      />

      {!selectedSchool ? (
        <StateMessage kind="empty" title="Selecione uma escola para montar o parecer bimestral." className="print:hidden" />
      ) : !isFirebaseMode ? (
        <StateMessage kind="empty" title="O Parecer Bimestral fica disponível após o login (reúne dados reais de várias fontes)." className="print:hidden" />
      ) : loading || situationsLoading ? (
        <StateMessage kind="loading" title="Carregando parecer..." className="print:hidden" />
      ) : loadError ? (
        <StateMessage
          kind="error"
          title={loadError}
          compact
          className="print:hidden"
          action={
            <button type="button" onClick={() => setReloadTick(t => t + 1)}
              className="px-3 py-1.5 bg-white border border-status-critical-border hover:bg-status-critical-bg rounded-lg text-[11px] font-bold text-status-critical transition">
              Tentar novamente
            </button>
          }
        />
      ) : data ? (
        <>
          {/* Navegação entre cards — nunca aparece na impressão nem no modo de pré-visualização. */}
          {!previewMode && (
            <div className="flex items-center justify-between gap-2 print:hidden">
              <button type="button" disabled={!canGoPrev} onClick={() => setCardIndex(i => i - 1)}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-brand-green rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-30 shrink-0">
                <ArrowLeft size={14} /> Anterior
              </button>
              <div className="flex items-center gap-1 flex-wrap justify-center">
                {CARD_TITLES.map((title, idx) => (
                  <button key={title} type="button" onClick={() => setCardIndex(idx)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${idx === cardIndex ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {idx + 1}. {title}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!canGoNext} onClick={() => setCardIndex(i => i + 1)}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-brand-green rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-30 shrink-0">
                Próximo <ArrowRight size={14} />
              </button>
            </div>
          )}
          {previewMode && (
            <div className="print:hidden">
              <Badge tone="info">Pré-visualização do parecer completo — os 9 blocos abaixo refletem exatamente o que sai na impressão/PDF.</Badge>
            </div>
          )}

          {/* Na tela (fora do modo de pré-visualização): só o card ativo. Na
              impressão e na pré-visualização: todos os 9 cards empilhados,
              um por página na impressão. */}
          <div className="space-y-5">
            <div className={cardWrapperClass(0)}>
              <CapaCard school={selectedSchool} anoLetivo={anoLetivo} bimestre={bimestre} superintendente={activeSuper?.nome ?? null} />
            </div>
            <div className={cardWrapperClass(1)}>
              <MatriculaCard school={selectedSchool} turmas={data.turmas} bimonthly={data.bimonthly} />
            </div>
            <div className={cardWrapperClass(2)}>
              <FluxoCard flow={data.flow} percentuais={flowPercentuais} />
            </div>
            <div className={cardWrapperClass(3)}>
              <NotasCard consolidated={consolidatedNotas} monitoring={data.monitoring} disciplina={data.disciplina} />
            </div>
            <div className={cardWrapperClass(4)}>
              <FarolCard result={data.farol} />
            </div>
            <div className={cardWrapperClass(5)}>
              <SituacaoCard situation={selectedSituation} position={rankingPosition} total={ranking.length} />
            </div>
            <div className={cardWrapperClass(6)}>
              <CdgCard plan={data.cdgPlan} overdueTasks={overdueTasks} totalTasks={data.cdgTasks.value.length} />
            </div>
            <div className={cardWrapperClass(7)}>
              <RecomposicaoCard planos={data.recomposicao} />
            </div>
            <div className={cardWrapperClass(8)}>
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
    <SurfaceCard padding="lg" className="print:border-0 print:shadow-none print:p-0">
      <h3 className="text-section-title text-slate-700 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0 print:hidden">{icon}</span>
        {title}
      </h3>
      {children}
    </SurfaceCard>
  );
}

function CapaCard({ school, anoLetivo, bimestre, superintendente }: { school: SchoolLike; anoLetivo: number; bimestre: Bimestre; superintendente: string | null }) {
  return (
    <CardShell icon={<FileText size={16} />} title="Capa">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><span className="block text-label uppercase text-slate-400">Escola</span><span className="text-lg font-black text-slate-900">{school.nome}</span></div>
        <div><span className="block text-label uppercase text-slate-400">INEP / Região</span><span className="font-mono font-bold text-slate-700 text-sm">{school.codInep} — {school.regiao ?? 'Não informado'}</span></div>
        <div><span className="block text-label uppercase text-slate-400">Bimestre</span><span className="font-bold text-slate-700 text-sm">{bimestre}º Bimestre / {anoLetivo}</span></div>
        <div><span className="block text-label uppercase text-slate-400">Data de emissão</span><span className="font-mono font-bold text-slate-700 text-sm">{new Date().toISOString().slice(0, 10)}</span></div>
        <div><span className="block text-label uppercase text-slate-400">Superintendente responsável</span><span className="font-bold text-slate-700 text-sm">{superintendente ?? 'Não informado'}</span></div>
      </div>
    </CardShell>
  );
}

// Auditoria da reestruturação, seção 10: cada card informa a coleção de
// origem do dado exibido, e — quando a fonte falhou — um aviso explícito em
// vez de mostrar silenciosamente um estado vazio como se fosse "sem dado".
// Correção final da auditoria, seção 7: "data de atualização" precisa
// aparecer em cada card, além da fonte — o mais recente `updatedAt` entre
// os registros carregados (nunca a data de hoje, que não informaria nada
// sobre QUANDO o dado foi de fato gravado).
function mostRecentUpdatedAt(items: readonly { updatedAt: string }[]): string | null {
  if (items.length === 0) return null;
  return items.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), items[0].updatedAt);
}

function SourceMeta({ collection, failed, errorMessage, updatedAt }: { collection: string; failed: boolean; errorMessage?: string | null; updatedAt?: string | null }) {
  return (
    <div className="mb-3 print:mb-2">
      <div className="text-caption text-slate-400 font-mono">
        Fonte: {collection} — Atualizado em: {updatedAt ? new Date(updatedAt).toLocaleString('pt-BR') : 'Não informado'}
      </div>
      {failed && (
        <div className="mt-1.5 print:hidden">
          <Badge tone="attention">
            Não foi possível carregar esta fonte agora{errorMessage ? `: ${errorMessage}` : '.'} Os dados abaixo podem estar incompletos.
          </Badge>
        </div>
      )}
    </div>
  );
}

function MatriculaCard({ school, turmas, bimonthly }: { school: SchoolLike; turmas: SourceResult<Turma[]>; bimonthly: SourceResult<BimonthlyEnrollment[]> }) {
  const turmasAtivas = turmas.value.filter(t => t.ativa !== false).length;
  return (
    <CardShell icon={<GraduationCap size={16} />} title="Matrícula">
      <SourceMeta collection="classrooms / bimonthly_enrollments" failed={turmas.failed || bimonthly.failed} errorMessage={turmas.errorMessage ?? bimonthly.errorMessage} updatedAt={mostRecentUpdatedAt(bimonthly.value)} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[1, 2, 3, 4].map(b => {
          const item = bimonthly.value.find(m => m.bimestre === b);
          return (
            <div key={b} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-label uppercase text-slate-400">{b}º Bimestre</div>
              <div className="text-sm font-extrabold text-slate-900 mt-0.5">{item ? item.matricula : 'Não informado'}</div>
            </div>
          );
        })}
      </div>
      <div className="text-body text-slate-600 mb-2"><strong>{turmasAtivas}</strong> turma(s) ativa(s) de <strong>{turmas.value.length}</strong> cadastrada(s).</div>
      <ul className="text-caption space-y-1">
        {turmas.value.map(t => <li key={t.id} className="flex justify-between border-b border-slate-100 py-1"><span>{t.nome}</span><span className="font-mono">{t.matriculaAtual ?? '—'} alunos</span></li>)}
      </ul>
    </CardShell>
  );
}

function FluxoCard({ flow, percentuais }: { flow: SourceResult<SchoolFlowResult | null>; percentuais: ReturnType<typeof calculateSchoolFlowPercentuais> | null }) {
  return (
    <CardShell icon={<BarChart3 size={16} />} title="Fluxo Escolar">
      <SourceMeta collection="school_flow_results" failed={flow.failed} errorMessage={flow.errorMessage} updatedAt={flow.value?.updatedAt ?? null} />
      {!flow.value || !percentuais ? (
        <p className="text-body text-slate-400">Fluxo escolar ainda não informado para este ano letivo.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-status-ok-bg border border-status-ok-border rounded-lg p-3 text-center">
            <div className="text-label uppercase text-slate-500">Aprovação</div>
            <div className="text-lg font-black text-status-ok">{percentuais.percentualAprovacao.toFixed(0)}%</div>
          </div>
          <div className="bg-status-attention-bg border border-status-attention-border rounded-lg p-3 text-center">
            <div className="text-label uppercase text-slate-500">Reprovação</div>
            <div className="text-lg font-black text-status-attention">{percentuais.percentualReprovacao.toFixed(0)}%</div>
          </div>
          <div className="bg-status-critical-bg border border-status-critical-border rounded-lg p-3 text-center">
            <div className="text-label uppercase text-slate-500">Abandono</div>
            <div className="text-lg font-black text-status-critical">{percentuais.percentualAbandono.toFixed(0)}%</div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

// Correção final da auditoria, seção 7: o card de Notas precisa usar
// disciplina REAL (grade_entry_monitoring_disciplina), não só o total por
// turma — a consolidação por área é sempre recalculada em tempo real
// (consolidateGradeEntryMonitoringDisciplineByArea), nunca persistida.
function NotasCard({ consolidated, monitoring, disciplina }: {
  consolidated: ReturnType<typeof consolidateGradeEntryMonitoring> | null;
  monitoring: SourceResult<GradeEntryMonitoring[]>;
  disciplina: SourceResult<GradeEntryMonitoringByDiscipline[]>;
}) {
  const band = COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(consolidated?.percentualPreenchimentoGeral ?? null)];
  const areas = consolidateGradeEntryMonitoringDisciplineByArea(disciplina.value);
  return (
    <CardShell icon={<ClipboardList size={16} />} title="Notas Informadas">
      <SourceMeta collection="grade_entry_monitoring (consolidação por turma)" failed={monitoring.failed} errorMessage={monitoring.errorMessage} updatedAt={mostRecentUpdatedAt(monitoring.value)} />
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-black text-lg mb-3 ${band.badgeClassName}`}>
        {consolidated?.percentualPreenchimentoGeral == null ? 'Não informado' : `${consolidated.percentualPreenchimentoGeral.toFixed(0)}%`}
      </div>
      <p className="text-body text-slate-600 mb-3">
        {consolidated?.turmasComRelatorio ?? 0} de {consolidated?.turmasCadastradas ?? 0} turma(s) com relatório informado neste bimestre.
      </p>
      <div className="border-t border-slate-100 pt-3">
        <SourceMeta collection="grade_entry_monitoring_disciplina (consolidação por área)" failed={disciplina.failed} errorMessage={disciplina.errorMessage} updatedAt={mostRecentUpdatedAt(disciplina.value)} />
        {areas.length === 0 ? (
          <p className="text-body text-slate-400">Nenhuma disciplina registrada ainda para esta escola/ano/bimestre.</p>
        ) : (
          <ul className="text-caption space-y-1">
            {areas.map(area => {
              const areaBand = COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(area.percentualGeral)];
              return (
                <li key={area.areaConhecimento} className="flex justify-between border-b border-slate-100 py-1">
                  <span>{area.areaConhecimento} ({area.disciplinasNoEscopo} disciplina(s))</span>
                  <span className={`font-mono font-bold ${areaBand.textClassName}`}>
                    {area.percentualGeral == null ? 'Não informado' : `${area.percentualGeral.toFixed(0)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CardShell>
  );
}

// Auditoria da reestruturação, seção 10: nome de estudante NUNCA aparece no
// PDF/impressão — só o resumo agregado (contagem por turma+disciplina), sem
// nenhum nome. A listagem nominal fica em um bloco separado, marcado
// print:hidden, e só existe para a sessão autenticada em tela (nunca no
// HTML que efetivamente sai impresso/exportado). O bloco agregado leva
// data-testid para permitir um teste automatizado verificar, isoladamente,
// que nenhum nome de estudante está presente ali.
function FarolCard({ result }: { result: SourceResult<FarolEstudanteItem[]> }) {
  const items = result.value;
  const porTurmaDisciplina = new Map<string, { turmaNome: string; disciplina: string; quantidade: number }>();
  items.forEach(item => {
    const key = `${item.turmaId}__${item.disciplina}`;
    const existing = porTurmaDisciplina.get(key);
    if (existing) {
      existing.quantidade += 1;
    } else {
      porTurmaDisciplina.set(key, { turmaNome: item.turmaNome, disciplina: item.disciplina, quantidade: 1 });
    }
  });
  const resumo = Array.from(porTurmaDisciplina.values());

  return (
    <CardShell icon={<ShieldAlert size={16} />} title="Farol do Estudante">
      <SourceMeta collection="farol_estudante" failed={result.failed} errorMessage={result.errorMessage} updatedAt={mostRecentUpdatedAt(items)} />
      <div className="mb-3">
        <Badge tone="neutral">Dado nominal — acesso restrito. Nomes de estudantes nunca aparecem na versão impressa/PDF.</Badge>
      </div>
      <p className="text-body text-slate-600 mb-2"><strong>{items.length}</strong> estudante(s) com acerto abaixo de {FAROL_ACERTO_LIMITE}% neste bimestre.</p>

      {/* Resumo agregado — único conteúdo do card visível na impressão/PDF. */}
      <ul data-testid="farol-print-summary" className="text-caption space-y-1 hidden print:block">
        {resumo.length === 0 ? (
          <li className="text-slate-400">Nenhum estudante abaixo do critério neste bimestre.</li>
        ) : resumo.map(r => (
          <li key={`${r.turmaNome}__${r.disciplina}`} className="flex justify-between border-b border-slate-100 py-1">
            <span>{r.turmaNome} — {r.disciplina}</span>
            <span className="font-mono font-bold">{r.quantidade} estudante(s)</span>
          </li>
        ))}
      </ul>

      {/* Listagem nominal — só em tela, autenticado; nunca na impressão. */}
      <ul data-testid="farol-nominal-list" className="text-caption space-y-1 print:hidden">
        {items.map(item => (
          <li key={item.id} className="flex justify-between border-b border-slate-100 py-1">
            <span>{item.estudanteNome} — {item.turmaNome} ({item.disciplina})</span>
            <span className="font-mono font-bold text-status-critical">{item.percentualAcerto}%</span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function SituacaoCard({ situation, position, total }: { situation: import('../types/schoolSituation').SchoolSituation | null; position: number | null; total: number }) {
  return (
    <CardShell icon={<Radar size={16} />} title="Sala de Situação">
      {/* Situação é sempre recalculada em tempo real (schoolSituationService.ts),
          nunca um documento com updatedAt próprio — "Não informado" aqui é o
          estado correto, não uma falha de instrumentação. */}
      <SourceMeta collection="schoolSituationService (calculado em tempo real)" failed={false} updatedAt={null} />
      {situation ? (
        <>
          <p className="text-body text-slate-600 mb-3">
            Posição no ranking regional de urgência (critério técnico provisório): <strong>#{position ?? '—'}</strong> de {total} escola(s).
          </p>
          <p className="text-body text-slate-600"><strong>{situation.pendencias.length}</strong> pendência(s) em aberto.</p>
        </>
      ) : (
        <p className="text-body text-slate-400">Situação ainda não disponível para esta escola.</p>
      )}
    </CardShell>
  );
}

function CdgCard({ plan, overdueTasks, totalTasks }: { plan: SourceResult<CdgPlan | null>; overdueTasks: CdgTask[]; totalTasks: number }) {
  return (
    <CardShell icon={<CheckCircle2 size={16} />} title="Ciclo de Gestão">
      <SourceMeta collection="cdg_planos / cdg_tarefas" failed={plan.failed} errorMessage={plan.errorMessage} updatedAt={plan.value?.updatedAt ?? null} />
      <p className="text-body text-slate-600 mb-2">
        Situação do plano: <strong>{plan.value?.situacao ?? 'Não informado'}</strong> — Status de execução: <strong>{plan.value?.statusExecucao ?? 'Não informado'}</strong>
      </p>
      <p className="text-body text-slate-600">
        <strong>{overdueTasks.length}</strong> de {totalTasks} tarefa(s) atrasada(s).
      </p>
    </CardShell>
  );
}

function RecomposicaoCard({ planos }: { planos: SourceResult<RecomposicaoPlan[]> }) {
  return (
    <CardShell icon={<Award size={16} />} title="Recomposição">
      <SourceMeta collection="recomposicao_planos" failed={planos.failed} errorMessage={planos.errorMessage} updatedAt={mostRecentUpdatedAt(planos.value)} />
      {planos.value.length === 0 ? (
        <p className="text-body text-slate-400">Nenhum plano de recomposição registrado para este bimestre.</p>
      ) : (
        <ul className="space-y-2 text-body">
          {planos.value.map(p => (
            <li key={p.id} className="border border-slate-200 rounded-lg p-2">
              <div className="font-bold text-slate-800">{p.areaDisciplina} — {p.turno}</div>
              <div className="text-slate-500 text-caption">Prazo: {p.prazo}</div>
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
      {error && <div className="mb-2"><Badge tone="critical">{error}</Badge></div>}
      {success && <div className="mb-2"><Badge tone="ok">{success}</Badge></div>}
      <textarea
        value={encaminhamentos}
        onChange={e => onChange(e.target.value)}
        rows={8}
        maxLength={4000}
        placeholder="Encaminhamentos da superintendência para a escola neste bimestre..."
        className="w-full p-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-green text-xs rounded-lg print:border-slate-300"
      />
      <button type="button" onClick={onSave} disabled={saving}
        className="mt-3 py-2 px-4 bg-brand-green hover:bg-brand-green/90 text-white font-bold text-[13px] rounded-lg shadow-sm transition disabled:opacity-50 print:hidden">
        {saving ? 'Salvando...' : 'Salvar encaminhamentos'}
      </button>
    </CardShell>
  );
}
