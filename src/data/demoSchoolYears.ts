// Fase 2A — dados agregados fictícios para o modo demonstração (seção 24 do
// plano: "adicionar somente dados agregados fictícios"). Usado SÓ quando não
// há usuário Firebase autenticado (ver EscolasView.tsx) — nunca gravado no
// Firestore, nunca passado a seedFirestoreDatabase(). Cobre apenas as sete
// escolas da carteira-piloto (mesmos IDs de SEED_SCHOOLS em firebaseService.ts).
import type { SchoolYear } from '../types/schoolYear';
import type { EnrollmentAccumulatedTotals } from '../lib/enrollmentCalculations';

export interface DemoSchoolYearEntry {
  schoolYear: SchoolYear;
  totals: EnrollmentAccumulatedTotals;
}

function demoYear(
  schoolId: string,
  codInep: string,
  escolaNome: string,
  matriculaInicial: number,
  matriculaAtual: number,
  quantidadeTurmasAtivas: number,
  entradasAcumuladas: number,
  saidasAcumuladas: number
): DemoSchoolYearEntry {
  return {
    schoolYear: {
      id: `${schoolId}_2026`,
      schoolId,
      codInep,
      escolaNome,
      anoLetivo: 2026,
      matriculaInicial,
      matriculaAtual,
      quantidadeTurmasAtivas,
      status: 'ativo',
      dataInicio: '2026-02-02',
      dataFim: null,
      ultimaAtualizacao: '2026-06-01T00:00:00.000Z',
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'demo@sefor3.ce.gov.br',
      updatedBy: 'demo@sefor3.ce.gov.br',
    },
    totals: { entradasAcumuladas, saidasAcumuladas },
  };
}

export const DEMO_SCHOOL_YEARS_2026: Record<string, DemoSchoolYearEntry> = {
  'diva-cabral': demoYear('diva-cabral', '23067918', 'EEM Diva Cabral', 800, 812, 24, 28, 16),
  'figueiredo-correia': demoYear('figueiredo-correia', '23070242', 'EEM Figueiredo Correia', 365, 372, 11, 14, 7),
  'jose-leopoldino': demoYear('jose-leopoldino', '23068914', 'EEM José Leopoldino da Silva', 520, 537, 16, 22, 5),
  'canindezinho': demoYear('canindezinho', '23233168', 'EEM São Francisco Canindezinho', 470, 464, 14, 10, 16),
  'anisio-teixeira': demoYear('anisio-teixeira', '23065214', 'EEMTI Anísio Teixeira', 260, 272, 8, 15, 3),
  'estado-amazonas': demoYear('estado-amazonas', '23069511', 'EEMTI Estado do Amazonas', 230, 237, 7, 9, 2),
  'osires-pontes': demoYear('osires-pontes', '23069163', 'EEMTI Senador Osires Pontes', 340, 351, 10, 13, 2),
};
