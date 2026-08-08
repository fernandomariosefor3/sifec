// Reestruturação SIFEC — Gestão de Escolas simplificada: a tabela mestre
// mantém somente os dados cadastrais (Nome, Código INEP, Região, Matrícula
// inicial, Meta SPAECE/IDEB) e turmas ativas. As colunas derivadas do antigo
// registro mensal (matrícula atual, variação, cobertura mensal, média por
// turma, entradas/saídas acumuladas, última atualização) foram removidas —
// ver SchoolEnrollmentPanel.tsx.
import { Edit, Lock, MapPin, CalendarRange } from 'lucide-react';
import { isCurrentUserAdmin } from '../lib/superintendentService';

interface School {
  id: string;
  nome: string;
  codInep: string;
  cidade: string;
  regiao?: '4ª' | '5ª';
  matriculas: number;
  idebMedio: number;
  metaIdeb: number;
  status: 'Ativo' | 'Pendente' | 'Inativo';
}

interface SchoolsTableProps {
  schools: School[];
  turmasAtivasPorEscola: Record<string, number>;
  onEdit: (school: School) => void;
  onOpenEnrollmentPanel: (school: School) => void;
}

// Duas colunas ficam fixas durante a rolagem horizontal — o nome da escola à
// esquerda, as ações à direita (mesmo cuidado de usabilidade da versão
// anterior desta tabela).
const STICKY_LEFT_CLASSES = 'sticky left-0 z-10 bg-white';
const STICKY_RIGHT_CLASSES = 'sticky right-0 z-10 bg-white';

export default function SchoolsTable({ schools, turmasAtivasPorEscola, onEdit, onOpenEnrollmentPanel }: SchoolsTableProps) {
  // Edição do registro mestre (nome/INEP/indicadores) é restrita a
  // administrador — superintendente comum só usa "Matrícula por bimestre".
  const canEditMasterRecord = isCurrentUserAdmin();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-separate border-spacing-0">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <th className="py-3.5 px-6">Código INEP</th>
              <th className={`py-3.5 px-6 ${STICKY_LEFT_CLASSES}`}>Nome da Unidade Escolar</th>
              <th className="py-3.5 px-6">Sede / Cidade</th>
              <th className="py-3.5 px-6 text-center">Região</th>
              <th className="py-3.5 px-6 text-right">Matrícula inicial</th>
              <th className="py-3.5 px-6 text-right">Turmas ativas</th>
              <th className="py-3.5 px-6 text-center">Meta SPAECE 2026</th>
              <th className="py-3.5 px-6 text-center">Meta IDEB</th>
              <th className="py-3.5 px-6 text-center">Status</th>
              <th className={`py-3.5 px-6 text-right ${STICKY_RIGHT_CLASSES}`}>Ações</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 font-medium">
            {schools.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400 font-normal border-b border-slate-100">
                  Nenhuma escola corresponde aos critérios de pesquisa informados.
                </td>
              </tr>
            ) : (
              schools.map((school) => (
                <tr key={school.id} className="hover:bg-slate-55/40 transition">
                  <td className="py-4 px-6 font-mono text-slate-500 text-[11px] font-bold border-b border-slate-100">{school.codInep}</td>
                  <td className={`py-4 px-6 font-extrabold text-slate-900 text-sm border-b border-slate-100 ${STICKY_LEFT_CLASSES}`}>
                    {school.nome}
                  </td>
                  <td className="py-4 px-6 border-b border-slate-100">
                    <span className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-slate-400" />
                      {school.cidade}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center font-mono font-bold text-slate-600 border-b border-slate-100">
                    {school.regiao ?? <span className="text-slate-400 font-normal">Não informado</span>}
                  </td>
                  <td className="py-4 px-6 text-right font-bold text-slate-800 border-b border-slate-100">
                    {school.matriculas.toLocaleString()}
                  </td>
                  <td className="py-4 px-6 text-right text-slate-700 border-b border-slate-100">
                    {turmasAtivasPorEscola[school.id] ?? 0}
                  </td>
                  <td className="py-4 px-6 text-center border-b border-slate-100">
                    <span className="font-extrabold text-brand-turquoise font-mono text-xs">{school.idebMedio.toFixed(1)}</span>
                  </td>
                  <td className="py-4 px-6 text-center font-mono font-bold text-slate-500 border-b border-slate-100">{school.metaIdeb.toFixed(1)}</td>
                  <td className="py-4 px-6 text-center border-b border-slate-100">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      school.status === 'Ativo'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
                      {school.status}
                    </span>
                  </td>
                  <td className={`py-4 px-6 text-right border-b border-slate-100 ${STICKY_RIGHT_CLASSES}`}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onOpenEnrollmentPanel(school)}
                        className="px-3 py-1.5 bg-brand-turquoise hover:bg-brand-turquoise/90 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap"
                        title="Matrícula por bimestre e turmas"
                        aria-label={`Matrícula por bimestre da escola ${school.nome}`}
                      >
                        <CalendarRange size={14} />
                        Matrícula por bimestre
                      </button>
                      {canEditMasterRecord ? (
                        <button
                          onClick={() => onEdit(school)}
                          className="p-1.5 hover:bg-slate-100 hover:text-blue-750 text-slate-400 rounded-lg transition"
                          title="Editar cadastro mestre (nome, INEP, indicadores)"
                          aria-label={`Editar cadastro mestre da escola ${school.nome}`}
                        >
                          <Edit size={14} />
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-md"
                          title="Edição do cadastro mestre restrita a administrador"
                        >
                          <Lock size={10} className="text-amber-500" />
                          Restrito
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
