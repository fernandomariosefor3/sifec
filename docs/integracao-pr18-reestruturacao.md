# Integração futura: PR #18 (`feat/registro-relatorio-sige-notas`) × Reestruturação (`feat/reestruturacao-sifec`)

Este documento **não executa** nenhuma integração — é o inventário de preparação pedido pela
auditoria final de conformidade. Nenhuma branch remota foi alterada para produzi-lo; toda a
inspeção do código do PR #18 foi feita lendo `origin/feat/registro-relatorio-sige-notas` via
`git show`, sem checkout, sem merge.

## Ponto de divergência comum

```
git merge-base main feat/reestruturacao-sifec              → e1f8f8690540c850abe5734d4481a4a25f0f8e97
git merge-base main origin/feat/registro-relatorio-sige-notas → e1f8f8690540c850abe5734d4481a4a25f0f8e97
```

As duas branches divergem do **mesmo commit** de `main` — nenhuma das duas está desatualizada em
relação à outra.

## Seis arquivos sobrepostos

| Arquivo | Mudança do PR #18 | Conflito esperado |
|---|---|---|
| `package.json` | Lista diferente de arquivos em `test:unit`/`test:rules` | Trivial — merge de texto, nenhuma linha realmente colide |
| `src/App.tsx` | Troca "Lançamento de Notas" → "Acompanhamento de Notas" na linha 535 | **Zero** — a reestruturação já faz a mesma troca, no mesmo lugar, com o mesmo texto final |
| `src/components/ExtraViews.tsx` | Ajusta um texto interno de `BuscaAtivaView` | **Nenhum efeito** — a reestruturação apaga o arquivo inteiro (Busca Ativa virou Farol do Estudante); a exclusão vence no merge, a mudança de texto do PR #18 fica sem efeito, corretamente |
| `src/components/notas/GradeEntryMonitoringTable.tsx` | Encurta a mensagem de estado vazio (remove "cadastre a turma em Gestão de Escolas") | Trivial — 1 linha, resolução por inspeção |
| `src/components/NotasView.tsx` | Adiciona o botão "Registrar relatório do SIGE" + integração com `SigeReportModal` | **Estrutural, real** — ver seção "Reaplicação recomendada" abaixo |
| `tests/notasView.component.test.tsx` | Testes do botão/fluxo do SIGE | Acompanha o conflito de `NotasView.tsx` — merge de texto entre blocos `describe`, sem sobreposição de lógica |

## Nove arquivos exclusivos do PR #18 (entram limpos)

```
src/components/notas/SigeReportModal.tsx
src/components/notas/SigeReportRowEditor.tsx
src/lib/sigeReportMatching.ts
src/lib/sigeReportService.ts
tests/appNotasMenuLabel.component.test.tsx
tests/gradeEntryMonitoringComponents.component.test.tsx
tests/sigeReportMatching.test.ts
tests/sigeReportModal.component.test.tsx
tests/sigeReportService.test.ts
```

Nenhum destes toca `grade_entry_monitoring_disciplina`, `farol_estudante` ou qualquer coleção nova
desta reestruturação — dependem só de `grade_entry_monitoring` (por turma, sem disciplina) e
`turmas`, ambas preservadas intocadas.

## Funcionalidades do PR #18 que a reestruturação precisa preservar

- Botão "Registrar relatório do SIGE" (múltiplas turmas de uma vez, com preview antes de gravar)
- Confirmação humana explícita para criar turma nova (nunca automática)
- Correspondência de turma (`sigeReportMatching.ts`) — encontrada / possível correspondência / nova
- Proteção contra duplicidade dentro do próprio relatório (mesma turma duas vezes na mesma
  submissão)
- Nenhuma nota individual de estudante em nenhum momento do fluxo

Todas dependem só de `grade_entry_monitoring`/`turmas` — **nenhuma regride** com esta
reestruturação, confirmado por inspeção do código (nenhuma dessas coleções teve o schema alterado
por esta branch).

## Reaplicação recomendada em `NotasView.tsx`

O PR #18 adiciona, sobre a versão pré-reestruturação de `NotasView.tsx`:

- 1 import (`ClipboardPlus` de `lucide-react`, `SigeReportModal`)
- 1 estado (`showSigeReportModal`)
- 1 função (`handleRelatorioSaved`, que chama `refreshTurmas()`/`refreshMonitoring()`)
- 1 variável derivada (`showRegistrarRelatorioButton`, calculada a partir de `turmasStatus`/
  `monitoringStatus`/`selectedSchool`/`canWrite`)
- 2 botões condicionais ("Registrar relatório do SIGE") — um no cabeçalho, um no estado vazio
- 1 render condicional do `<SigeReportModal>`

Nenhum desses pontos depende de código que a reestruturação alterou (`turmasStatus`,
`monitoringStatus`, `canWrite`, `selectedSchool` continuam existindo sem mudança de contrato) — a
reaplicação deve ser uma cópia direta dos blocos acima para dentro da versão reestruturada de
`NotasView.tsx`, sem redesenho.

