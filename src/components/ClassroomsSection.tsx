// Seção "Turmas" do painel de matrículas — listagem + ações de cadastro,
// edição e ativar/inativar (seção 7 do plano). Extraído de
// SchoolEnrollmentPanel.tsx para manter os arquivos de componente sob o
// limite de 500 linhas do projeto.
import { Users, Plus, Pencil, Power } from 'lucide-react';
import { formatEnrollmentValue } from '../lib/enrollmentCalculations';
import type { Turma } from '../types/classroom';

interface ClassroomsSectionProps {
  turmasDaEscola: Turma[];
  canWrite: boolean;
  isFirebaseMode: boolean;
  turmaActionError: string;
  onCreateClick: () => void;
  onEditClick: (turma: Turma) => void;
  onToggleAtiva: (turma: Turma) => void;
}

export default function ClassroomsSection({
  turmasDaEscola, canWrite, isFirebaseMode, turmaActionError, onCreateClick, onEditClick, onToggleAtiva,
}: ClassroomsSectionProps) {
  const canManage = canWrite && isFirebaseMode;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-black uppercase text-slate-700 flex items-center gap-1.5">
          <Users size={14} /> Turmas
        </h4>
        {canManage && (
          <button
            onClick={onCreateClick}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition"
          >
            <Plus size={12} /> Cadastrar turma
          </button>
        )}
      </div>
      {turmaActionError && (
        <div className="mb-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-[11px] rounded-lg font-bold">{turmaActionError}</div>
      )}
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
              {canManage && <th className="py-2 px-3 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {turmasDaEscola.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">Nenhuma turma cadastrada para esta escola.</td></tr>
            ) : (
              turmasDaEscola.map(t => (
                <tr key={t.id}>
                  <td className="py-2 px-3 font-bold text-slate-800">{t.nome}</td>
                  <td className="py-2 px-3">{t.modalidade ?? 'Não informado'}</td>
                  <td className="py-2 px-3">{t.turno ?? t.periodo}</td>
                  <td className="py-2 px-3 text-right">{formatEnrollmentValue(t.matriculaInicial)}</td>
                  <td className="py-2 px-3 text-right">{formatEnrollmentValue(t.matriculaAtual)}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${t.ativa === false ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                      {t.ativa === false ? 'Inativa' : 'Ativa'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => onEditClick(t)} className="p-1 hover:bg-slate-100 hover:text-blue-700 text-slate-400 rounded-md transition" title="Editar turma">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => onToggleAtiva(t)} className="p-1 hover:bg-slate-100 hover:text-amber-600 text-slate-400 rounded-md transition" title={t.ativa === false ? 'Ativar turma' : 'Inativar turma'}>
                          <Power size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
