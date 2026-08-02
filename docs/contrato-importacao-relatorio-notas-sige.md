# Contrato — importação assistida do relatório de notas do SIGE Escola

Documento de contrato apenas. **Nada aqui foi implementado.** Não existe
parser real do relatório do SIGE Escola nesta correção, e nenhum formato de
arquivo é presumido — este contrato só define o comportamento que uma
futura importação assistida terá que respeitar, para a arquitetura de
`grade_entry_monitoring` (Fase 2C.1) já nascer preparada para ela sem
precisar de nenhuma mudança de schema ou de regra de segurança.

## Por que não implementar o parser agora

Não há, neste momento, um relatório real do SIGE Escola disponível para
inspecionar formato, colunas, encoding ou variações entre unidades. Inventar
um formato de arquivo sem essa referência produziria um parser que quebra no
primeiro relatório real — pior do que não ter parser nenhum. Por isso esta
fase entrega só o **registro manual dos totais agregados** (o usuário lê o
relatório do SIGE e transcreve os totais no formulário de
`GradeEntryMonitoringFormModal`), com a coleção e o serviço já modelados do
jeito que uma importação futura vai preencher.

## Fluxo da importação assistida (quando um relatório de exemplo existir)

1. **Entrada por relatório do SIGE Escola.** O usuário faz upload do arquivo
   exportado pelo SIGE Escola (formato a definir quando houver um exemplo
   real — pode ser planilha, PDF tabular ou exportação própria do sistema).
2. **Preview antes de salvar.** O parser lê o arquivo e monta uma prévia dos
   documentos de `grade_entry_monitoring` que seriam criados/atualizados —
   igual ao padrão já usado por `ImportRecord` (`src/types/import.ts`), que
   nasce sempre em `'analisando'` ou `'aguardando_confirmacao'`, nunca direto
   em `'processado'`.
3. **Correspondência de escola pelo INEP.** A escola de cada linha do
   relatório é resolvida pelo código INEP (`codInep`), nunca só pelo nome —
   mesmo cuidado já aplicado em `isCanonicalCodInepForSchool`
   (`firestore.rules`) e em `schoolIdentity.ts`.
4. **Correspondência de turma por ID/ano/nome normalizado.** A turma de cada
   linha é resolvida, nesta ordem: (a) um ID de turma explícito no relatório,
   se o SIGE exportar um; (b) ano letivo + nome normalizado da turma dentro
   da escola já resolvida (mesma cascata de `getClassroomsForSchoolYear` em
   `classService.ts`). Uma linha sem correspondência confiável entra na
   prévia como pendência — nunca cria uma turma nova automaticamente.
5. **Confirmação humana.** Nenhuma escrita em `grade_entry_monitoring`
   acontece sem o usuário revisar a prévia e confirmar explicitamente — o
   mesmo princípio que já rege qualquer outra importação nesta base (seção
   "Objetivo" de `types/import.ts`).
6. **Nenhuma escrita automática sem confirmação.** Mesmo um relatório
   idêntico ao de uma importação anterior (reenvio) exige nova confirmação
   antes de sobrescrever os documentos existentes.
7. **Nenhum armazenamento de credenciais.** Uma eventual integração direta
   com o SIGE Escola (em vez de upload manual de arquivo) nunca guardaria
   login/senha do SIGE nesta base — ficaria fora do escopo desta
   funcionalidade, tratada como uma integração externa própria, com seu
   próprio mecanismo de autenticação gerenciado fora do Firestore.
8. **Nenhum dado nominal na coleção agregada.** Qualquer nome de estudante,
   matrícula individual ou nota individual eventualmente presente no arquivo
   de origem nunca chega a `grade_entry_monitoring` — o parser só extrai os
   totais agregados por turma (`totalStudents`,
   `studentsWithCompleteGrades`, `studentsWithPartialGrades`,
   `studentsWithoutGrades`, `expectedGradeEntries`,
   `completedGradeEntries`) e descarta o restante da linha antes de montar a
   prévia.

## O que já está preparado para isso

- `GradeEntryMonitoring.sourceSystem/sourceReportTitle/sourceFileName/sourceFileHash`
  (`src/types/gradeEntryMonitoring.ts`) — mesmos campos de origem já usados
  por `SchoolFlowResult`/`Turma`/`EnrollmentSnapshot`, prontos para uma
  importação preencher sem precisar de migração de schema.
- `saveGradeEntryMonitoring` (`src/lib/gradeEntryMonitoringService.ts`) já
  aceita esses campos e preserva os metadados de origem existentes quando uma
  chamada não os reenvia — o mesmo caminho de escrita do formulário manual
  serve para a importação, sem precisar de uma função separada.
- `firestore.rules` (bloco `grade_entry_monitoring`) já valida escola/turma
  canônica e shape estrito independentemente de quem grava (usuário manual
  ou uma futura rotina de importação autenticada como o mesmo usuário) —
  nenhuma regra nova seria necessária só para a importação.

## O que falta, explicitamente fora desta correção

- Um relatório real do SIGE Escola para inspecionar o formato de arquivo.
- O parser em si (leitura do arquivo, extração de colunas, normalização).
- A tela de preview/confirmação da importação.
- Qualquer decisão sobre integração direta com o SIGE Escola (em vez de
  upload manual) — não avaliada nesta correção.
