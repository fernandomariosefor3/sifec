import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Settings } from 'lucide-react';
import { auth } from '../lib/firebase';
import { hasSchoolWriteAccess, isCurrentUserAuthorized } from '../lib/superintendentService';
import { getSchoolYear } from '../lib/schoolYearService';
import {
  listEnrollmentSnapshotsForSchool,
  saveEnrollmentSnapshot,
  EnrollmentSnapshotValidationError,
} from '../lib/enrollmentSnapshotService';
import { getActiveClassroomCount, getClassroomsForSchool, saveClassYearFields } from '../lib/classService';
import {
  calculateAccumulatedTotals,
  calculateAverageStudentsPerClass,
  calculateCurrentSchoolEnrollmentCoverage,
  calculateEnrollmentVariation,
  calculateMatriculaFimMes,
  calculateUltimaAtualizacao,
  COVERAGE_STATUS_LABELS,
  describeCoverageStatus,
  formatEnrollmentValue,
  suggestMatriculaInicioMes,
} from '../lib/enrollmentCalculations';
import {
  getClassroomsSetupGuidance,
  getMonthlyEnrollmentSetupGuidance,
  getSchoolYearSetupGuidance,
} from '../lib/schoolSetupGuidance';
import { DEMO_SCHOOL_YEARS_2026 } from '../data/demoSchoolYears';
import SchoolYearConfigForm from './SchoolYearConfigForm';
import ClassroomFormModal from './ClassroomFormModal';
import ClassroomsSection from './ClassroomsSection';
import EnrollmentHistoryTable from './EnrollmentHistoryTable';
import PanelFillGuidance from './PanelFillGuidance';
import MonthlyEnrollmentForm from './MonthlyEnrollmentForm';
import type { Turma } from '../types/classroom';
import type { SchoolYear } from '../types/schoolYear';
import type { EnrollmentSnapshot } from '../types/enrollment';

const ANO_LETIVO = 2026;

// IDs das seções internas do painel — usados pelos atalhos "Preencha nesta
// ordem" (correção de usabilidade) para rolar até a seção correspondente.
// Puramente de navegação: não alteram nenhuma lógica de gravação.
const SECTION_IDS = {
  schoolYearConfig: 'school-year-config',
  classrooms: 'classrooms-section',
  monthlyEnrollment: 'monthly-enrollment',
} as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface SchoolLike {
  id: string;
  nome: string;
  codInep: string;
}

interface SchoolEnrollmentPanelProps {
  school: SchoolLike;
  turmas: Turma[];
  isFirebaseMode: boolean;
  onClose: () => void;
  // Chamado depois de qualquer gravação (config anual, turma, registro
  // mensal) para a tabela principal (EscolasView/SchoolsTable) atualizar
  // sem exigir reload manual — ver seção 8 do plano.
  onDataChanged?: () => void;
}

function naoInformado(value: number | null | undefined): string {
  return formatEnrollmentValue(value);
}

