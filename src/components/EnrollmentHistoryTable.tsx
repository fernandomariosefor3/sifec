// Seção "Histórico" do painel de matrículas — extraído de
// SchoolEnrollmentPanel.tsx para manter os arquivos de componente sob o
// limite de 500 linhas do projeto.
import { History } from 'lucide-react';
import type { EnrollmentSnapshot } from '../types/enrollment';

interface EnrollmentHistoryTableProps {
  snapshots: EnrollmentSnapshot[];
}

export default function EnrollmentHistoryTable({ snapshots }: EnrollmentHistoryTableProps) {
  return (
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
  );
}
