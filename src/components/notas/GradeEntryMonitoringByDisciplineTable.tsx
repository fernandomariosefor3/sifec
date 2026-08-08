// Auditoria da reestruturação SIFEC — requisito central do "Acompanhamento
// de Notas": uma linha por TURMA + DISCIPLINA (nunca só por turma).
//
// Correção final da auditoria, seção 3: disciplina deixou de ser uma lista
// fechada de 4 áreas — agora é texto livre (disciplinaNome), com uma lista
// de disciplinas conhecidas sugerida via <datalist> (nunca uma restrição:
// qualquer nome pode ser digitado). Como não existe mais um conjunto fixo
// e finito de disciplinas a enumerar por turma, a tabela mostra uma linha
// por disciplina JÁ REGISTRADA (nunca linhas vazias inventadas para
// disciplinas que a escola nunca lançou) — "Adicionar disciplina" é a ação
// explícita para criar uma linha nova.
import { useState } from 'react';
import { Plus, Pencil, Save, X } from 'lucide-react';
import {
  classifyCompletionColorBand,
  calculateCompletionPercentage,
  COMPLETION_COLOR_BAND_INFO,
} from '../../lib/gradeEntryMonitoringCalculations';
import {
  AREA_CONHECIMENTO, DISCIPLINAS_CONHECIDAS,
  type AreaConhecimento, type GradeEntryMonitoringByDiscipline,
} from '../../types/gradeEntryMonitoringDiscipline';
import type { Bimestre } from '../../types/gradeEntryMonitoring';

export interface DisciplineRow {
  turmaId: string;
  turmaNome: string;
  disciplinaId: string;
  disciplinaNome: string;
  areaConhecimento?: AreaConhecimento;
  entry: GradeEntryMonitoringByDiscipline;
}

// Uma linha por disciplina já registrada (turma+disciplinaId) — nunca
// enumera um catálogo fixo, já que disciplina agora é texto livre.
export function buildDisciplineRows(entries: readonly GradeEntryMonitoringByDiscipline[]): DisciplineRow[] {
  return [...entries]
    .sort((a, b) => a.turmaNome.localeCompare(b.turmaNome) || a.disciplinaNome.localeCompare(b.disciplinaNome))
    .map(entry => ({
      turmaId: entry.turmaId,
      turmaNome: entry.turmaNome,
      disciplinaId: entry.disciplinaId,
      disciplinaNome: entry.disciplinaNome,
      areaConhecimento: entry.areaConhecimento,
      entry,
    }));
}

export interface DisciplineSaveInput {
  turmaId: string;
  turmaNome: string;
  disciplinaNome: string;
  areaConhecimento?: AreaConhecimento;
  expectedGradeEntries: string;
  completedGradeEntries: string;
  status: 'rascunho' | 'confirmado';
  referenceDate: string;
}

function emptyNewDraft(): DisciplineSaveInput {
  return {
    turmaId: '', turmaNome: '', disciplinaNome: '', areaConhecimento: undefined,
    expectedGradeEntries: '', completedGradeEntries: '', status: 'rascunho',
    referenceDate: new Date().toISOString().slice(0, 10),
  };
}

interface GradeEntryMonitoringByDisciplineTableProps {
  rows: readonly DisciplineRow[];
  turmas: readonly { id: string; nome: string }[];
  loading: boolean;
  canWrite: boolean;
  anoLetivo: number;
  bimestre: Bimestre;
  onSave: (input: DisciplineSaveInput) => Promise<void>;
}

const DISCIPLINA_DATALIST_ID = 'disciplinas-conhecidas-sifec';

