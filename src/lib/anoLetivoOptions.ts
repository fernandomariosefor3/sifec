// Fase 2C — revisão do PR #15: gerador puro das opções de ano letivo do
// seletor de NotasView. Antes, o módulo usava um ANO_LETIVO_ATUAL = 2026
// fixo no código-fonte, com o <select> desabilitado e uma única opção —
// nunca refletia o ano corrente de verdade nem permitia trocar de ano.
// currentYear é injetável (em vez de sempre ler `new Date()` internamente)
// para o gerador ser testável sem depender do relógio real da máquina.
export function buildAnoLetivoOptions(currentYear: number = new Date().getFullYear()): number[] {
  return [currentYear - 1, currentYear, currentYear + 1];
}
