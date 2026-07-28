// Fase 2B — dados agregados fictícios de fluxo escolar (aprovados/
// reprovados/abandono) para o modo demonstração. Usado SÓ quando não há
// usuário Firebase autenticado (ver FluxoView.tsx) — nunca gravado no
// Firestore, nunca passado a seedFirestoreDatabase(). Cobre apenas o último
// ano letivo concluído (2025) das sete escolas da carteira-piloto (mesmos
// IDs de SEED_SCHOOLS em firebaseService.ts).
import type { SchoolFlowResult } from '../types/schoolFlow';

export const DEMO_SCHOOL_FLOW_ANO_LETIVO = 2025;

function demoFlow(
  schoolId: string,
  codInep: string,
  escolaNome: string,
  aprovados: number,
  reprovados: number,
  abandono: number
): SchoolFlowResult {
  return {
    id: `${schoolId}_${DEMO_SCHOOL_FLOW_ANO_LETIVO}`,
    schoolId,
    codInep,
    escolaNome,
    anoLetivo: DEMO_SCHOOL_FLOW_ANO_LETIVO,
    aprovados,
    reprovados,
    abandono,
    status: 'confirmado',
    createdAt: '2025-12-15T00:00:00.000Z',
    updatedAt: '2025-12-15T00:00:00.000Z',
    createdBy: 'demo@sefor3.ce.gov.br',
    updatedBy: 'demo@sefor3.ce.gov.br',
  };
}

export const DEMO_SCHOOL_FLOW_RESULTS: Record<string, SchoolFlowResult> = {
  'diva-cabral': demoFlow('diva-cabral', '23067918', 'EEM Diva Cabral', 712, 76, 12),
  'figueiredo-correia': demoFlow('figueiredo-correia', '23070242', 'EEM Figueiredo Correia', 340, 24, 4),
  'jose-leopoldino': demoFlow('jose-leopoldino', '23068914', 'EEM José Leopoldino da Silva', 470, 55, 8),
  'canindezinho': demoFlow('canindezinho', '23233168', 'EEM São Francisco Canindezinho', 400, 50, 10),
  'anisio-teixeira': demoFlow('anisio-teixeira', '23065214', 'EEMTI Anísio Teixeira', 240, 18, 3),
  'estado-amazonas': demoFlow('estado-amazonas', '23069511', 'EEMTI Estado do Amazonas', 210, 20, 2),
  'osires-pontes': demoFlow('osires-pontes', '23069163', 'EEMTI Senador Osires Pontes', 300, 32, 5),
};
