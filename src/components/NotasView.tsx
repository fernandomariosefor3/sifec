// Fase 2C — Notas Bimestrais Seguras e Monitoramento de Preenchimento.
// Substitui a versão anterior, que era puramente demonstrativa: usava a
// coleção `grades` legado (sem schoolId/turmaId/anoLetivo, vínculo de
// turma só por texto, o primeiro item da lista de turmas usado como
// fallback perigoso quando a turma não era encontrada, exclusão
// definitiva, classificação Aprovado/Recuperação/Retido, e os dados
// fictícios de demonstração continuavam visíveis mesmo com Firebase
// conectado quando a coleção real estava vazia — ver
// docs/fase-2c-inventario-notas-legadas.md para o inventário completo.
// Este módulo usa duas coleções novas (student_rosters +
// student_bimester_grades), isoladas por schoolId/turmaId/anoLetivo/
// bimestre, e NUNCA lê/grava na coleção legado.
//
// Painel de acompanhamento de PREENCHIMENTO, não diário oficial nem
// sistema de aprovação — nunca classifica estudante como aprovado,
// reprovado, retido, em recuperação ou com defasagem confirmada.
import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../lib/firebase';
import { SEED_SCHOOLS, SEED_TURMAS, subscribeToCollection } from '../lib/firebaseService';
import {
  getSuperintendents,
  getActiveSuperintendentId,
  getAdminSchoolScope,
  getSchoolsForCurrentScope,
  getSchoolScopeLabel,
  hasSchoolWriteAccess,
} from '../lib/superintendentService';
import { getClassroomsForSchool } from '../lib/classService';
import { activateStudentRosterEntry, deactivateStudentRosterEntry } from '../lib/studentRosterService';
import { useStudentRosterAndGrades } from '../hooks/useStudentRosterAndGrades';
import { consolidateStudentFill, type StudentFillEntry } from '../lib/studentGradeCalculations';
import NotasSummaryCards from './notas/NotasSummaryCards';
import ClassGradeCoverageTable, { type ClassCoverageRow } from './notas/ClassGradeCoverageTable';
import StudentGradeTable, { type StudentGradeRow, type FillFilter } from './notas/StudentGradeTable';
import StudentRegistrationModal from './notas/StudentRegistrationModal';
import StudentBimesterGradeFormModal from './notas/StudentBimesterGradeFormModal';
import type { Turma } from '../types/classroom';
import type { Bimestre } from '../types/studentBimesterGrade';