## Bloqueadores conhecidos do fluxo do PR #18 — verificados nesta auditoria contra o código real

A auditoria pediu para não declarar o PR #18 "pronto" sem confirmar estes cinco pontos. Cada um
foi **verificado lendo `origin/feat/registro-relatorio-sige-notas` diretamente** (não presumido):

| # | Ponto | Status verificado | Evidência |
|---|---|---|---|
| 1 | Lotes grandes podem exceder o limite de acessos das regras | **Ainda aberto (risco teórico, baixa probabilidade prática)** | `sigeReportService.ts` usa `writeBatch` sem nenhum chunking/limite explícito de linhas por relatório. O limite rígido do Firestore é 500 operações por `WriteBatch`; cada turma nova consome 2 (turma + audit_log), cada `grade_entry_monitoring` mais 2 — um relatório com mais de ~125 turmas novas excederia isso. Nenhuma escola da carteira real tem essa quantidade de turmas por bimestre, mas o código não tem nenhuma proteção/mensagem explícita para esse caso |
| 2 | `turmaId` precisa corresponder aos candidatos atuais da linha | **Resolvido** | `saveSigeReport` sempre busca `listClassroomsForSchool` de novo (nunca confia no snapshot que a UI tinha ao abrir o modal) antes de resolver/validar cada linha — item 7 do próprio code review interno do PR #18 |
| 3 | Matrícula atual deve ser obrigatória para turma nova | **Ainda aberto — confirmado como gap real** | `sigeReportService.ts`: `matriculaInicial: row.input.matriculaAtual ?? 0` — se o campo vier vazio para uma turma NOVA, o valor grava **0 silenciosamente**, nunca exige o preenchimento. `SigeReportModal.tsx` (linha 63) faz o mesmo: campo vazio vira `undefined`, nunca bloqueia o envio. Isso contraria o princípio já aplicado em todo o resto do projeto ("matrícula ausente ≠ matrícula zero", "nunca mostrar zero como se fosse confirmado") |
| 4 | Falha parcial precisa ser recuperável | **Resolvido** | `SigeReportPartialSaveError` (tipado, com `createdTurmas`) é lançado quando a fase 1 (turmas novas) já comitou mas a fase 2 (`grade_entry_monitoring`) falha — o chamador sabe exatamente quais turmas já existem e nunca as recria numa nova tentativa |
| 5 | Botão só pode abrir com turmas e acompanhamento carregados com sucesso | **Resolvido** | `NotasView.tsx` do PR #18: `const sourcesSafe = turmasStatus === 'success' && monitoringStatus === 'success'; const showRegistrarRelatorioButton = !!selectedSchool && canWrite && sourcesSafe;` — `loading`/`idle`/`failure` desabilitam o botão |

**Conclusão desta verificação**: o PR #18 **não deve ser declarado pronto para merge** sem resolver
os pontos 1 e 3 — nenhuma correção foi feita nesses arquivos por esta auditoria (estão numa branch
remota fora do escopo autorizado desta tarefa; nenhuma alteração foi enviada a
`origin/feat/registro-relatorio-sige-notas`). Ambos são responsabilidade de quem retomar o PR #18,
não desta reestruturação.

## Ordem recomendada de integração

1. Merge commit de `feat/reestruturacao-sifec` → `main` (ou branch de integração), nunca squash/rebase
2. Resolver o conflito estrutural de `NotasView.tsx` reaplicando os blocos do PR #18 listados acima
3. Resolver os pontos 1 e 3 da tabela de bloqueadores em `sigeReportService.ts`/`SigeReportModal.tsx`
   antes de considerar o fluxo do SIGE pronto para produção
4. Rodar a suíte completa (`tsc`, `test:unit`, `test:rules`, `build`) após a resolução do conflito

## Testes obrigatórios depois da integração

- Todos os testes existentes de `tests/sigeReport*.test.ts` continuam passando sem alteração de
  asserção (o fluxo do SIGE não muda de comportamento com a reestruturação)
- Novo teste: registrar relatório do SIGE para uma turma nova sem informar matrícula atual —
  deve **bloquear o envio**, nunca gravar 0 silenciosamente (cobre o ponto 3 acima, uma vez corrigido)
- Novo teste: relatório com mais turmas do que o limite seguro de um único `WriteBatch` — deve
  informar o usuário e/ou dividir em lotes, nunca falhar com um erro genérico do Firestore (cobre
  o ponto 1 acima, uma vez corrigido)
- Teste de fumaça manual: registrar relatório do SIGE com turma existente + turma nova na mesma
  submissão, confirmar que `grade_entry_monitoring` (por turma) e
  `grade_entry_monitoring_disciplina` (por turma+disciplina, desta reestruturação) continuam
  coexistindo sem conflito — são coleções independentes, nunca a mesma
