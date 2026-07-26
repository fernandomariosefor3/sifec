import React, { useEffect, useMemo, useState } from 'react';
import { X, Users, History, Save, AlertTriangle, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { hasSchoolWriteAccess } from '../lib/superintendentService';
import { getSchoolYear } from '../lib/schoolYearService';
import {
  listEnrollmentSnapshotsForSchool,
  saveEnrollmentSnapshot,
  EnrollmentSnapshotValidationError,
} from '../lib/enrollmentSnapshotService';
import { getActiveClassroomCount, getClassroomsForSchool } from '../lib/classService';
import {
  calculateAccumulatedTotals,
  calculateAverageStudentsPerClass,
  calculateEnrollmentVariation,
  calculateMatriculaFimMes,
  formatEnrollmentValue,
} from '../lib/enrollmentCalculations';
import { DEMO_SCHOOL_YEARS_2026 } from '../data/demoSchoolYears';
import type { Turma } from '../types/classroom';
import type { SchoolYear } from '../types/schoolYear';
import type { EnrollmentSnapshot } from '../types/enrollment';

const ANO_LETIVO = 2026;

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
}

function naoInformado(value: number | null | undefined): string {
  return formatEnrollmentValue(value);
}

export default function SchoolEnrollmentPanel({ school, turmas, isFirebaseMode, onClose }: SchoolEnrollmentPanelProps) {
  const [schoolYear, setSchoolYear] = useState<SchoolYear | null>(null);
  const [snapshots, setSnapshots] = useState<EnrollmentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const turmasDaEscola = useMemo(() => getClassroomsForSchool(turmas, school.id), [turmas, school.id]);
  const canWrite = hasSchoolWriteAccess(school.nome);

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
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
        const [year, history] = await Promise.all([
          getSchoolYear(school.id, ANO_LETIVO),
          listEnrollmentSnapshotsForSchool(school.id),
        ]);
        if (!cancelled) {
          setSchoolYear(year);
          setSnapshots(history);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [school.id, isFirebaseMode]);

  const turmasAtivas = getActiveClassroomCount(turmasDaEscola);
  const demoTotals = !isFirebaseMode ? DEMO_SCHOOL_YEARS_2026[school.id]?.totals : undefined;
  const totals = demoTotals ?? calculateAccumulatedTotals(snapshots);
  const matriculaInicial = schoolYear?.matriculaInicial ?? null;
  const matriculaAtual = schoolYear?.matriculaAtual ?? null;
  const variacao = calculateEnrollmentVariation(matriculaInicial, matriculaAtual);
  const media = calculateAverageStudentsPerClass(matriculaAtual, turmasAtivas);
  const ultimoMes = snapshots.length > 0 ? snapshots[snapshots.length - 1].mesReferencia : (schoolYear?.ultimaAtualizacao ? schoolYear.ultimaAtualizacao.slice(0, 7) : null);

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
      const history = await listEnrollmentSnapshotsForSchool(school.id);
      setSnapshots(history);
    } catch (err) {
      if (err instanceof EnrollmentSnapshotValidationError) {
        setFormError(err.message);
      } else {
        setFormError('Erro ao salvar registro mensal: ' + (err instanceof Error ? err.message : String(err)));
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl relative flex flex-col overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-150 px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <span className="text-[10px] text-emerald-700 tracking-wider uppercase font-black font-mono">Acompanhar Matrículas — {ANO_LETIVO}</span>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{school.nome}</h3>
            <p className="text-[10px] text-slate-500 font-mono">INEP: {school.codInep}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-650 transition">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-xs">Carregando dados da escola...</div>
          ) : (
            <>
              {/* A. Resumo */}
              <section>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2">Resumo</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Matrícula inicial', naoInformado(matriculaInicial)],
                    ['Matrícula atual', naoInformado(matriculaAtual)],
                    ['Variação', variacao == null ? 'Não informado' : (variacao >= 0 ? `+${variacao}` : String(variacao))],
                    ['Turmas ativas', String(turmasAtivas)],
                    ['Média por turma', media == null ? 'Não informado' : media.toFixed(1)],
                    ['Entradas acumuladas', String(totals.entradasAcumuladas)],
                    ['Saídas acumuladas', String(totals.saidasAcumuladas)],
                    ['Último mês atualizado', ultimoMes ?? 'Não informado'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="text-[9px] uppercase text-slate-400 font-bold tracking-wider">{label}</div>
                      <div className="text-sm font-extrabold text-slate-900 mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* B. Turmas */}
              <section>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                  <Users size={14} /> Turmas
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wide">
                        <th className="py-2 px-3">Turma</th>
                        <th className="py-2 px-3">Modalidade</th>
                        <th className="py-2 px-3">Turno</th>
                        <th className="py-2 px-3 text-right">Matr. inicial</th>
                        <th className="py-2 px-3 text-right">Matr. atual</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {turmasDaEscola.length === 0 ? (
                        <tr><td colSpan={6} className="py-6 text-center text-slate-400">Nenhuma turma cadastrada para esta escola.</td></tr>
                      ) : (
                        turmasDaEscola.map(t => (
                          <tr key={t.id}>
                            <td className="py-2 px-3 font-bold text-slate-800">{t.nome}</td>
                            <td className="py-2 px-3">{t.modalidade ?? 'Não informado'}</td>
                            <td className="py-2 px-3">{t.turno ?? t.periodo}</td>
                            <td className="py-2 px-3 text-right">{naoInformado(t.matriculaInicial)}</td>
                            <td className="py-2 px-3 text-right">{naoInformado(t.matriculaAtual)}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${t.ativa === false ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                {t.ativa === false ? 'Inativa' : 'Ativa'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* C. Registro mensal */}
              <section>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                  <Save size={14} /> Registro mensal
                </h4>
                {!canWrite ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
                    <Lock size={12} className="text-amber-500" /> Sem permissão para registrar matrícula mensal desta escola.
                  </div>
                ) : !isFirebaseMode ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                    Modo demonstração — faça login para registrar matrícula mensal real.
                  </div>
                ) : (
                  <form onSubmit={handleSaveSnapshot} className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    {formError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{formError}</div>
                    )}
                    {formSuccess && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg font-bold">{formSuccess}</div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-600 block">Turma *</label>
                        <select value={turmaId} onChange={e => setTurmaId(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" required>
                          <option value="">Selecione</option>
                          {turmasDaEscola.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-600 block">Mês de referência *</label>
                        <input type="month" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {[
                        ['Matr. início do mês', matriculaInicioMes, setMatriculaInicioMes],
                        ['Novas matrículas', novasMatriculas, setNovasMatriculas],
                        ['Transf. entrada', transferenciasEntrada, setTransferenciasEntrada],
                        ['Transf. saída', transferenciasSaida, setTransferenciasSaida],
                        ['Abandono', abandono, setAbandono],
                        ['Outras saídas', outrasSaidas, setOutrasSaidas],
                      ].map(([label, value, setter]) => (
                        <div key={label as string} className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-600 block">{label as string}</label>
                          <input
                            type="number" min={0} step={1} value={value as string}
                            onChange={e => (setter as (v: string) => void)(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-600 block">Matrícula final *</label>
                        <input
                          type="number" min={0} step={1} value={matriculaFimMes}
                          onChange={e => setMatriculaFimMes(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg"
                        />
                      </div>
                      <div className="text-[10px] text-slate-500">Cálculo esperado: <strong>{calculoPreview}</strong></div>
                    </div>
                    {divergente && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] rounded-lg flex items-start gap-1.5">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        Matrícula final diverge do cálculo esperado ({calculoPreview}). Informe uma observação para salvar mesmo assim.
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-600 block">Observação {divergente ? '*' : ''}</label>
                      <textarea value={observacao} onChange={e => setObservacao(e.target.value)} className="w-full p-2 bg-white border border-slate-250 text-xs rounded-lg" rows={2} />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition">
                      Salvar registro mensal
                    </button>
                  </form>
                )}
              </section>

              {/* D. Histórico */}
              <section>
                <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                  <History size={14} /> Histórico
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wide">
                        <th className="py-2 px-3">Mês</th>
                        <th className="py-2 px-3">Turma</th>
                        <th className="py-2 px-3 text-right">Início</th>
                        <th className="py-2 px-3 text-right">Final</th>
                        <th className="py-2 px-3 text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {snapshots.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-slate-400">Nenhum registro mensal ainda — Não informado.</td></tr>
                      ) : (
                        snapshots.map(s => (
                          <tr key={s.id}>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700">{s.mesReferencia}</td>
                            <td className="py-2 px-3">{s.turmaNome}</td>
                            <td className="py-2 px-3 text-right">{s.matriculaInicioMes}</td>
                            <td className="py-2 px-3 text-right font-bold">{s.matriculaFimMes}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                s.reviewStatus === 'divergencia'
                                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              }`}>
                                {s.reviewStatus}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
