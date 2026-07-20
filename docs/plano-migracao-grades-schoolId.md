# Plano de migração — `schoolId` na coleção `grades`

Documento de planejamento apenas. **Nada aqui foi implementado.** Não altera
`NotasView.tsx`, `firebaseService.ts`, dados de produção nem o formato atual
da coleção `grades`.

## 1. Inventário do schema atual (investigação, sem alterar nada)

**Fontes usadas:** `src/types.ts`, `src/lib/firebaseService.ts`,
`src/components/NotasView.tsx`, `src/components/ExtraViews.tsx`,
`firebase-blueprint.json`, `firestore.rules`, e apenas os **nomes de campo**
(nunca conteúdo) de um export de backup local (`grades.json`, 6 registros,
fora deste clone).

1. **Campos de cada documento de `grade`:**
   `id, nome, turma, portugues, matematica, ciencias, bimestre` — confirmado
   idêntico entre a interface TypeScript (`StudentGrade` em `NotasView.tsx`),
   o seed (`SEED_GRADES` em `firebaseService.ts`), o schema declarado em
   `firebase-blueprint.json` e os nomes de campo reais encontrados no export
   de backup. Nenhum campo de vínculo com escola em lugar nenhum.
2. **Campo que identifica a turma:** `turma`, uma *string de exibição* como
   `"3º Ano A - Matutino"` — é o nome, não um ID.
3. **Existe ID de turma?** Não no documento de `grade`. A coleção `turmas`
   tem um `id` de documento próprio (ex.: `turma-3a-diva`), mas `grades` não
   guarda esse `id`, só o nome de exibição da turma.
4. **Existe `schoolId`, `escolaId`, `codigoInep` ou outro vínculo inequívoco
   em `grades`?** Não. Zero campos de escola no documento.
5. **O nome da turma pode se repetir em escolas diferentes?** Sim — nos
   dados de exemplo (`SEED_TURMAS`), `"3º Ano A - Matutino"` aparece em pelo
   menos três escolas diferentes (Diva Cabral, Figueiredo Correia, José
   Leopoldino da Silva). Um lookup por nome não é uma chave confiável.
6. **Onde o documento é criado:** `NotasView.tsx`,
   `handleAddStudentGrade()` → `addDocument('grades', newId, freshRecord)`
   (`src/components/NotasView.tsx:361`, via `src/lib/firebaseService.ts`).
7. **Onde é atualizado:** `NotasView.tsx`, `handleSaveGrades()` →
   `updateDocument('grades', selectedStudent.id, {...})`
   (`src/components/NotasView.tsx:220`) — atualiza só notas
   (`portugues`/`matematica`/`ciencias`), nunca `turma`/`nome`.
8. **Onde é excluído:** `NotasView.tsx`, `handleDeleteGrade()` →
   `deleteDocument('grades', studentId)` (`src/components/NotasView.tsx:389`).
9. **Quais consultas são realizadas:** só `onSnapshot` na coleção inteira
   (`subscribeToCollection('grades', ...)`, sem `where()`/paginação) — em
   três lugares: `NotasView.tsx:137`, `ExtraViews.tsx:429` (Busca Ativa) e
   `ExtraViews.tsx:1723` (Recomposição). Todo filtro por escola/turma/aluno
   acontece **no cliente**, depois de baixar a coleção inteira.
10. **Componentes afetados por incluir `schoolId`:**
    - `src/components/NotasView.tsx` — criação (precisa capturar a escola da
      turma escolhida), listagem/filtro (`matchedClass` por nome hoje),
      `canEdit`/`hasSchoolWriteAccess` (hoje resolvido via nome de turma).
    - `src/components/ExtraViews.tsx` — **duas lógicas diferentes e
      inconsistentes** de associar nota↔escola já existem aqui: em vez do
      lookup por nome de turma que `NotasView.tsx` usa, este arquivo faz
      correspondência por **substring hardcoded do nome da turma**
      (`g.turma.includes('Diva')` para "EEM Diva Cabral",
      `g.turma.includes('Figueiredo')` para "EEM Figueiredo Correia" etc. —
      linhas 616-617 e 1837+), usada tanto em Busca Ativa quanto em
      Recomposição. Qualquer migração real precisa unificar essas duas
      abordagens.
    - `src/lib/firebaseService.ts` — sem mudança de lógica, só o shape do
      `SEED_GRADES`.
    - `firestore.rules` / `firestore.rules.proposed` — passariam a poder
      usar `canWriteEscola(incoming().schoolId)` em vez de liberar `grades`
      pra qualquer superintendente autorizado.

