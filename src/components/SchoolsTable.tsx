import { MapPin, Edit, Lock, ClipboardList } from 'lucide-react';
import { hasSchoolWriteAccess } from '../lib/superintendentService';
import { formatEnrollmentValue } from '../lib/enrollmentCalculations';
import type { SchoolEnrollmentSummary } from '../hooks/useSchoolEnrollmentSummaries';

interface School {
  id: string;
  nome: string;
  codInep: string;
  cidade: string;
  matriculas: number;
  idebMedio: number;
  metaIdeb: number;
  status: 'Ativo' | 'Pendente' | 'Inativo';
}

interface SchoolsTableProps {
  schools: School[];
  summaries: Record<string, SchoolEnrollmentSummary>;
  onEdit: (school: School) => void;
  onOpenEnrollmentPanel: (school: School) => void;
}

export default function SchoolsTable({ schools, summaries, onEdit, onOpenEnrollmentPanel }: SchoolsTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-6">Código INEP</th>
              <th className="py-3.5 px-6">Nome da Unidade Escolar</th>
              <th className="py-3.5 px-6">Sede / Cidade</th>
              <th className="py-3.5 px-6 text-right">Matrícula inicial 2026</th>
              <th className="py-3.5 px-6 text-right">Matrícula atual</th>
              <th className="py-3.5 px-6 text-right">Variação</th>
              <th className="py-3.5 px-6 text-right">Turmas ativas</th>
              <th className="py-3.5 px-6 text-right">Média/turma</th>
              <th className="py-3.5 px-6 text-right">Entradas acum.</th>
              <th className="py-3.5 px-6 text-right">Saídas acum.</th>
              <th className="py-3.5 px-6">Última atualização</th>
              <th className="py-3.5 px-6 text-center">Meta SPAECE 2026</th>
              <th className="py-3.5 px-6 text-center">Meta IDEB</th>
              <th className="py-3.5 px-6 text-center">Status</th>
              <th className="py-3.5 px-6 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {schools.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-12 text-center text-slate-400 font-normal">
                  Nenhuma escola corresponde aos critérios de pesquisa informados.
                </td>
              </tr>
            ) : (
              schools.map((school) => {
                const summary = summaries[school.id];
                return (
                  <tr key={school.id} className="hover:bg-slate-55/40 transition">
                    <td className="py-4 px-6 font-mono text-slate-500 text-[11px] font-bold">{school.codInep}</td>
                    <td className="py-4 px-6 font-extrabold text-slate-900 text-sm">{school.nome}</td>
                    <td className="py-4 px-6">
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="text-slate-400" />
                        {school.cidade}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{formatEnrollmentValue(summary?.matriculaInicial)}</td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800">{formatEnrollmentValue(summary?.matriculaAtual)}</td>
                    <td className="py-4 px-6 text-right font-bold">
                      {summary?.variacao == null ? (
                        <span className="text-slate-400 font-normal">Não informado</span>
                      ) : (
                        <span className={summary.variacao >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {summary.variacao >= 0 ? `+${summary.variacao}` : summary.variacao}
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-700">{summary?.turmasAtivas ?? 0}</td>
                    <td className="py-4 px-6 text-right text-slate-700">{summary?.mediaPorTurma == null ? 'Não informado' : summary.mediaPorTurma.toFixed(1)}</td>
                    <td className="py-4 px-6 text-right text-slate-700">{summary?.entradasAcumuladas ?? 0}</td>
                    <td className="py-4 px-6 text-right text-slate-700">{summary?.saidasAcumuladas ?? 0}</td>
                    <td className="py-4 px-6 text-[11px] text-slate-500">
                      {summary?.ultimaAtualizacao ? summary.ultimaAtualizacao.slice(0, 10) : 'Não informado'}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <span className="font-extrabold text-brand-turquoise font-mono text-xs">{school.idebMedio.toFixed(1)}</span>
                    </td>
                    <td className="py-4 px-6 text-center font-mono font-bold text-slate-500">{school.metaIdeb.toFixed(1)}</td>
                    <td className="py-4 px-6 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        school.status === 'Ativo'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        {school.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpenEnrollmentPanel(school)}
                          className="p-1.5 hover:bg-slate-100 hover:text-brand-turquoise text-slate-400 rounded-lg transition"
                          title="Acompanhar matrículas"
                        >
                          <ClipboardList size={14} />
                        </button>
                        {hasSchoolWriteAccess(school.nome) ? (
                          <button
                            onClick={() => onEdit(school)}
                            className="p-1.5 hover:bg-slate-100 hover:text-blue-750 text-slate-400 rounded-lg transition"
                            title="Editar Escola"
                          >
                            <Edit size={14} />
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md" title="Sem permissão de edição para este usuário">
                            <Lock size={10} className="text-amber-500" />
                            Restrito
                          </span>
                        )}
                      </div>
                    </td>
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
