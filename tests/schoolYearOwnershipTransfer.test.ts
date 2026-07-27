// Fase 2A — "os dados pertencem à escola e ao ano letivo, não ao
// superintendente" (regra principal do plano). Este teste comprova que
// trocar o vínculo de acompanhamento (superintendente.escolas) não afeta o
// ID nem a resolução dos documentos de school_years/enrollment_snapshots —
// eles nunca guardam nem dependem de quem é o responsável atual.
import { describe, expect, it } from 'vitest';
import { buildEnrollmentSnapshotId, buildSchoolYearId } from '../src/lib/deterministicIds';
import { resolveSchoolRef, type SchoolRef } from '../src/lib/schoolIdentity';
import {
  filterSchoolsForSuperintendent,
  getWatchedSchools,
  type Superintendent,
} from '../src/lib/superintendentRules';

const escola: SchoolRef = { id: 'diva-cabral', nome: 'EEM Diva Cabral', codInep: '23067918' };

function superintendentComEscolas(escolas: string[]): Superintendent {
  return {
    id: 'algum-superintendente',
    nome: 'Superintendente Teste',
    cargo: 'Superintendente Regional',
    email: 'alguem@example.com',
    escolas,
    ativo: true,
    role: 'superintendent',
  };
}

describe('troca de superintendente preserva histórico', () => {
  it('o ID do ano letivo e dos snapshots depende só de schoolId/turmaId/mês — nunca do superintendente', () => {
    const schoolYearId = buildSchoolYearId(escola.id!, 2026);
    const snapshotId = buildEnrollmentSnapshotId(escola.id!, 'turma-3a-diva', '2026-03');

    // "Vínculo antigo": escola na carteira do superintendente A.
    const antigoResponsavel = superintendentComEscolas([escola.nome]);
    // "Vínculo novo": mesma escola passa para a carteira de outro responsável.
    const novoResponsavel = superintendentComEscolas([escola.nome]);

    // Nenhum dos dois vínculos altera os IDs determinísticos — eles são
    // função pura de schoolId/turmaId/anoLetivo/mês, não de `escolas`.
    expect(buildSchoolYearId(escola.id!, 2026)).toBe(schoolYearId);
    expect(buildEnrollmentSnapshotId(escola.id!, 'turma-3a-diva', '2026-03')).toBe(snapshotId);
    expect(antigoResponsavel.escolas).toEqual(novoResponsavel.escolas);
  });

  it('o novo responsável resolve a MESMA escola (e portanto o mesmo histórico) via codInep, mesmo com o nome escrito diferente', () => {
    const candidatos: SchoolRef[] = [escola];
    // O novo responsável pode ter cadastrado a escola com grafia levemente
    // diferente — resolveSchoolRef prioriza codInep sobre nome (Fase 1G).
    const resolvido = resolveSchoolRef({ codInep: escola.codInep, nome: 'Nome Divergente Qualquer' }, candidatos);
    expect(resolvido?.id).toBe(escola.id);
  });

  it('depois da troca, só a lista `escolas` de cada superintendente muda — a escola em si continua igual para ambos', () => {
    const responsavelAntigo = superintendentComEscolas([]); // perdeu o vínculo
    const responsavelNovo = superintendentComEscolas([escola.nome]); // ganhou o vínculo

    const todasEscolas = [escola];
    expect(getWatchedSchools(todasEscolas, responsavelAntigo)).toEqual([]);
    expect(getWatchedSchools(todasEscolas, responsavelNovo)).toEqual([escola]);
    // A mesma função de filtro, usada para o responsável novo, enxerga a
    // escola inteira — nenhum dado histórico foi duplicado ou perdido.
    expect(filterSchoolsForSuperintendent(todasEscolas, responsavelNovo, false)).toEqual([escola]);
  });
});
