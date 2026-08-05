// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": uma linha por TURMA + DISCIPLINA (nunca só por turma). Cada
// turma cadastrada sempre mostra as 4 áreas (mesmo sem nenhum lançamento
// ainda informado) — mesmo princípio de "nunca esconder uma linha por
// ausência de documento" já usado em GradeEntryMonitoringTable.tsx.
import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import {
  classifyCompletionColorBand,
  calculateCompletionPercentage,
  COMPLETION_COLOR_BAND_INFO,
} from '../../lib/gradeEntryMonitoringCalculations';
import { DISCIPLINA_AREAS, DISCIPLINA_AREA_LABELS, type DisciplinaArea, type GradeEntryMonitoringByDiscipline } from '../../types/gradeEntryMonitoringDiscipline';
import type { Bimestre } from '../../types/gradeEntryMonitoring';

export interface DisciplineRow {
  turmaId: string;
  turmaNome: string;
  disciplina: DisciplinaArea;
  entry: GradeEntryMonitoringByDiscipline | null;
}

export function buildDisciplineRows(
  turmas: readonly { id: string; nome: string }[],
  entries: readonly GradeEntryMonitoringByDiscipline[]
): DisciplineRow[] {
  const byKey = new Map<string, GradeEntryMonitoringByDiscipline>();
  entries.forEach(e => byKey.set(`${e.turmaId}_${e.disciplina}`, e));
  const rows: DisciplineRow[] = [];
  turmas.forEach(turma => {
    DISCIPLINA_AREAS.forEach(disciplina => {
      rows.push({ turmaId: turma.id, turmaNome: turma.nome, disciplina, entry: byKey.get(`${turma.id}_${disciplina}`) ?? null });
    });
  });
  return rows;
}

interface SaveDraft {
  expectedGradeEntries: string;
  completedGradeEntries: string;
  status: 'rascunho' | 'confirmado';
  referenceDate: string;
}

interface GradeEntryMonitoringByDisciplineTableProps {
  rows: readonly DisciplineRow[];
  loading: boolean;
  canWrite: boolean;
  anoLetivo: number;
  bimestre: Bimestre;
  onSave: (row: DisciplineRow, draft: SaveDraft) => Promise<void>;
}

export default function GradeEntryMonitoringByDisciplineTable({
  rows, loading, canWrite, onSave,
}: GradeEntryMonitoringByDisciplineTableProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<SaveDraft>({ expectedGradeEntries: '', completedGradeEntries: '', status: 'rascunho', referenceDate: '' });
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');

  function rowKey(row: DisciplineRow): string {
    return `${row.turmaId}_${row.disciplina}`;
  }

  function openEdit(row: DisciplineRow) {
    setEditingKey(rowKey(row));
    setRowError('');
    setDraft({
      expectedGradeEntries: row.entry ? String(row.entry.expectedGradeEntries) : '',
      completedGradeEntries: row.entry ? String(row.entry.completedGradeEntries) : '',
      status: row.entry?.status ?? 'rascunho',
      referenceDate: row.entry?.referenceDate ?? new Date().toISOString().slice(0, 10),
    });
  }

  async function handleSave(row: DisciplineRow) {
    setSaving(true);
    setRowError('');
    try {
      await onSave(row, draft);
      setEditingKey(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Turma</th>
              <th className="py-3 px-4">Disciplina</th>
              <th className="py-3 px-4 text-right">Esperados</th>
              <th className="py-3 px-4 text-right">Realizados</th>
              <th className="py-3 px-4 text-right">Preenchimento</th>
              <th className="py-3 px-4">Situação</th>
              {canWrite && <th className="py-3 px-4 text-right">Ação</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
            {loading ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">Nenhuma turma cadastrada para esta escola e ano letivo.</td></tr>
            ) : (
              rows.map(row => {
                const key = rowKey(row);
                const isEditing = editingKey === key;
                const percentage = row.entry ? calculateCompletionPercentage(row.entry) : null;
                const band = COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(percentage)];
                return (
                  <tr key={key} className="hover:bg-slate-50/30 transition">
                    <td className="py-3 px-4 font-bold text-slate-800">{row.turmaNome}</td>
                    <td className="py-3 px-4">{DISCIPLINA_AREA_LABELS[row.disciplina]}</td>
                    {isEditing ? (
                      <>
                        <td className="py-2 px-2 text-right">
                          <input type="number" inputMode="numeric" min={0} value={draft.expectedGradeEntries}
                            onChange={e => setDraft({ ...draft, expectedGradeEntries: e.target.value })}
                            className="w-20 p-1 border border-slate-250 rounded-md text-right font-mono text-xs" />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input type="number" inputMode="numeric" min={0} value={draft.completedGradeEntries}
                            onChange={e => setDraft({ ...draft, completedGradeEntries: e.target.value })}
                            className="w-20 p-1 border border-slate-250 rounded-md text-right font-mono text-xs" />
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400">—</td>
                        <td className="py-2 px-2">
                          <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as SaveDraft['status'] })}
                            className="p-1 border border-slate-250 rounded-md text-xs font-bold">
                            <option value="rascunho">Rascunho</option>
                            <option value="confirmado">Confirmado</option>
                          </select>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" disabled={saving} onClick={() => handleSave(row)} title="Salvar"
                              className="p-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-md transition disabled:opacity-50">
                              <Save size={12} />
                            </button>
                            <button type="button" onClick={() => setEditingKey(null)} title="Cancelar"
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-md transition">
                              <X size={12} />
                            </button>
                          </div>
                          {rowError && <div className="text-rose-600 font-bold mt-1 whitespace-nowrap">{rowError}</div>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.entry ? row.entry.expectedGradeEntries : '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.entry ? row.entry.completedGradeEntries : '—'}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex items-center gap-1.5 justify-end font-mono font-bold ${band.textClassName}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${band.dotClassName}`} />
                            {percentage == null ? 'Não informado' : `${percentage.toFixed(0)}%`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">{row.entry ? (row.entry.status === 'confirmado' ? 'Confirmado' : 'Rascunho') : '—'}</td>
                        {canWrite && (
                          <td className="py-3 px-4 text-right">
                            <button type="button" onClick={() => openEdit(row)}
                              className="px-2.5 py-1 bg-white border border-slate-250 hover:border-brand-turquoise text-slate-600 rounded-lg text-[11px] font-bold flex items-center gap-1 ml-auto transition">
                              <Pencil size={11} /> {row.entry ? 'Atualizar' : 'Registrar'}
                            </button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