export default function GradeEntryMonitoringByDisciplineTable({
  rows, turmas, loading, canWrite, onSave,
}: GradeEntryMonitoringByDisciplineTableProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<DisciplineSaveInput>(emptyNewDraft());
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  function rowKey(row: DisciplineRow): string {
    return `${row.turmaId}_${row.disciplinaId}`;
  }

  function openEdit(row: DisciplineRow) {
    setAddingNew(false);
    setEditingKey(rowKey(row));
    setRowError('');
    setDraft({
      turmaId: row.turmaId, turmaNome: row.turmaNome,
      disciplinaNome: row.disciplinaNome, areaConhecimento: row.areaConhecimento,
      expectedGradeEntries: String(row.entry.expectedGradeEntries),
      completedGradeEntries: String(row.entry.completedGradeEntries),
      status: row.entry.status,
      referenceDate: row.entry.referenceDate,
    });
  }

  function openNew() {
    setEditingKey(null);
    setRowError('');
    setDraft(emptyNewDraft());
    setAddingNew(true);
  }

  function cancelEdit() {
    setEditingKey(null);
    setAddingNew(false);
    setRowError('');
  }

  // Preenche a área automaticamente quando o nome digitado bate
  // exatamente com uma disciplina conhecida — nunca trava o campo: o
  // usuário sempre pode trocar a área manualmente depois.
  function handleDisciplinaNomeChange(value: string) {
    const known = DISCIPLINAS_CONHECIDAS.find(d => d.nome.toLowerCase() === value.trim().toLowerCase());
    setDraft(prev => ({ ...prev, disciplinaNome: value, areaConhecimento: known?.areaConhecimento ?? prev.areaConhecimento }));
  }

  async function handleSave() {
    setSaving(true);
    setRowError('');
    try {
      await onSave(draft);
      setEditingKey(null);
      setAddingNew(false);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  const isEditingSomething = editingKey !== null || addingNew;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <datalist id={DISCIPLINA_DATALIST_ID}>
        {DISCIPLINAS_CONHECIDAS.map(d => <option key={d.nome} value={d.nome} />)}
      </datalist>
      {canWrite && (
        <div className="px-4 py-2.5 border-b border-slate-150 flex justify-end">
          <button type="button" disabled={isEditingSomething && !addingNew} onClick={openNew}
            className="px-2.5 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 disabled:opacity-40 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition">
            <Plus size={12} /> Adicionar disciplina
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-550 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Turma</th>
              <th className="py-3 px-4">Disciplina</th>
              <th className="py-3 px-4">Área</th>
              <th className="py-3 px-4 text-right">Esperados</th>
              <th className="py-3 px-4 text-right">Realizados</th>
              <th className="py-3 px-4 text-right">Preenchimento</th>
              <th className="py-3 px-4">Situação</th>
              {canWrite && <th className="py-3 px-4 text-right">Ação</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-705 font-medium">
            {addingNew && (
              <tr className="bg-brand-turquoise/5">
                <td className="py-2 px-2">
                  <select value={draft.turmaId} onChange={e => {
                    const t = turmas.find(x => x.id === e.target.value);
                    setDraft({ ...draft, turmaId: e.target.value, turmaNome: t?.nome ?? '' });
                  }} aria-label="Turma da nova disciplina" className="w-full p-1 border border-slate-250 rounded-md text-xs font-bold">
                    <option value="">Selecione a turma…</option>
                    {turmas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2">
                  <input type="text" list={DISCIPLINA_DATALIST_ID} value={draft.disciplinaNome}
                    onChange={e => handleDisciplinaNomeChange(e.target.value)}
                    placeholder="Nome da disciplina" aria-label="Nome da disciplina"
                    className="w-full p-1 border border-slate-250 rounded-md text-xs" />
                </td>
                <td className="py-2 px-2">
                  <select value={draft.areaConhecimento ?? ''} onChange={e => setDraft({ ...draft, areaConhecimento: (e.target.value || undefined) as AreaConhecimento | undefined })}
                    aria-label="Área de conhecimento (opcional)" className="w-full p-1 border border-slate-250 rounded-md text-xs">
                    <option value="">Sem área</option>
                    {AREA_CONHECIMENTO.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td className="py-2 px-2 text-right">
                  <input type="number" inputMode="numeric" min={0} value={draft.expectedGradeEntries}
                    onChange={e => setDraft({ ...draft, expectedGradeEntries: e.target.value })}
                    className="w-16 p-1 border border-slate-250 rounded-md text-right font-mono text-xs" />
                </td>
                <td className="py-2 px-2 text-right">
                  <input type="number" inputMode="numeric" min={0} value={draft.completedGradeEntries}
                    onChange={e => setDraft({ ...draft, completedGradeEntries: e.target.value })}
                    className="w-16 p-1 border border-slate-250 rounded-md text-right font-mono text-xs" />
                </td>
                <td className="py-2 px-2 text-right text-slate-400">—</td>
                <td className="py-2 px-2">
                  <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as DisciplineSaveInput['status'] })}
                    className="p-1 border border-slate-250 rounded-md text-xs font-bold">
                    <option value="rascunho">Rascunho</option>
                    <option value="confirmado">Confirmado</option>
                  </select>
                </td>
                <td className="py-2 px-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" disabled={saving} onClick={handleSave} title="Salvar"
                      className="p-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-md transition disabled:opacity-50">
                      <Save size={12} />
                    </button>
                    <button type="button" onClick={cancelEdit} title="Cancelar"
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-md transition">
                      <X size={12} />
                    </button>
                  </div>
                  {rowError && <div className="text-rose-600 font-bold mt-1 whitespace-nowrap">{rowError}</div>}
                </td>
              </tr>
            )}
            {loading ? (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400">Carregando...</td></tr>
            ) : rows.length === 0 && !addingNew ? (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400">Nenhuma disciplina registrada ainda para esta escola, ano e bimestre.</td></tr>
            ) : (
              rows.map(row => {
                const key = rowKey(row);
                const isEditing = editingKey === key;
                const percentage = calculateCompletionPercentage(row.entry);
                const band = COMPLETION_COLOR_BAND_INFO[classifyCompletionColorBand(percentage)];
                return (
                  <tr key={key} className="hover:bg-slate-50/30 transition">
                    <td className="py-3 px-4 font-bold text-slate-800">{row.turmaNome}</td>
                    {isEditing ? (
                      <>
                        <td className="py-2 px-2">
                          <input type="text" list={DISCIPLINA_DATALIST_ID} value={draft.disciplinaNome}
                            onChange={e => handleDisciplinaNomeChange(e.target.value)}
                            aria-label="Nome da disciplina" className="w-full p-1 border border-slate-250 rounded-md text-xs" />
                        </td>
                        <td className="py-2 px-2">
                          <select value={draft.areaConhecimento ?? ''} onChange={e => setDraft({ ...draft, areaConhecimento: (e.target.value || undefined) as AreaConhecimento | undefined })}
                            aria-label="Área de conhecimento (opcional)" className="w-full p-1 border border-slate-250 rounded-md text-xs">
                            <option value="">Sem área</option>
                            {AREA_CONHECIMENTO.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input type="number" inputMode="numeric" min={0} value={draft.expectedGradeEntries}
                            onChange={e => setDraft({ ...draft, expectedGradeEntries: e.target.value })}
                            className="w-16 p-1 border border-slate-250 rounded-md text-right font-mono text-xs" />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input type="number" inputMode="numeric" min={0} value={draft.completedGradeEntries}
                            onChange={e => setDraft({ ...draft, completedGradeEntries: e.target.value })}
                            className="w-16 p-1 border border-slate-250 rounded-md text-right font-mono text-xs" />
                        </td>
                        <td className="py-2 px-2 text-right text-slate-400">—</td>
                        <td className="py-2 px-2">
                          <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as DisciplineSaveInput['status'] })}
                            className="p-1 border border-slate-250 rounded-md text-xs font-bold">
                            <option value="rascunho">Rascunho</option>
                            <option value="confirmado">Confirmado</option>
                          </select>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" disabled={saving} onClick={handleSave} title="Salvar"
                              className="p-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-md transition disabled:opacity-50">
                              <Save size={12} />
                            </button>
                            <button type="button" onClick={cancelEdit} title="Cancelar"
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-md transition">
                              <X size={12} />
                            </button>
                          </div>
                          {rowError && <div className="text-rose-600 font-bold mt-1 whitespace-nowrap">{rowError}</div>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 px-4 font-bold text-slate-700">{row.disciplinaNome}</td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">{row.areaConhecimento ?? '—'}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.entry.expectedGradeEntries}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">{row.entry.completedGradeEntries}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`inline-flex items-center gap-1.5 justify-end font-mono font-bold ${band.textClassName}`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${band.dotClassName}`} />
                            {percentage == null ? 'Não informado' : `${percentage.toFixed(0)}%`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">{row.entry.status === 'confirmado' ? 'Confirmado' : 'Rascunho'}</td>
                        {canWrite && (
                          <td className="py-3 px-4 text-right">
                            <button type="button" disabled={isEditingSomething && !isEditing} onClick={() => openEdit(row)}
                              className="px-2.5 py-1 bg-white border border-slate-250 hover:border-brand-turquoise disabled:opacity-40 text-slate-600 rounded-lg text-[11px] font-bold flex items-center gap-1 ml-auto transition">
                              <Pencil size={11} /> Atualizar
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
