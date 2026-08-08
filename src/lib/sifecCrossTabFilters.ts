// Sincronização de filtros (escola/turma/bimestre) entre as abas Farol do
// Estudante e Recomposição — mesmo mecanismo já usado antes da reestruturação
// (localStorage + evento customizado), extraído para um módulo compartilhado
// porque as duas telas agora vivem em arquivos próprios.
export function dispatchFilterChange(escola: string, turma: string, bimestre: string): void {
  localStorage.setItem('sefor3_selected_escola', escola);
  localStorage.setItem('sefor3_selected_turma', turma);
  localStorage.setItem('sefor3_selected_bimestre', bimestre);
  window.dispatchEvent(new Event('sefor3_filter_change'));
}

export interface SharedFilters {
  escola: string;
  turma: string;
  bimestre: string;
}

export function getSharedFilters(): SharedFilters {
  return {
    escola: localStorage.getItem('sefor3_selected_escola') || 'EEM Diva Cabral',
    turma: localStorage.getItem('sefor3_selected_turma') || 'Todos',
    bimestre: localStorage.getItem('sefor3_selected_bimestre') || '1º Bimestre',
  };
}
