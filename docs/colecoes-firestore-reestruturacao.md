# Coleções Firestore da Reestruturação do SIFEC

## Por que sete coleções, não seis

O plano original de reestruturação previa **seis** coleções novas. Durante a auditoria de
conformidade, o requisito central de "Acompanhamento de Notas" — modelo por **turma + disciplina**,
não apenas total geral por turma — não estava implementado; a implementação anterior restringia
disciplina a quatro áreas fixas herdadas do protótipo nominal descontinuado. A correção exigiu uma
**sétima coleção aditiva**, `grade_entry_monitoring_disciplina`, separada de `grade_entry_monitoring`
(que permanece intocada, servindo o total por turma e o fluxo de registro do SIGE do PR #18).

Nenhuma coleção adicional além destas sete foi criada.

## Lista das sete coleções

1. `bimonthly_enrollments`
2. `farol_estudante`
3. `recomposicao_planos`
4. `cdg_planos`
5. `cdg_tarefas`
6. `parecer_bimestral_notas`
7. `grade_entry_monitoring_disciplina`

---

## 1. `bimonthly_enrollments`

- **Finalidade**: matrícula por escola e por bimestre (1º ao 4º) — substitui o registro mensal por
  turma (`enrollment_snapshots`, preservado como legado, nunca lido por este módulo)
- **ID**: `${schoolId}_${anoLetivo}_b${bimestre}` — determinístico (`buildBimonthlyEnrollmentId`)
- **Campos**: `id, schoolId, codInep, escolaNome, anoLetivo, bimestre, matricula, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais ou agregados**: agregado — nenhum dado nominal
- **Chave escola/ano/bimestre**: `schoolId` + `anoLetivo` + `bimestre` (todos no próprio ID)
- **Leitura**: `canWriteSchoolById` (só quem tem acesso de escrita àquela escola, ou admin)
- **Criação**: superintendente com acesso à escola; `isCanonicalSchoolMatch` (schoolId/codInep/escolaNome precisam bater com o cadastro real)
- **Atualização**: mesmo superintendente; identidade (schoolId/codInep/escolaNome/anoLetivo/bimestre/createdAt/createdBy) travada
- **Exclusão**: **só admin raiz** (`isPlatformAdmin()`) — histórico auditável, não lista de trabalho
- **Auditoria**: nenhum `audit_log` dedicado nesta coleção (mesma decisão de design do restante do módulo de matrícula bimestral — a própria coleção já é o histórico, um documento por bimestre nunca sobrescreve outro)
- **Índices necessários**: nenhum composto — consultas usam só filtros de igualdade (`schoolId`, `anoLetivo`), resolvidos por índices automáticos de campo único
- **Preservação**: nunca sobrescreve nem apaga `enrollment_snapshots`; documentos de bimestres anteriores nunca são alterados por uma gravação de bimestre novo

## 2. `farol_estudante`

- **Finalidade**: "Alunos com Baixo Desempenho (Farol do Estudante)" — listagem NOMINAL, por turma
  e disciplina, de estudantes com percentual de acerto < 25% no SISEDU Analytics (transcrito
  manualmente, nunca sincronização automática)
- **ID**: opaco (`crypto.randomUUID()` no cliente) — nunca derivado do nome do estudante
- **Campos**: `id, schoolId, codInep, escolaNome, turmaId, turmaNome, disciplina, anoLetivo, bimestre, estudanteNome, percentualAcerto, sourceSystem, referenceDate, status, statusRegistro, observacao?, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais**: **SIM — `estudanteNome` é dado nominal**. Único caso desta reestruturação com
  nome de estudante armazenado, autorizado explicitamente pelo plano com proteções específicas
  (ver seção de segurança abaixo)
- **Chave escola/ano/bimestre**: `schoolId`/`anoLetivo`/`bimestre` como campos (ID é opaco)
- **Leitura**: `canWriteSchoolById` — só o superintendente autorizado daquela escola específica (ou admin), consultas sempre filtradas por `schoolId` + `anoLetivo`
- **Criação**: superintendente com acesso à escola; `isCanonicalSchoolMatch` + `isCanonicalTurmaOfSchoolYearAndName` (a turma referenciada precisa existir de fato); `sourceSystem` travado em `'SISEDU Analytics'`; `statusRegistro` restrito a `['ativo', 'arquivado']`
- **Atualização**: mesmo superintendente; identidade (schoolId/codInep/escolaNome/turmaId/anoLetivo/bimestre/createdAt/createdBy) travada; cobre tanto edição normal quanto arquivamento (`statusRegistro: 'ativo' → 'arquivado'`)
- **Exclusão**: **correção final da auditoria — só admin raiz** (`isPlatformAdmin()`), nunca o superintendente comum, nem o da própria escola. Antes desta correção, a regra permitia exclusão física por qualquer superintendente com acesso à escola — contrariava o requisito "exclusão bloqueada para usuário comum". O caminho normal para "remover da lista" passou a ser **arquivar** (update de `statusRegistro`), não excluir
- **Auditoria**: correção do code review do PR #19 — `saveFarolEstudanteItem` (create/update) e `archiveFarolEstudanteItem` (archive) gravam TODOS um `audit_log` no mesmo `WriteBatch` do documento principal (atômico — falha no log impede a escrita do registro). `previousValue`/`newValue` contêm só o resumo sanitizado `{ itemId, schoolId, turmaId, disciplina, anoLetivo, bimestre, status, statusRegistro }` — **nunca `estudanteNome`, `percentualAcerto` ou `observacao`** (reforçado estruturalmente por `assertNoSensitiveKeys` em `auditService.ts`, que bloqueia qualquer payload contendo a chave `estudantenome`). Ver inventário completo de auditoria por serviço abaixo
- **Índices necessários**: nenhum composto — filtros de igualdade (`schoolId`, `anoLetivo`)
- **Preservação**: arquivamento nunca apaga o documento; a interface nunca mostra registros arquivados por padrão (exige filtro explícito "Mostrar arquivados")

## 3. `recomposicao_planos`

- **Finalidade**: plano de recomposição de aprendizagens da própria escola — formulário livre (prazo, área/disciplina, turno, descrição), nunca lista nominal de estudantes
- **ID**: opaco (`crypto.randomUUID()`)
- **Campos**: `id, schoolId, codInep, escolaNome, anoLetivo, bimestre, prazo, areaDisciplina, turno, descricao, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais ou agregados**: nenhum dado pessoal — texto livre institucional
- **Chave escola/ano/bimestre**: campos, não parte do ID
- **Leitura**: `canWriteSchoolById`
- **Criação**: superintendente com acesso à escola; `turno` restrito ao enum `['Matutino', 'Vespertino', 'Noturno', 'Integral']`
- **Atualização**: mesmo superintendente; identidade travada; autoria original (`createdAt`/`createdBy`) sempre preservada
- **Exclusão**: superintendente da própria escola (lista de trabalho comum, não histórico auditável imutável — não é dado nominal)
- **Auditoria**: nenhum `audit_log` dedicado
- **Índices necessários**: nenhum composto
- **Preservação**: nenhuma migração automática de planos antigos

## 4. `cdg_planos`

- **Finalidade**: Ciclo de Gestão simplificado — um plano por escola+ano letivo (situação Ativo/Inativo + status de execução)
- **ID**: `${schoolId}_${anoLetivo}` — determinístico
- **Campos**: `id, schoolId, codInep, escolaNome, anoLetivo, situacao, statusExecucao, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais ou agregados**: nenhum dado pessoal
- **Chave escola/ano**: no próprio ID
- **Leitura**: `canWriteSchoolById`
- **Criação/Atualização**: superintendente com acesso à escola; `situacao` restrita a `['Ativo', 'Inativo']`; `statusExecucao` restrito a `['Não iniciado', 'Em execução', 'Concluído']`
- **Exclusão**: **só admin raiz** — histórico auditável
- **Auditoria**: nenhum `audit_log` dedicado
- **Índices necessários**: nenhum composto
- **Preservação**: nenhuma migração de planos antigos do Ciclo de Gestão anterior à simplificação

## 5. `cdg_tarefas`

- **Finalidade**: ações/tarefas do plano do Ciclo de Gestão, cada uma com seu próprio status e prazo
- **ID**: opaco (`crypto.randomUUID()`)
- **Campos**: `id, schoolId, codInep, escolaNome, anoLetivo, acao, responsavel, prazo, status, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais ou agregados**: `responsavel` é texto livre institucional (nome de cargo/pessoa responsável pela tarefa) — não é tratado como dado nominal sensível no mesmo sentido de `estudanteNome` (é informação de gestão administrativa, não de um menor de idade em situação de vulnerabilidade pedagógica)
- **Chave escola/ano**: campos, não parte do ID
- **Leitura**: `canWriteSchoolById`
- **Criação/Atualização**: superintendente com acesso à escola; `status` restrito a `['Não Iniciado', 'Previsto', 'Em Andamento', 'Concluído', 'Concluído com Atraso', 'Atrasado']`; `prazo` no formato `AAAA-MM-DD`
- **Exclusão**: superintendente da própria escola (lista de trabalho)
- **Auditoria**: nenhum `audit_log` dedicado
- **Índices necessários**: nenhum composto
- **Preservação**: nenhuma migração de tarefas antigas

## 6. `parecer_bimestral_notas`

- **Finalidade**: único dado que o módulo Parecer Bimestral efetivamente GRAVA — conclusão e
  encaminhamentos da superintendência, por escola+ano+bimestre. Os outros 8 cards são só LEITURA de
  coleções já existentes, nunca duplicados aqui
- **ID**: `${schoolId}_${anoLetivo}_b${bimestre}` — determinístico
- **Campos**: `id, schoolId, codInep, escolaNome, anoLetivo, bimestre, encaminhamentos, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais ou agregados**: nenhum dado pessoal — texto livre institucional (máx. 4000 caracteres)
- **Chave escola/ano/bimestre**: no próprio ID
- **Leitura**: `canWriteSchoolById` — outra escola nunca lê os encaminhamentos de uma escola diferente
- **Criação/Atualização**: superintendente com acesso à escola; identidade travada
- **Exclusão**: **só admin raiz** — histórico auditável
- **Auditoria**: nenhum `audit_log` dedicado
- **Índices necessários**: nenhum composto
- **Preservação**: nunca duplica indicadores das outras 6 coleções/`grade_entry_monitoring`/`turmas` — sempre consolidados em tempo real na leitura

## 7. `grade_entry_monitoring_disciplina`

- **Finalidade**: requisito central do Acompanhamento de Notas — acompanhamento do preenchimento
  de notas por **turma + disciplina** (nunca só total geral por turma). Coleção nova e aditiva,
  separada de `grade_entry_monitoring` (que continua servindo o total por turma e o fluxo de
  registro do SIGE do PR #18, intocada)
- **ID**: `${schoolId}_${anoLetivo}_b${bimestre}_${turmaId}_${disciplinaId}` — determinístico,
  `disciplinaId` é a chave normalizada e segura derivada de `disciplinaNome` (`normalizeDisciplinaId`:
  NFD + remoção de diacríticos + minúsculas + não-alfanumérico vira hífen — mesmo algoritmo já usado
  para gerar ID de escola em `EscolasView.tsx`)
- **Campos**: `id, schoolId, codInep, escolaNome, turmaId, turmaNome, anoLetivo, bimestre, disciplinaId, disciplinaNome, areaConhecimento?, expectedGradeEntries, completedGradeEntries, status, referenceDate, createdAt, updatedAt, createdBy, updatedBy`
- **Dados pessoais ou agregados**: agregado — só lançamentos esperados/realizados por turma e
  disciplina, nunca nome de estudante nem nota individual
- **Chave escola/ano/bimestre/turma/disciplina**: `schoolId`/`anoLetivo`/`bimestre`/`turmaId`/`disciplinaId` todos no próprio ID
- **Leitura**: `canWriteSchoolById`
- **Criação**: superintendente com acesso à escola; `isCanonicalSchoolMatch` + `isCanonicalTurmaOfSchoolYearAndName`; `disciplinaId` validado por formato (`^[a-z0-9]+(-[a-z0-9]+)*$` — as regras do Firestore não replicam a normalização Unicode completa do cliente, mesmo tradeoff já aceito para IDs de escola); `disciplinaNome` obrigatório (1–100 caracteres); `areaConhecimento`, se presente, restrita ao enum `['Linguagens', 'Matemática', 'Ciências da Natureza', 'Ciências Humanas', 'Formação Técnica', 'Outra']`; `completedGradeEntries <= expectedGradeEntries`
- **Atualização**: mesmo superintendente; identidade (schoolId/codInep/escolaNome/turmaId/turmaNome/anoLetivo/bimestre/**disciplinaId**/**disciplinaNome**/createdAt/createdBy) travada — **exceto `areaConhecimento`**, que pode ser reclassificada livremente (é campo de organização, não de identidade)
- **Exclusão**: **só admin raiz** — mesmo histórico auditável imutável de `grade_entry_monitoring`
- **Auditoria**: nenhum `audit_log` dedicado (mesma decisão de `grade_entry_monitoring` — o próprio documento, com `createdAt`/`updatedAt`/`createdBy`/`updatedBy`, já registra a trilha básica)
- **Índices necessários**: nenhum composto — consultas usam só filtros de igualdade (`schoolId`, `anoLetivo`, `bimestre`)
- **Preservação**: nunca migra nem apaga `grade_entry_monitoring`; consolidação por área (`consolidateGradeEntryMonitoringDisciplineByArea`) é sempre recalculada em tempo real a partir das disciplinas registradas, nunca persistida como percentual redundante em nenhum documento

---

## Inventário de auditoria por serviço (code review do PR #19)

Levantamento explícito, coleção por coleção, de qual operação grava `audit_log` no serviço de
verdade (`src/lib/*Service.ts`), **não só** o que `firestore.rules` permite/bloqueia — uma regra de
segurança impede uma escrita indevida, mas não é, por si só, uma trilha de auditoria (não registra
quem fez o quê, nem estado anterior/novo). "Não auditado" aqui nunca significa "inseguro" — as sete
coleções continuam protegidas por `firestore.rules` (escopo de escola, imutabilidade de identidade,
formato de shape) independentemente de terem ou não `audit_log` dedicado.

| Coleção | Create auditado | Update auditado | Delete/Archive auditado | Justificativa |
|---|---|---|---|---|
| `farol_estudante` | **Sim** (`saveFarolEstudanteItem`, op. `create`) | **Sim** (`saveFarolEstudanteItem`, op. `update`) | **Sim** (`archiveFarolEstudanteItem`, op. `archive`) | Único dado NOMINAL desta reestruturação — todas as três operações auditadas atomicamente (documento + log no mesmo `WriteBatch`) desde a correção do PR #19. Exclusão física (`deleteFarolEstudanteItem`, só admin raiz) não é auditada — uso excepcional de manutenção, fora do fluxo normal de trabalho |
| `bimonthly_enrollments` | Não | Não | Não | Cada documento já é, por si só, o histórico imutável de um bimestre específico (`schoolId_ano_bBimestre`) — uma correção de matrícula sobrescreve o mesmo documento, mas `createdAt`/`createdBy`/`updatedAt`/`updatedBy` no próprio documento já registram quem criou e quem corrigiu por último. Dado agregado (só um número), nunca nominal |
| `recomposicao_planos` | Não | Não | Não | Formulário de texto livre institucional (prazo/área/turno/descrição), sem dado pessoal. Exclusão permitida ao superintendente da própria escola (lista de trabalho comum, não histórico imutável) — recomendação: se a exclusão de planos vier a alimentar indicadores do Parecer Bimestral de forma persistida (hoje não alimenta — é sempre lido em tempo real), reavaliar auditoria de delete nessa ocasião |
| `cdg_planos` | Não | Não | Não | Um plano por escola+ano (`schoolId_ano`), sempre corrigido no mesmo documento — `createdAt`/`createdBy`/`updatedAt`/`updatedBy` já registram a trilha básica. Exclusão restrita ao admin raiz |
| `cdg_tarefas` | Não | Não | Não | Lista de trabalho comum (ações/responsável/prazo/status), sem dado pessoal sensível — `responsavel` é cargo/pessoa da gestão administrativa, não estudante. Exclusão permitida ao superintendente da própria escola |
| `parecer_bimestral_notas` | Não | Não | Não | Texto livre institucional (conclusão/encaminhamentos), sem dado pessoal — os outros 8 cards do Parecer são só LEITURA agregada de outras coleções, nunca duplicados nem persistidos aqui. Exclusão restrita ao admin raiz |
| `grade_entry_monitoring_disciplina` | Não | Não | Não | Mesma decisão de design já aplicada a `grade_entry_monitoring` (coleção irmã, sem disciplina) — dado agregado (lançamentos esperados/realizados por turma+disciplina), nunca nominal. `createdAt`/`createdBy`/`updatedAt`/`updatedBy` no próprio documento já registram a trilha básica |

**Recomendação para trabalho futuro** (fora do escopo desta correção — nenhuma das seis coleções
abaixo teve sua documentação alterada para "auditado" sem implementação correspondente; a tabela
acima já refletia a ausência antes desta revisão): se qualquer uma das seis coleções sem
`audit_log` passar a alimentar um indicador **persistido** (hoje todos os indicadores dependentes
delas — Parecer Bimestral, ranking de risco — são recalculados em tempo real na leitura, nunca
gravados como valor derivado), adicionar `audit_log` no mesmo `WriteBatch` do documento principal,
mesmo padrão já usado por `farol_estudante`/`school_flow_results`.

---

## Nota sobre índices compostos em geral

Nenhuma das sete coleções precisa de um índice composto explícito hoje: todas as consultas do
código usam **apenas filtros de igualdade** (`schoolId`/`anoLetivo`/`bimestre`), que o Firestore
resolve via índices automáticos de campo único (merge join), sem exigir um índice composto
declarado. Não existe `firestore.indexes.json` neste repositório porque nenhuma consulta atual
precisa dele. Se uma consulta futura adicionar `orderBy` em um campo diferente dos filtros de
igualdade, ou combinar um filtro de igualdade com um de intervalo (`<`, `>`, `array-contains`) em
campos diferentes, um índice composto passará a ser necessário nesse momento — o próprio SDK do
Firebase mostra um link para criá-lo automaticamente na primeira execução da consulta que precisar.
