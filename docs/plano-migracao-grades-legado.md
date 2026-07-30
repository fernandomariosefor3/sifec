# Plano de migração — `grades` legado → `student_rosters` / `student_bimester_grades`

Documento de planejamento apenas. **Nada aqui foi implementado ou
executado.** Não altera nenhum documento real da coleção `grades`, não
cadastra nenhum estudante, não grava nenhuma nota. A Fase 2C introduz um
modelo de dados novo e independente (`student_rosters` +
`student_bimester_grades`, ver `docs/fase-2c-inventario-notas-legadas.md`)
sem tocar em `grades` — este documento só descreve como uma migração
**futura e controlada** poderia, um dia, transportar os dados legados para
o modelo novo, se e quando for autorizada.

## 1. Por que não migrar automaticamente agora

- `grades` não tem `schoolId`, `turmaId` nem `anoLetivo` — só um nome de
  turma em texto livre (ver inventário, itens 1 e 5). Resolver isso exige
  cruzar cada `grade.turma` com a coleção `turmas` (Fase 2A) por nome
  normalizado, o que é ambíguo sempre que o nome se repete entre escolas
  (confirmado: `"3º Ano A - Matutino"` existe em pelo menos 3 escolas nos
  dados de exemplo). Uma migração automática correria o risco real de
  associar o boletim de um aluno à turma errada.
- O schema novo separa **cadastro do estudante** (`student_rosters`, um
  registro por aluno+turma+ano) de **nota por bimestre**
  (`student_bimester_grades`, um registro por aluno+turma+ano+bimestre) —
  `grades` mistura os dois num único documento por bimestre, sem conceito
  de "o mesmo aluno em bimestres diferentes" além do campo texto
  `bimestre`. Não há como saber, sem inspeção manual, se dois documentos de
  `grades` com o mesmo `nome`/`turma` mas `bimestre` diferente se referem
  à mesma pessoa ou a duas pessoas com nome parecido.
- `grades` guarda só três disciplinas (`portugues`, `matematica`,
  `ciencias`); o schema novo usa quatro (`linguaPortuguesa`, `matematica`,
  `cienciasNatureza`, `cienciasHumanas`) — não há correspondência 1:1
  automática para `ciencias` (poderia mapear para `cienciasNatureza`, mas
  isso é uma decisão pedagógica, não técnica, e fica para quem aprovar a
  migração).

## 2. Pré-condições para autorizar uma migração futura

1. Cobertura de `schoolId`/`turmaId` em `turmas` (Fase 2A) suficientemente
   completa para resolver a maioria das turmas citadas em `grades` sem
   ambiguidade.
2. Decisão pedagógica explícita sobre o mapeamento de disciplinas
   (`ciencias` → `cienciasNatureza`, ou exigir preenchimento manual de
   `cienciasHumanas` separadamente).
3. Decisão sobre como tratar `bimestre` como string livre (`"1º
   Bimestre"`) → `1 | 2 | 3 | 4` inteiro (mapeamento direto, mas exige
   validar que não há valores fora do padrão nos dados reais).
4. Autorização explícita e escopo definido (nunca executar como efeito
   colateral de outra tarefa).

## 3. Desenho da migração (proposto, não implementado)

1. **Exportação/leitura somente-leitura** de `grades` via Admin SDK (mesmo
   padrão de `scripts/migrate-ativo-field.mjs`: sem credencial no código,
   trava se `projectId != sifec-sefor3`, dry-run por padrão).
2. **Resolução de turma por documento**, na mesma ordem de prioridade já
   usada em `schoolIdentity.ts`/`classService.ts` (Fase 1G/2A): 1) `codInep`
   da escola quando disponível; 2) `schoolId`/`escolaId` da turma; 3) nome
   normalizado só como último recurso. Quando o nome de turma citado em
   `grades.turma` bater com **mais de uma turma candidata** (mesmo nome em
   escolas diferentes), o registro fica marcado como "ambíguo — requer
   revisão manual" e **não é migrado automaticamente**.
3. **Geração de `studentKey` novo** via `crypto.randomUUID()` para cada
   aluno resolvido — nunca reaproveitar o `id` antigo de `grades` (formato
   `grade-<timestamp>`, sem relação com o novo schema) nem derivar de
   `nome`.
4. **Um `student_rosters` por aluno+turma+ano** (o `anoLetivo` da migração
   precisaria ser assumido explicitamente — os dados legados não têm esse
   campo — provavelmente o ano letivo vigente no momento da migração,
   decisão de quem autorizar).
5. **Um `student_bimester_grades` por aluno+turma+ano+bimestre**, convertendo
   a string `bimestre` (`"1º Bimestre"` etc.) para o inteiro `1-4`.
6. **Registros ambíguos nunca são gravados** — só logados para revisão
   manual, junto com o total processado/resolvido/ambíguo (mesmo princípio
   de validação de quantidades do plano anterior, seção 2, item 9).
7. **`grades` permanece intocado** durante e depois da migração — nenhuma
   escrita, nenhuma exclusão. A migração é estritamente **aditiva** nas
   coleções novas.
8. **Testes antes de qualquer execução real**: script rodado contra o
   emulador com dados sintéticos (turmas ambíguas e não ambíguas,
   bimestres válidos e inválidos) confirmando que só os casos inequívocos
   são migrados e que a soma (migrados + ambíguos) bate com o total de
   entrada.

## 4. Rollback

Como a migração é puramente aditiva (nunca apaga nem altera `grades`,
nunca sobrescreve um `student_rosters`/`student_bimester_grades` já
existente fora do próprio script), reverter significa apenas: não
disponibilizar os documentos migrados na interface, ou removê-los das
coleções novas — `grades` nunca precisa ser restaurado porque nunca foi
tocado.

## 5. Status

Nenhuma etapa deste plano foi executada. A Fase 2C entrega o modelo novo
funcionando de forma independente, com `grades` preservado e com acesso
restrito ao administrador raiz (ver seção de regras do relatório da Fase
2C) — a migração em si depende de autorização explícita futura.
