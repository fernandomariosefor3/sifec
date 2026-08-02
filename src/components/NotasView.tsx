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
import { ClipboardPlus } from 'lucide-react';
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
import { getClassroomsForSchoolYear } from '../lib/classService';
import { useSchoolClassrooms } from '../hooks/useSchoolClassrooms';
import { useGradeEntryMonitoring } from '../hooks/useGradeEntryMonitoring';
import { consolidateGradeEntryMonitoring } from '../lib/gradeEntryMonitoringCalculations';
import { buildAnoLetivoOptions } from '../lib/anoLetivoOptions';
import NotasSummaryCards from './notas/NotasSummaryCards';
import GradeEntryMonitoringTable, {
  type GradeEntryMonitoringRow,
  type StatusFilter,
} from './notas/GradeEntryMonitoringTable';
import GradeEntryMonitoringFormModal from './notas/GradeEntryMonitoringFormModal';
import SigeReportModal from './notas/SigeReportModal';
import type { Bimestre } from '../types/gradeEntryMonitoring';

const ALL_SCHOOL_NAMES = SEED_SCHOOLS.map(s => s.nome);

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

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
  const [showSigeReportModal, setShowSigeReportModal] = useState(false);

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

  function handleRelatorioSaved() {
    refreshTurmas();
    refreshMonitoring();
  }

  // Botão permanente (correção funcional pós-PR #17): precisa existir mesmo
  // sem nenhuma turma cadastrada, sem acompanhamento anterior, ou com a
  // tabela vazia — nunca depende de uma linha existir. Ano letivo e
  // bimestre sempre têm um valor selecionado (nunca vazio nestes selects),
  // então as condições reais são escola+autorização+fontes seguras.
  //
  // Item 4 do code review do PR #18: "seguro" exige as duas fontes
  // (turmas E grade_entry_monitoring) em status 'success' — nunca só "não
  // falhou". 'loading'/'idle' também desabilitam: sem a lista real de
  // turmas E do acompanhamento já carregados, a correspondência do
  // relatório não tem como saber quais turmas já existem nem quais já têm
  // registro neste bimestre, arriscando criar uma turma duplicada ou abrir
  // o modal com existingMonitoringByTurmaId desconhecido. Consulta
  // bem-sucedida e vazia (0 turmas, 0 acompanhamentos) CONTINUA habilitando
  // — 'success' não exige nenhum resultado, só que a consulta tenha
  // terminado sem erro.
  const sourcesSafe = turmasStatus === 'success' && monitoringStatus === 'success';
  const showRegistrarRelatorioButton = !!selectedSchool && canWrite && sourcesSafe;

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
          {showRegistrarRelatorioButton && (
            <button
              type="button"
              onClick={() => setShowSigeReportModal(true)}
              className="py-1.5 px-3 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap"
            >
              <ClipboardPlus size={14} /> Registrar relatório do SIGE
            </button>
          )}
        </div>
      </div>

      <div className="bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-xl px-4 py-2.5 text-[11px] text-slate-600">
        Esta visão utiliza somente dados agregados dos relatórios do SIGE Escola. Nenhuma nota individual é armazenada neste painel.
      </div>

      {!selectedSchool ? (
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
          ) : !isLoading && turmasDaEscola.length === 0 ? (
            // Correção funcional pós-PR #17: nenhuma turma cadastrada não é
            // mais um beco sem saída que exige sair para Gestão de Escolas —
            // o relatório do SIGE pode nascer a própria turma, com
            // confirmação humana (ver SigeReportModal).
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-xs">
              <p className="text-slate-500 font-bold mb-1">Nenhum relatório registrado para esta escola, ano e bimestre.</p>
              <p className="text-slate-400 mb-3">Registre os totais agregados do relatório do SIGE Escola para começar o acompanhamento.</p>
              {showRegistrarRelatorioButton && (
                <button
                  type="button"
                  onClick={() => setShowSigeReportModal(true)}
                  className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 rounded-lg text-[11px] font-bold text-white transition inline-flex items-center gap-1.5"
                >
                  <ClipboardPlus size={13} /> Registrar relatório do SIGE
                </button>
              )}
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

      {showSigeReportModal && selectedSchool && (
        <SigeReportModal
          school={selectedSchool}
          anoLetivo={anoLetivo}
          bimestre={bimestre}
          existingTurmas={turmasDaEscola}
          existingMonitoringByTurmaId={monitoringByTurmaId}
          onClose={() => setShowSigeReportModal(false)}
          onSaved={handleRelatorioSaved}
          onRefreshSources={handleRelatorioSaved}
        />
      )}
    </div>
  );
}
