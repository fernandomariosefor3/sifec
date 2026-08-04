// Fase 2C.1 — correção de escopo: Notas Bimestrais deixa de ser um cadastro
// nominal de estudantes (Fase 2C original) e passa a ser o acompanhamento
// AGREGADO do preenchimento de notas que cada escola já faz no SIGE Escola,
// por turma+ano letivo+bimestre — ver
// docs/descontinuacao-prototipo-notas-nominais.md para o inventário da
// correção. Este módulo NUNCA lê nem grava student_rosters/
// student_bimester_grades/grades — só grade_entry_monitoring, sempre
// filtrado por schoolId.
//
// Revisão do code review do PR #17: turmas passam a vir de
// useSchoolClassrooms (consulta escopada por escola — seção 2), nunca mais
// de subscribeToCollection('turmas') na coleção inteira. Falha de leitura
// de turmas OU de grade_entry_monitoring nunca é tratada como "nenhum
// relatório informado" (seção 1) — cada fonte expõe um status explícito, e
// uma falha real esconde a tabela por trás de um aviso com "Tentar
// novamente", em vez de renderizar zeros ou classificações inventadas.
import { useEffect, useMemo, useState } from 'react';
import { Globe2, Percent } from 'lucide-react';
import { auth } from '../lib/firebase';
import { SEED_SCHOOLS } from '../lib/firebaseService';
import {
  getSuperintendents,
  getActiveSuperintendentId,
  getAdminSchoolScope,
  getSchoolsForCurrentScope,
  getSchoolScopeLabel,
  hasSchoolWriteAccess,
} from '../lib/superintendentService';
import { getClassroomsForSchoolYear, listClassroomsForSchool } from '../lib/classService';
import { useSchoolClassrooms } from '../hooks/useSchoolClassrooms';
import { useGradeEntryMonitoring } from '../hooks/useGradeEntryMonitoring';
import { listGradeEntryMonitoringForSchool } from '../lib/gradeEntryMonitoringService';
import {
  consolidateGradeEntryMonitoring,
  aggregateGradeEntriesForPeriod,
  classifyCompletionColorBand,
  COMPLETION_COLOR_BAND_INFO,
  type GradeEntryCounts,
} from '../lib/gradeEntryMonitoringCalculations';
import { buildAnoLetivoOptions } from '../lib/anoLetivoOptions';
import NotasSummaryCards from './notas/NotasSummaryCards';
import GradeEntryMonitoringTable, {
  type GradeEntryMonitoringRow,
  type StatusFilter,
} from './notas/GradeEntryMonitoringTable';
import GradeEntryMonitoringFormModal from './notas/GradeEntryMonitoringFormModal';
import type { Bimestre } from '../types/gradeEntryMonitoring';

const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

// Reestruturação SIFEC — visões "1º Período" (1º+2º bimestre), "2º Período"
// (3º+4º) e "Consolidado" (ano inteiro), além do escopo "regional" (soma de
// todas as escolas visíveis, não só a selecionada). Ver
// aggregateGradeEntriesForPeriod em gradeEntryMonitoringCalculations.ts —
// deliberadamente separado do consolidado por-bimestre (NotasSummaryCards),
// que soma totalStudents e assumiria uma única fotografia por turma.
type Visao = 'bimestre' | 'periodo1' | 'periodo2' | 'consolidado';

const VISAO_BIMESTRES: Record<Exclude<Visao, 'bimestre'>, Bimestre[]> = {
  periodo1: [1, 2],
  periodo2: [3, 4],
  consolidado: [1, 2, 3, 4],
};

const VISAO_LABEL: Record<Visao, string> = {
  bimestre: 'Por bimestre',
  periodo1: '1º Período (1º e 2º bimestre)',
  periodo2: '2º Período (3º e 4º bimestre)',
  consolidado: 'Consolidado (ano letivo)',
};

