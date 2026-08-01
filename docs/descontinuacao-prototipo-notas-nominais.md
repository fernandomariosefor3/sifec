# Descontinuação — protótipo nominal de notas (`student_rosters` / `student_bimester_grades`)

## O que mudou e por quê

A Fase 2C original implementou "Notas Bimestrais" como um cadastro nominal de
estudantes por turma (`student_rosters`) com lançamento de nota individual
por bimestre (`student_bimester_grades`) — um mini-diário escolar dentro do
SIFEC. Essa leitura do requisito estava conceitualmente errada: o SIFEC não é
o SIGE Escola, não deve manter relação nominal de estudantes, e não deve
lançar nota individual — quem faz isso é a própria escola, no SIGE Escola.

A Fase 2C.1 corrige o escopo: "Notas Bimestrais" passa a ser o
**monitoramento agregado do preenchimento de notas que a escola já faz no
SIGE Escola**, por escola+turma+ano letivo+bimestre — nunca por estudante.
A nova coleção é `grade_entry_monitoring` (ver
`src/types/gradeEntryMonitoring.ts`); a interface é
`src/components/NotasView.tsx` reescrita, com
`src/components/notas/GradeEntryMonitoringTable.tsx` e
`GradeEntryMonitoringFormModal.tsx`.

## Situação das coleções nominais do protótipo

`student_rosters` e `student_bimester_grades` são consideradas **protótipo
nominal descontinuado** para esta funcionalidade a partir desta correção.

- **Nenhum documento existente foi excluído ou migrado.** Qualquer dado
  gravado nessas coleções antes desta correção continua exatamente como
  estava no Firestore.
- **A aplicação não lê nem grava mais nessas coleções.** Nem `NotasView.tsx`
  nem a Sala de Situação (`schoolSituationService.ts`) consultam
  `student_rosters`/`student_bimester_grades` a partir desta correção — a
  Sala de Situação passou a consultar `grade_entry_monitoring` (ver seção 14
  do plano da Fase 2C.1).
- **Os arquivos de serviço permanecem no repositório**
  (`src/lib/studentRosterService.ts`, `src/lib/studentBimesterGradeService.ts`,
  `src/lib/studentGradeCalculations.ts`) e continuam cobertos pelos próprios
  testes unitários — não foram apagados porque descrevem um contrato de
  dados que ainda pode existir em produção (documentos legados) e podem
  servir de referência para uma eventual ferramenta administrativa de
  auditoria. Nenhum componente de produto os importa mais.

## Regras do Firestore

`firestore.rules` foi atualizado para as duas coleções:

- **Leitura:** só `isPlatformAdmin()` (administrador raiz), para fins de
  auditoria — mesmo padrão já aplicado à coleção `grades` (legado anterior,
  ver `docs/plano-migracao-grades-legado.md`).
- **Criação:** bloqueada (`allow create: if false`).
- **Atualização:** bloqueada (`allow update: if false`).
- **Exclusão:** bloqueada pela aplicação (`allow delete: if false`) — nenhum
  caminho de exclusão em massa foi aberto por esta correção; uma eventual
  limpeza de dados legados fica fora deste escopo e exigiria uma decisão e
  execução administrativa separadas, fora do aplicativo.

Nenhum documento é afetado por essa mudança de regra — ela só impede
**novas** leituras/escritas pela aplicação a partir de agora; documentos já
gravados continuam existindo no Firestore, acessíveis via console/Admin SDK
por quem tiver permissão de administrador da infraestrutura.

## Para quem for revisar esta correção

- `grade_entry_monitoring` nunca contém nome de estudante, matrícula, CPF,
  nota individual, média individual ou observação nominal — só totais
  agregados por turma (ver `src/types/gradeEntryMonitoring.ts`).
- Se um documento antigo em `student_rosters`/`student_bimester_grades`
  precisar ser consultado (ex.: auditoria, investigação de um incidente),
  isso deve ser feito com uma conta de administrador raiz, diretamente pelo
  console do Firebase ou por uma ferramenta administrativa própria — nunca
  reabrindo a leitura desses dados pela aplicação do SIFEC.