export default function SchoolEnrollmentPanel({ school, turmas, isFirebaseMode, onClose, onDataChanged }: SchoolEnrollmentPanelProps) {
  const [schoolYear, setSchoolYear] = useState<SchoolYear | null>(null);
  const [snapshots, setSnapshots] = useState<EnrollmentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Incrementado pelo botão "Tentar novamente" (seção 8.B do hotfix de
  // estabilização) para reexecutar o carregamento sem fechar o painel.
  const [reloadTick, setReloadTick] = useState(0);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [turmaActionError, setTurmaActionError] = useState('');
  const [classroomModalOpen, setClassroomModalOpen] = useState(false);
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null);

  const turmasDaEscola = useMemo(
    () => getClassroomsForSchool(turmas, school),
    [turmas, school]
  );
  const canWrite = hasSchoolWriteAccess(school.nome);
  // Seção 8.C do hotfix de estabilização: distingue "conta não cadastrada ou
  // inativa" de uma falha real de carregamento — só se aplica com Firebase
  // real conectado e alguém autenticado; nunca aparece no modo demonstração.
  const notAuthorized = isFirebaseMode && !!auth.currentUser && !isCurrentUserAuthorized();

  const [mesReferencia, setMesReferencia] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [matriculaInicioMes, setMatriculaInicioMes] = useState('0');
  const [novasMatriculas, setNovasMatriculas] = useState('0');
  const [transferenciasEntrada, setTransferenciasEntrada] = useState('0');
  const [transferenciasSaida, setTransferenciasSaida] = useState('0');
  const [abandono, setAbandono] = useState('0');
  const [outrasSaidas, setOutrasSaidas] = useState('0');
  const [matriculaFimMes, setMatriculaFimMes] = useState('0');
  const [observacao, setObservacao] = useState('');

  async function reloadSchoolData() {
    const [year, history] = await Promise.all([
      getSchoolYear(school.id, ANO_LETIVO),
      listEnrollmentSnapshotsForSchool(school.id, ANO_LETIVO),
    ]);
    setSchoolYear(year);
    setSnapshots(history);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError('');
      if (!isFirebaseMode) {
        const demo = DEMO_SCHOOL_YEARS_2026[school.id];
        if (!cancelled) {
          setSchoolYear(demo?.schoolYear ?? null);
          setSnapshots([]);
          setLoading(false);
        }
        return;
      }
      try {
        await reloadSchoolData();
      } catch (err) {
        // Nunca deixar a tela renderizar como se a escola simplesmente não
        // tivesse dados — seção 10 do plano.
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Erro ao carregar dados da escola.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadSchoolData depende só de school.id/ANO_LETIVO, já cobertos abaixo
  }, [school.id, isFirebaseMode, reloadTick]);

  // Continuidade mensal (seção 9 do plano): ao trocar turma OU mês, sugere
  // matriculaFimMes do mês anterior mais recente DAQUELA turma como
  // matriculaInicioMes. Só dispara na troca de turma/mês — nunca sobrescreve
  // um valor que o usuário já tenha digitado para a combinação atual.
  useEffect(() => {
    if (!turmaId || !mesReferencia) return;
    const snapshotsDaTurma = snapshots.filter(s => s.turmaId === turmaId);
    const suggestion = suggestMatriculaInicioMes(snapshotsDaTurma, mesReferencia);
    if (suggestion != null) {
      setMatriculaInicioMes(String(suggestion));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só recalcula ao trocar turma/mês (ver comentário acima)
  }, [turmaId, mesReferencia]);

  const turmasAtivas = getActiveClassroomCount(turmasDaEscola);
  // Orientação de estado inicial (seção 7 da correção de usabilidade) —
  // puramente informativo, nunca bloqueia o preenchimento.
  const schoolYearGuidance = getSchoolYearSetupGuidance(schoolYear != null);
  const classroomsGuidance = getClassroomsSetupGuidance(turmasDaEscola.length > 0);
  const monthlyEnrollmentGuidance = getMonthlyEnrollmentSetupGuidance(snapshots.length > 0);
  const demoTotals = !isFirebaseMode ? DEMO_SCHOOL_YEARS_2026[school.id]?.totals : undefined;
  const totals = demoTotals ?? calculateAccumulatedTotals(snapshots);
  const matriculaInicial = schoolYear?.matriculaInicial ?? null;
  // Cobertura por turma (seção 5 da revisão final PR #8) — nunca apresenta
  // um total PARCIAL como se fosse a matrícula completa da escola.
  // Precedência final: 1) total completo calculado por turma; 2)
  // school_years.matriculaAtual como fallback; 3) null — "Não informado".
  const coverage = calculateCurrentSchoolEnrollmentCoverage(snapshots, turmasDaEscola);
  const matriculaAtual = coverage.total ?? schoolYear?.matriculaAtual ?? null;
  const variacao = calculateEnrollmentVariation(matriculaInicial, matriculaAtual);
  const media = calculateAverageStudentsPerClass(matriculaAtual, turmasAtivas);
  const ultimaAtualizacao = calculateUltimaAtualizacao(schoolYear, snapshots, turmasDaEscola);
  const coverageStatusLabel = COVERAGE_STATUS_LABELS[describeCoverageStatus(coverage.coveredClassCount, coverage.activeClassCount)];

  const calculoPreview = calculateMatriculaFimMes({
    matriculaInicioMes: Number(matriculaInicioMes) || 0,
    novasMatriculas: Number(novasMatriculas) || 0,
    transferenciasEntrada: Number(transferenciasEntrada) || 0,
    transferenciasSaida: Number(transferenciasSaida) || 0,
    abandono: Number(abandono) || 0,
    outrasSaidas: Number(outrasSaidas) || 0,
  });
  const divergente = Number(matriculaFimMes) !== calculoPreview;

  async function handleSaveSnapshot(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    const turma = turmasDaEscola.find(t => t.id === turmaId);
    if (!turma || !mesReferencia) {
      setFormError('Selecione a turma e o mês de referência.');
      return;
    }
    const email = auth.currentUser?.email;
    if (!email) {
      setFormError('É preciso estar autenticado para registrar matrícula mensal.');
      return;
    }

    try {
      await saveEnrollmentSnapshot({
        schoolId: school.id,
        codInep: school.codInep,
        escolaNome: school.nome,
        turmaId: turma.id,
        turmaNome: turma.nome,
        anoLetivo: ANO_LETIVO,
        mesReferencia,
        matriculaInicioMes: Number(matriculaInicioMes),
        novasMatriculas: Number(novasMatriculas),
        transferenciasEntrada: Number(transferenciasEntrada),
        transferenciasSaida: Number(transferenciasSaida),
        abandono: Number(abandono),
        outrasSaidas: Number(outrasSaidas),
        matriculaFimMes: Number(matriculaFimMes),
        observacao: observacao.trim() || undefined,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      setFormSuccess('Registro mensal salvo com sucesso.');
      // Recarrega histórico + ano letivo: matrícula atual/variação/média
      // são derivados de `snapshots`/`schoolYear` no corpo do componente,
      // então já recalculam sozinhos ao re-renderizar (seção 8 do plano).
      await reloadSchoolData();
      onDataChanged?.();
    } catch (err) {
      if (err instanceof EnrollmentSnapshotValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar registro mensal: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  async function handleToggleAtiva(turma: Turma) {
    setTurmaActionError('');
    const email = auth.currentUser?.email;
    if (!email) {
      setTurmaActionError('É preciso estar autenticado para ativar/inativar turmas.');
      return;
    }
    try {
      await saveClassYearFields(turma.id, {
        schoolId: turma.schoolId ?? school.id,
        codInep: turma.codInep ?? school.codInep,
        escolaNome: turma.escolaNome,
        anoLetivo: turma.anoLetivo ?? ANO_LETIVO,
        ativa: turma.ativa === false,
        actingUserEmail: email,
        now: new Date().toISOString(),
      });
      onDataChanged?.();
    } catch (err) {
      setTurmaActionError('Erro ao alterar status da turma: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  function openCreateClassroom() {
    setEditingTurma(null);
    setClassroomModalOpen(true);
  }

  function openEditClassroom(turma: Turma) {
    setEditingTurma(turma);
    setClassroomModalOpen(true);
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] text-emerald-700 tracking-wider uppercase font-black font-mono">Acompanhar Matrículas — {ANO_LETIVO}</span>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{school.nome}</h3>
              <p className="text-[10px] text-slate-500 font-mono">INEP: {school.codInep}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
              <X size={18} />
            </button>
          </div>

          {/* Orientação de preenchimento (correção de usabilidade) — atalhos
              sempre visíveis no topo do painel, rolam até a seção
              correspondente. Não altera nenhuma lógica de gravação. */}
          {!loading && !loadError && !notAuthorized && (
            <PanelFillGuidance
              onScrollToSchoolYearConfig={() => scrollToSection(SECTION_IDS.schoolYearConfig)}
              onScrollToClassrooms={() => scrollToSection(SECTION_IDS.classrooms)}
              onScrollToMonthlyEnrollment={() => scrollToSection(SECTION_IDS.monthlyEnrollment)}
              schoolYearGuidance={schoolYearGuidance}
              classroomsGuidance={classroomsGuidance}
              monthlyEnrollmentGuidance={monthlyEnrollmentGuidance}
            />
          )}
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {notAuthorized ? (
            // C. Usuário não autorizado (seção 8.C) — conta não cadastrada ou
            // inativa no SIFEC. Nunca mostra formulário nesse estado.
            <div className="py-10 text-center text-rose-600 text-xs flex flex-col items-center gap-2">
              <AlertTriangle size={18} />
              <span className="font-bold">Sua conta não está cadastrada ou está inativa no SIFEC.</span>
              <span className="text-slate-500 font-normal">Contate o administrador para liberar seu acesso.</span>
            </div>
          ) : loading ? (
            <div className="py-10 text-center text-slate-400 text-xs">Carregando dados da escola...</div>
          ) : loadError ? (
            // B. Falha real de permissão/carregamento (seção 8.B) — nunca
            // deixa o usuário gravar enquanto o acesso não estiver validado
            // (nenhum formulário é renderizado neste ramo) e sempre oferece
            // uma forma de tentar de novo sem fechar o painel.
            <div className="py-10 text-center text-rose-600 text-xs flex flex-col items-center gap-2">
              <AlertTriangle size={18} />
              <span className="font-bold">Não foi possível carregar os dados desta escola.</span>
              <span className="text-slate-500 font-normal">{loadError}</span>
              <button
                type="button"
                onClick={() => setReloadTick(tick => tick + 1)}
                className="mt-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {/* A. Resumo */}
              <section>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2">Resumo</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Matrícula inicial</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{naoInformado(matriculaInicial)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">Matrícula atual</div>
                    <div className="text-sm font-extrabold text-slate-900 mt-0.5">{naoInformado(matriculaAtual)}</div>
                    {/* Cobertura parcial nunca aparece como matrícula confirmada — só
                        como informação auxiliar (seção 6 da revisão final PR #8). */}
                    {!coverage.complete && coverage.coveredClassCount > 0 && (
                      <div className="text-[9px] text-amber-600 font-bold mt-0.5">
                        Parcial: {coverage.partialTotal} alunos em {coverage.coveredClassCount} de {coverage.activeClassCount} turmas
                      </div>
                    )}
                  </div>
                  {[
                    ['Variação', variacao == null ? 'Não informado' : (variacao >= 0 ? `+${variacao}` : String(variacao))],
                    ['Turmas ativas', String(turmasAtivas)],
                    ['Média por turma', media == null ? 'Não informado' : media.toFixed(1)],
                    ['Entradas acumuladas', String(totals.entradasAcumuladas)],
                    ['Saídas acumuladas', String(totals.saidasAcumuladas)],
                    ['Turmas atualizadas', `${coverage.coveredClassCount} de ${coverage.activeClassCount} turmas — ${coverageStatusLabel}`],
                    ['Última atualização', ultimaAtualizacao ? ultimaAtualizacao.slice(0, 10) : 'Não informado'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">{label}</div>
                      <div className="text-sm font-extrabold text-slate-900 mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Configuração do ano letivo (seção 6 do plano) */}
              <section id={SECTION_IDS.schoolYearConfig}>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                  <Settings size={14} /> Configuração do Ano Letivo {ANO_LETIVO}
                </h4>
                <SchoolYearConfigForm
                  school={school}
                  schoolYear={schoolYear}
                  anoLetivo={ANO_LETIVO}
                  turmasAtivas={turmasAtivas}
                  canWrite={canWrite}
                  isFirebaseMode={isFirebaseMode}
                  onSaved={updated => {
                    setSchoolYear(updated);
                    onDataChanged?.();
                  }}
                />
              </section>

              {/* B. Turmas */}
              <ClassroomsSection
                id={SECTION_IDS.classrooms}
                turmasDaEscola={turmasDaEscola}
                canWrite={canWrite}
                isFirebaseMode={isFirebaseMode}
                turmaActionError={turmaActionError}
                onCreateClick={openCreateClassroom}
                onEditClick={openEditClassroom}
                onToggleAtiva={handleToggleAtiva}
              />

              {/* C. Registro mensal */}
              <MonthlyEnrollmentForm
                sectionId={SECTION_IDS.monthlyEnrollment}
                canWrite={canWrite}
                isFirebaseMode={isFirebaseMode}
                turmasDaEscola={turmasDaEscola}
                anoLetivo={ANO_LETIVO}
                formError={formError}
                formSuccess={formSuccess}
                turmaId={turmaId}
                onTurmaIdChange={setTurmaId}
                mesReferencia={mesReferencia}
                onMesReferenciaChange={setMesReferencia}
                movementFields={[
                  { label: 'Matr. início do mês', value: matriculaInicioMes, onChange: setMatriculaInicioMes },
                  { label: 'Novas matrículas', value: novasMatriculas, onChange: setNovasMatriculas },
                  { label: 'Transf. entrada', value: transferenciasEntrada, onChange: setTransferenciasEntrada },
                  { label: 'Transf. saída', value: transferenciasSaida, onChange: setTransferenciasSaida },
                  { label: 'Abandono', value: abandono, onChange: setAbandono },
                  { label: 'Outras saídas', value: outrasSaidas, onChange: setOutrasSaidas },
                ]}
                matriculaFimMes={matriculaFimMes}
                onMatriculaFimMesChange={setMatriculaFimMes}
                observacao={observacao}
                onObservacaoChange={setObservacao}
                calculoPreview={calculoPreview}
                divergente={divergente}
                onSubmit={handleSaveSnapshot}
                onCreateFirstClassroom={openCreateClassroom}
              />

              {/* D. Histórico */}
              <EnrollmentHistoryTable snapshots={snapshots} />
            </>
          )}
        </div>
      </div>

      {classroomModalOpen && (
        <ClassroomFormModal
          school={school}
          anoLetivo={ANO_LETIVO}
          existingTurmas={turmasDaEscola}
          editingTurma={editingTurma}
          onClose={() => setClassroomModalOpen(false)}
          onSaved={() => onDataChanged?.()}
        />
      )}
    </div>
  );
}