export default function NotasView() {
  const [isFirebaseMode, setIsFirebaseMode] = useState(false);
  const [activeSuperId, setActiveSuperId] = useState('all');
  const [adminScope, setAdminScope] = useState(getAdminSchoolScope());
  const [anoLetivo, setAnoLetivo] = useState(() => new Date().getFullYear());
  // Âncora sempre no ano corrente REAL — o conjunto de opções não "desliza"
  // conforme o usuário navega entre anos, sempre os mesmos três.
  const anoLetivoOptions = buildAnoLetivoOptions();
  const [bimestre, setBimestre] = useState<Bimestre>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [modalRow, setModalRow] = useState<GradeEntryMonitoringRow | null>(null);
  const [visao, setVisao] = useState<Visao>('bimestre');
  const [regionalScope, setRegionalScope] = useState(false);
  const [aggregateGroups, setAggregateGroups] = useState<GradeEntryCounts[][] | null>(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState('');

  function handleAnoLetivoChange(nextAnoLetivo: number) {
    setAnoLetivo(nextAnoLetivo);
    setModalRow(null);
    setStatusFilter('todos');
  }

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
  const visibleSchools = useMemo(
    () => getSchoolsForCurrentScope({
      superintendent: activeSuper,
      allSchools: SEED_SCHOOLS,
      isAuthenticated: isFirebaseMode,
      adminScope,
    }),
    [activeSuper, isFirebaseMode, adminScope]
  );

  // Se a escola selecionada deixar de estar no escopo atual, a seleção é
  // limpa — nunca continua mostrando uma escola fora do escopo autorizado.
  useEffect(() => {
    if (selectedSchoolId && !visibleSchools.some(s => s.id === selectedSchoolId)) {
      setSelectedSchoolId('');
    }
  }, [visibleSchools, selectedSchoolId]);

  const selectedSchool: SchoolLike | null = visibleSchools.find(s => s.id === selectedSchoolId) ?? null;

  // Turmas de UMA escola por vez (nunca a coleção inteira — seção 2 do code
  // review do PR #17). Não depende de anoLetivo: as turmas da escola inteira
  // são carregadas uma vez por escola/sessão, e o ano letivo filtra em
  // memória via getClassroomsForSchoolYear, sem nova consulta ao Firestore.
  const {
    turmas, status: turmasStatus, loading: turmasLoading, loadError: turmasError, refresh: refreshTurmas,
  } = useSchoolClassrooms(selectedSchool ? selectedSchool.id : null, isFirebaseMode);
  const turmasUnavailable = turmasStatus === 'failure';

  // Identidade da turma resolvida pela cascata real da Fase 2A (codInep →
  // schoolId/escolaId → nome normalizado só como último recurso).
  const turmasDaEscola = useMemo(
    () => (selectedSchool ? getClassroomsForSchoolYear(turmas, selectedSchool, anoLetivo) : []),
    [turmas, selectedSchool, anoLetivo]
  );

  const {
    monitoring, status: monitoringStatus, loading: monitoringLoading, loadError: monitoringError, refresh: refreshMonitoring,
  } = useGradeEntryMonitoring(
    selectedSchool ? selectedSchool.id : null,
    anoLetivo,
    bimestre,
    isFirebaseMode
  );
  const monitoringUnavailable = monitoringStatus === 'failure';

  const monitoringByTurmaId = useMemo(() => {
    const map = new Map<string, (typeof monitoring)[number]>();
    monitoring.forEach(m => map.set(m.turmaId, m));
    return map;
  }, [monitoring]);

  const rows: GradeEntryMonitoringRow[] = turmasDaEscola.map(turma => ({
    turmaId: turma.id,
    turmaNome: turma.nome,
    matriculaAtual: turma.matriculaAtual ?? null,
    monitoring: monitoringByTurmaId.get(turma.id) ?? null,
  }));

  const consolidated = consolidateGradeEntryMonitoring(rows);
  const isLoading = turmasLoading || monitoringLoading;

  const scopeLabel = getSchoolScopeLabel({
    superintendent: activeSuper,
    allSchoolNames: ALL_SCHOOL_NAMES,
    isAuthenticated: isFirebaseMode,
    adminScope,
  });

  const canWrite = selectedSchool ? hasSchoolWriteAccess(selectedSchool.nome) : false;

  // Reestruturação SIFEC — visão de período/consolidado e/ou escopo
  // regional: busca sob demanda, só quando o usuário pede uma dessas visões
  // (nunca no carregamento normal por bimestre único, que já usa
  // useGradeEntryMonitoring acima). Cada escola no escopo contribui suas
  // turmas + os documentos de monitoramento dos bimestres relevantes —
  // agrupados por turma antes de agregar (aggregateGradeEntriesForPeriod
  // nunca soma totalStudents entre bimestres, só lançamentos).
  const showAggregateView = visao !== 'bimestre' || regionalScope;
  useEffect(() => {
    if (!showAggregateView || !isFirebaseMode) {
      setAggregateGroups(null);
      setAggregateError('');
      return;
    }
    const schoolsEscopo = regionalScope ? visibleSchools : (selectedSchool ? [selectedSchool] : []);
    if (schoolsEscopo.length === 0) {
      setAggregateGroups(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setAggregateLoading(true);
      setAggregateError('');
      try {
        const bimestresEscopo = visao === 'bimestre' ? [bimestre] : VISAO_BIMESTRES[visao];
        const perSchoolGroups = await Promise.all(schoolsEscopo.map(async school => {
          const [turmasRaw, ...monitoringLists] = await Promise.all([
            listClassroomsForSchool(school.id),
            ...bimestresEscopo.map(b => listGradeEntryMonitoringForSchool(school.id, anoLetivo, b)),
          ]);
          const turmasDoAno = getClassroomsForSchoolYear(turmasRaw, school, anoLetivo);
          const byTurma = new Map<string, GradeEntryCounts[]>();
          turmasDoAno.forEach(t => byTurma.set(t.id, []));
          monitoringLists.flat().forEach(m => {
            const list = byTurma.get(m.turmaId) ?? [];
            list.push(m);
            byTurma.set(m.turmaId, list);
          });
          return Array.from(byTurma.values());
        }));
        if (!cancelled) setAggregateGroups(perSchoolGroups.flat());
      } catch (err) {
        if (!cancelled) setAggregateError(err instanceof Error ? err.message : 'Não foi possível carregar a visão agregada.');
      } finally {
        if (!cancelled) setAggregateLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [showAggregateView, visao, regionalScope, bimestre, anoLetivo, isFirebaseMode, selectedSchool, visibleSchools]);

  const aggregateResult = aggregateGroups ? aggregateGradeEntriesForPeriod(aggregateGroups) : null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 — ACOMPANHAMENTO PEDAGÓGICO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Notas Bimestrais</h2>
          <p className="text-xs text-slate-500 font-normal max-w-2xl">
            Acompanhamento do preenchimento de notas no SIGE Escola por unidade e turma.
          </p>
          {!isFirebaseMode && (
            <span className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-md uppercase tracking-wide">
              Modo demonstração — faça login para ver e registrar dados reais
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap md:justify-end">
          <span className="text-[10px] text-slate-500 font-mono font-bold uppercase bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
            {scopeLabel}
          </span>
          <select
            value={selectedSchoolId}
            onChange={e => setSelectedSchoolId(e.target.value)}
            aria-label="Escola"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl max-w-[220px]"
          >
            <option value="">Selecione a escola</option>
            {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select
            value={anoLetivo}
            onChange={e => handleAnoLetivoChange(Number(e.target.value))}
            aria-label="Ano letivo"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl"
          >
            {anoLetivoOptions.map(ano => <option key={ano} value={ano}>{ano}</option>)}
          </select>
          {visao === 'bimestre' && (
            <select
              value={bimestre}
              onChange={e => setBimestre(Number(e.target.value) as Bimestre)}
              aria-label="Bimestre"
              className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl"
            >
              <option value={1}>1º Bimestre</option>
              <option value={2}>2º Bimestre</option>
              <option value={3}>3º Bimestre</option>
              <option value={4}>4º Bimestre</option>
            </select>
          )}
          <select
            value={visao}
            onChange={e => setVisao(e.target.value as Visao)}
            aria-label="Visão"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl"
          >
            {(Object.keys(VISAO_LABEL) as Visao[]).map(v => <option key={v} value={v}>{VISAO_LABEL[v]}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setRegionalScope(prev => !prev)}
            aria-pressed={regionalScope}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border ${
              regionalScope
                ? 'bg-brand-turquoise text-white border-brand-turquoise-dark/20'
                : 'bg-white text-slate-600 border-slate-250 hover:border-brand-turquoise'
            }`}
          >
            <Globe2 size={14} /> Agregados regionais (SEFOR 3 — {anoLetivo})
          </button>
        </div>
      </div>

      <div className="bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-xl px-4 py-2.5 text-[11px] text-slate-600">
        Esta visão utiliza somente dados agregados dos relatórios do SIGE Escola. Nenhuma nota individual é armazenada neste painel.
      </div>

      {showAggregateView ? (
        <div className="space-y-3">
          {!isFirebaseMode ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
              Visões de período e agregados regionais ficam disponíveis após o login.
            </div>
          ) : aggregateError ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold">{aggregateError}</div>
          ) : !regionalScope && !selectedSchool ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
              Selecione uma escola, ou ative “Agregados regionais”, para ver esta visão.
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  {VISAO_LABEL[visao]} — {regionalScope ? `SEFOR 3 (${visibleSchools.length} escolas)` : selectedSchool?.nome}
                </span>
                {aggregateResult && (
                  <span className={`inline-flex items-center gap-1.5 text-sm font-black font-mono ${COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(aggregateResult.percentualGeral)].textClassName}`}>
                    <Percent size={14} />
                    {aggregateResult.percentualGeral == null ? 'Não informado' : `${aggregateResult.percentualGeral.toFixed(0)}%`}
                  </span>
                )}
              </div>
              {aggregateLoading || !aggregateResult ? (
                <div className="py-6 text-center text-slate-400 text-xs">Carregando...</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Turmas no escopo</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{aggregateResult.turmasNoEscopo}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Com ao menos 1 relatório</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{aggregateResult.turmasComAoMenosUmRelatorio}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Sem nenhum relatório</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{aggregateResult.turmasSemNenhumRelatorio}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Lançamentos (realizados/esperados)</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{aggregateResult.totalCompletedGradeEntries} / {aggregateResult.totalExpectedGradeEntries}</div>
                  </div>
                  {aggregateResult.turmasComInconsistencia > 0 && (
                    <div className="col-span-2 sm:col-span-4 bg-orange-50 border border-orange-300 rounded-xl px-3 py-2 text-[11px] text-orange-700 font-bold">
                      {aggregateResult.turmasComInconsistencia} turma(s) com relatório inconsistente no período — excluídas do percentual geral.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : !selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
          Selecione uma escola para carregar o acompanhamento de notas.
        </div>
      ) : turmasUnavailable ? (
        <div className="bg-white border border-rose-200 rounded-2xl p-10 text-center text-xs">
          <p className="text-rose-500 font-bold mb-1">
            Não foi possível carregar as turmas desta escola{turmasError ? `: ${turmasError}` : '.'}
          </p>
          <p className="text-slate-400 mb-3">Nenhum dado de turma é exibido enquanto esta falha não for resolvida.</p>
          <button
            type="button"
            onClick={refreshTurmas}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition"
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <NotasSummaryCards stats={consolidated} loading={isLoading || monitoringUnavailable} />

          {monitoringError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold flex items-center justify-between gap-3">
              <span>{monitoringError}</span>
              <button
                type="button"
                onClick={refreshMonitoring}
                className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition shrink-0"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {monitoringUnavailable ? (
            <div className="bg-white border border-rose-200 rounded-2xl p-10 text-center text-xs text-rose-500 font-bold">
              Acompanhamento indisponível — não foi possível carregar o relatório de notas desta escola.
            </div>
          ) : (
            <GradeEntryMonitoringTable
              rows={rows}
              loading={isLoading}
              canWrite={canWrite}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onRegistrar={setModalRow}
            />
          )}
        </>
      )}

      {modalRow && selectedSchool && (
        <GradeEntryMonitoringFormModal
          school={selectedSchool}
          turmaId={modalRow.turmaId}
          turmaNome={modalRow.turmaNome}
          anoLetivo={anoLetivo}
          bimestre={bimestre}
          existing={modalRow.monitoring}
          onClose={() => setModalRow(null)}
          onSaved={refreshMonitoring}
        />
      )}
    </div>
  );
}