const ANO_LETIVO_ATUAL = 2026;
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
  const [turmas, setTurmas] = useState<Turma[]>(SEED_TURMAS as unknown as Turma[]);
  const [anoLetivo] = useState(ANO_LETIVO_ATUAL);
  const [bimestre, setBimestre] = useState<Bimestre>(1);
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [drillTurmaId, setDrillTurmaId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FillFilter>('todos');
  const [search, setSearch] = useState('');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [gradeModalRow, setGradeModalRow] = useState<StudentGradeRow | null>(null);

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

  // Turmas reais da Fase 2A — nunca uma lista própria recalculada aqui.
  useEffect(() => {
    if (!isFirebaseMode) {
      setTurmas(SEED_TURMAS as unknown as Turma[]);
      return;
    }
    const unsubscribe = subscribeToCollection('turmas', loaded => setTurmas(loaded as Turma[]));
    return () => unsubscribe();
  }, [isFirebaseMode]);

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

  // Se a escola selecionada deixar de estar no escopo atual (troca de
  // carteira/global, ou troca de superintendente), a seleção é limpa —
  // nunca continua mostrando nomes de uma escola fora do escopo autorizado.
  useEffect(() => {
    if (selectedSchoolId && !visibleSchools.some(s => s.id === selectedSchoolId)) {
      setSelectedSchoolId('');
    }
  }, [visibleSchools, selectedSchoolId]);

  const selectedSchool: SchoolLike | null = visibleSchools.find(s => s.id === selectedSchoolId) ?? null;

  // Identidade da turma resolvida pela cascata real da Fase 2A (codInep →
  // schoolId/escolaId → nome normalizado só como último recurso — nunca só
  // por texto, nunca a primeira turma da lista como fallback quando a
  // busca falha). Sem escola selecionada, nenhuma turma é resolvida.
  const turmasDaEscola = useMemo(
    () => (selectedSchool ? getClassroomsForSchool(turmas, selectedSchool) : []),
    [turmas, selectedSchool]
  );

  const { roster, grades, loading, loadError, refresh } = useStudentRosterAndGrades(
    selectedSchool ? selectedSchool.id : null,
    anoLetivo,
    bimestre,
    isFirebaseMode
  );

  const gradesByRosterId = useMemo(() => {
    const map = new Map<string, (typeof grades)[number]>();
    grades.forEach(g => map.set(g.rosterId, g));
    return map;
  }, [grades]);

  const classCoverageRows: ClassCoverageRow[] = turmasDaEscola.map(turma => {
    const entries: StudentFillEntry[] = roster
      .filter(r => r.turmaId === turma.id)
      .map(r => ({ studentKey: r.studentKey, active: r.active, scores: gradesByRosterId.get(r.id)?.scores ?? null }));
    return { turmaId: turma.id, turmaNome: turma.nome, stats: consolidateStudentFill(entries) };
  });

  const schoolStats = consolidateStudentFill(
    roster.map(r => ({ studentKey: r.studentKey, active: r.active, scores: gradesByRosterId.get(r.id)?.scores ?? null }))
  );

  const drillTurma = turmasDaEscola.find(t => t.id === drillTurmaId) ?? null;
  const studentRows: StudentGradeRow[] = roster.map(r => ({
    studentKey: r.studentKey,
    studentName: r.studentName,
    turmaId: r.turmaId,
    turmaNome: r.turmaNome,
    active: r.active,
    scores: gradesByRosterId.get(r.id)?.scores ?? null,
  }));
  const scopedStudentRows = drillTurmaId ? studentRows.filter(r => r.turmaId === drillTurmaId) : studentRows;

  const scopeLabel = getSchoolScopeLabel({
    superintendent: activeSuper,
    allSchoolNames: ALL_SCHOOL_NAMES,
    isAuthenticated: isFirebaseMode,
    adminScope,
  });

  const canWrite = selectedSchool ? hasSchoolWriteAccess(selectedSchool.nome) : false;

  async function handleToggleActive(row: StudentGradeRow) {
    const email = auth.currentUser?.email;
    if (!selectedSchool || !email) return;
    const input = {
      schoolId: selectedSchool.id,
      anoLetivo,
      turmaId: row.turmaId,
      studentKey: row.studentKey,
      actingUserEmail: email,
      now: new Date().toISOString(),
    };
    if (row.active) {
      await deactivateStudentRosterEntry(input);
    } else {
      await activateStudentRosterEntry(input);
    }
    refresh();
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] text-brand-turquoise tracking-wider uppercase font-black font-mono">SEFOR 3 — ACOMPANHAMENTO PEDAGÓGICO</span>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-0.5">Notas Bimestrais</h2>
          <p className="text-xs text-slate-500 font-normal max-w-2xl">
            Painel de acompanhamento de preenchimento — não é diário oficial nem sistema de aprovação.
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
            onChange={e => { setSelectedSchoolId(e.target.value); setDrillTurmaId(null); }}
            aria-label="Escola"
            className="py-1.5 px-3 bg-white border border-slate-250 focus:outline-none focus:border-brand-turquoise text-xs font-bold rounded-xl max-w-[220px]"
          >
            <option value="">Selecione a escola</option>
            {visibleSchools.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <select value={anoLetivo} disabled aria-label="Ano letivo" className="py-1.5 px-3 bg-slate-100 border border-slate-250 text-xs font-bold rounded-xl text-slate-500">
            <option value={ANO_LETIVO_ATUAL}>{ANO_LETIVO_ATUAL}</option>
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
        </div>
      </div>

      <div className="bg-brand-turquoise/5 border border-brand-turquoise/20 rounded-xl px-4 py-2.5 text-[11px] text-slate-600">
        Dados nominais restritos aos usuários autorizados para esta escola.
      </div>

      {!selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-400 text-xs">
          Selecione uma escola para carregar o acompanhamento de notas.
        </div>
      ) : (
        <>
          <NotasSummaryCards stats={schoolStats} loading={loading} />

          {loadError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-700 font-bold flex items-center justify-between gap-3">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={refresh}
                className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 rounded-lg text-[11px] font-bold text-rose-700 transition shrink-0"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!drillTurmaId ? (
            <ClassGradeCoverageTable rows={classCoverageRows} loading={loading} onVerEstudantes={setDrillTurmaId} />
          ) : (
            <StudentGradeTable
              students={scopedStudentRows}
              loading={loading}
              canWrite={canWrite}
              filter={filter}
              onFilterChange={setFilter}
              search={search}
              onSearchChange={setSearch}
              turmaFilterName={drillTurma?.nome ?? null}
              onClearTurmaFilter={() => setDrillTurmaId(null)}
              onPreencherNotas={setGradeModalRow}
              onToggleActive={handleToggleActive}
              onCadastrarEstudante={() => setRegistrationOpen(true)}
            />
          )}
        </>
      )}

      {registrationOpen && selectedSchool && (
        <StudentRegistrationModal
          school={selectedSchool}
          turmas={turmasDaEscola}
          anoLetivo={anoLetivo}
          defaultTurmaId={drillTurmaId ?? undefined}
          onClose={() => setRegistrationOpen(false)}
          onSaved={refresh}
        />
      )}

      {gradeModalRow && selectedSchool && (
        <StudentBimesterGradeFormModal
          school={selectedSchool}
          turmaId={gradeModalRow.turmaId}
          turmaNome={gradeModalRow.turmaNome}
          anoLetivo={anoLetivo}
          bimestre={bimestre}
          studentKey={gradeModalRow.studentKey}
          studentName={gradeModalRow.studentName}
          existingScores={gradeModalRow.scores}
          onClose={() => setGradeModalRow(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
