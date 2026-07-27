// Correção de usabilidade — bloco de orientação no topo do
// SchoolEnrollmentPanel: atalhos numerados que rolam até cada seção, mais
// as mensagens de estado inicial (quando aplicável). Extraído para manter
// SchoolEnrollmentPanel.tsx sob o limite de 500 linhas do projeto e para
// ficar testável isoladamente, sem depender dos serviços do Firebase que o
// painel completo carrega.
interface PanelFillGuidanceProps {
  onScrollToSchoolYearConfig: () => void;
  onScrollToClassrooms: () => void;
  onScrollToMonthlyEnrollment: () => void;
  schoolYearGuidance: string | null;
  classroomsGuidance: string | null;
  monthlyEnrollmentGuidance: string | null;
}

const SHORTCUT_CLASSES =
  'px-2.5 py-1 bg-slate-50 hover:bg-brand-turquoise/10 border border-slate-200 hover:border-brand-turquoise/40 hover:text-brand-turquoise text-slate-600 rounded-lg text-[10px] font-bold transition';

export default function PanelFillGuidance({
  onScrollToSchoolYearConfig,
  onScrollToClassrooms,
  onScrollToMonthlyEnrollment,
  schoolYearGuidance,
  classroomsGuidance,
  monthlyEnrollmentGuidance,
}: PanelFillGuidanceProps) {
  const hasGuidance = !!(schoolYearGuidance || classroomsGuidance || monthlyEnrollmentGuidance);

  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 space-y-2">
      <p className="text-[11px] text-slate-600">
        Preencha nesta ordem: <strong>1. Ano letivo</strong> → <strong>2. Turmas</strong> → <strong>3. Registro mensal</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onScrollToSchoolYearConfig} className={SHORTCUT_CLASSES}>
          1. Configurar ano letivo
        </button>
        <button type="button" onClick={onScrollToClassrooms} className={SHORTCUT_CLASSES}>
          2. Cadastrar turmas
        </button>
        <button type="button" onClick={onScrollToMonthlyEnrollment} className={SHORTCUT_CLASSES}>
          3. Registrar mês
        </button>
      </div>
      {hasGuidance && (
        <ul className="text-[10px] text-amber-700 space-y-0.5 pt-1.5 border-t border-slate-150">
          {schoolYearGuidance && <li>• {schoolYearGuidance}</li>}
          {classroomsGuidance && <li>• {classroomsGuidance}</li>}
          {monthlyEnrollmentGuidance && <li>• {monthlyEnrollmentGuidance}</li>}
        </ul>
      )}
    </div>
  );
}