## 2. Plano de migração proposto (não implementado)

1. **Inclusão aditiva de `schoolId`** — novo campo opcional em `grades`,
   preenchido só a partir de agora para novos registros; nenhum documento
   existente muda de formato até a etapa 2.
2. **Preenchimento dos registros existentes** — script batch (mesmo padrão
   de `scripts/migrate-ativo-field.mjs`: Admin SDK, sem credencial no
   código, dry-run padrão, trava se `projectId != sifec-sefor3`) que:
   - para cada `grade`, resolve `turma` → documento de `turmas` por
     **`turmaId` quando existir**, senão por nome — e SÓ aplica quando o
     nome for único entre as turmas carregadas (senão marca como
     "ambíguo, requer revisão manual" e não grava);
   - grava `schoolId` (o `id` do documento de `schools`) e `escolaNome`
     (para leitura humana), nunca infere silenciosamente em caso de
     ambiguidade.
3. **Compatibilidade temporária** — durante a transição, `NotasView.tsx` e
   `ExtraViews.tsx` devem tratar `schoolId` como **opcional**: se presente,
   usar direto; se ausente, cair no comportamento atual (lookup por nome /
   substring) como fallback, até a cobertura de preenchimento chegar a
   100%.
4. **Atualização da aba Lançamento de Notas** — `handleAddStudentGrade()`
   passa a gravar `schoolId` a partir da turma escolhida no formulário (a
   turma selecionada já carrega `escolaId`/`escolaNome`, só precisa
   propagar esse valor pro novo `grade`).
5. **Atualização das consultas** — sem mudar o padrão geral
   (`onSnapshot`/filtro client-side), mas os filtros por escola em
   `NotasView.tsx` e `ExtraViews.tsx` passam a comparar `g.schoolId` em vez
   de `matchedClass.escolaNome`/substring hardcoded — elimina a ambiguidade
   e unifica as duas lógicas divergentes.
6. **Atualização das regras** — `firestore.rules.proposed` troca a seção
   `grades` de "qualquer superintendente autorizado" para
   `canWriteEscola(incoming().schoolId)`, replicando o padrão já usado em
   `schools`/`turmas`/`visitas`.
7. **Rollback** — como a mudança é aditiva (`schoolId` opcional) até a
   etapa 6, reverter é simples: não aplicar a etapa 6 (regras) e/ou
   reverter os componentes para o fallback por nome — os documentos com
   `schoolId` preenchido continuam válidos, só passam a ser ignorados pela
   lógica antiga.
8. **Testes** — regras: `assertFails`/`assertSucceeds` cobrindo escrita de
   `grades` com `schoolId` de uma escola não vinculada ao superintendente;
   migração: teste do script contra o emulador com dados sintéticos
   (turmas com nomes ambíguos e não ambíguos) confirmando que só os
   inequívocos são migrados.
9. **Validação de quantidades antes e depois** — o script de migração deve
   logar: total de `grades` processados, quantos já tinham `schoolId`,
   quantos foram resolvidos automaticamente, quantos ficaram "ambíguos —
   requer revisão manual" (não gravados). Comparar a soma
   (resolvidos + ambíguos + já tinham) com o total antes de aplicar
   qualquer coisa — se não bater, abortar.

Nenhuma dessas etapas foi executada. Este plano depende de autorização
explícita para uma fase futura.

## 3. Decisão temporária da Fase 0

- **Opção escolhida:** C — `grades` permanece com leitura e escrita
  liberadas para qualquer superintendente cadastrado e ativo (`isAuthorized()`
  em `firestore.rules.proposed`), sem isolamento por escola.
- **Motivo:** não interromper o fluxo de lançamento de notas em
  `NotasView.tsx` nesta fase — nenhuma tela foi alterada.
- **Risco aceito temporariamente:** um superintendente ativo pode ler e
  editar notas de escolas fora da sua responsabilidade, não só da(s)
  escola(s) atribuída(s) a ele.
- **Condição para remover o risco:** aplicar as etapas 1-6 deste plano
  (inclusão e migração de `schoolId`, depois trocar `isAuthorized()` por
  `canWriteEscola(incoming().schoolId)` em `grades`).
- **Prioridade da migração:** alta.
- **Nenhuma alteração foi feita no schema ou no frontend nesta fase** — só
  em `firestore.rules.proposed` (ainda não publicado) e neste documento.
