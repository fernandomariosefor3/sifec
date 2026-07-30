# Fase 2C — Inventário da aba Notas legada

Documento de inventário, produzido antes de qualquer alteração de código.
**Nenhum documento real da coleção `grades` foi lido, alterado ou excluído**
para produzir este inventário — só o código-fonte foi analisado.

## 1. `StudentGrade` (schema atual)

```ts
interface StudentGrade {
  id: string;
  nome: string;       // nome completo, único dado nominal
  turma: string;       // nome de EXIBIÇÃO da turma (string livre, ex.:
                        // "3º Ano A - Matutino"), não um ID
  portugues: number;
  matematica: number;
  ciencias: number;
  bimestre: string;    // string livre: "1º Bimestre".."4º Bimestre"
}
```

Ausências confirmadas no schema: **`schoolId`**, **`turmaId`**, **`anoLetivo`**
— nenhum dos três existe no documento. O único vínculo com a turma é o campo
`turma`, um texto de exibição comparado por igualdade/substring, nunca um ID.

## 2. `SEED_GRADES` (dado demonstrativo)

`src/lib/firebaseService.ts:148-155` — 6 registros fixos, incluindo os nomes
`"Amanda Sousa Silva"` e `"Bruno Costa de Oliveira"`. Usado em três lugares:

- `NotasView.tsx`: estado inicial (`useState(SEED_GRADES)`) e fallback quando
  `!isFirebaseMode`.
- `NotasView.tsx`, `subscribeToCollection('grades', (loaded) => { if
  (loaded.length > 0) setGrades(loaded); })` (linha 142) — **quando a coleção
  real do Firestore está vazia, `setGrades` nunca é chamado**, então o estado
  continua em `SEED_GRADES`: dado fictício permanece exibido mesmo com
  Firebase conectado e autenticado. Confirma a instrução "não mostrar dados
  demonstrativos após autenticação" como violada na implementação atual.
- `seedFirestoreDatabase()` (`firebaseService.ts:186-188`) — grava
  `SEED_GRADES` de verdade na coleção `grades` quando acionado pelo botão
  "Inserir Cópia Temp / Seed" (só existe em build de desenvolvimento,
  `import.meta.env.DEV`, mas a função em si roda se chamada por qualquer
  outro caminho — só o `import.meta.env.PROD` dentro da própria função
  bloqueia produção).

## 3. Consulta geral à coleção `grades` (sem filtro)

Três subscrições diferentes, todas via `subscribeToCollection('grades', ...)`
— um `onSnapshot` na coleção **inteira**, sem `where()`, sem paginação:

1. `NotasView.tsx:142`
2. `ExtraViews.tsx:433` (Busca Ativa)
3. `ExtraViews.tsx:1754` (Recomposição)

Todo filtro por escola/turma/aluno acontece **no cliente**, depois de baixar
a coleção inteira — qualquer superintendente autenticado recebe os boletins
de todas as escolas, não só das suas.

## 4. Ausência de `schoolId`/`turmaId`/`anoLetivo`

Confirmado em `docs/plano-migracao-grades-schoolId.md` (documento de
planejamento pré-existente, nunca implementado) e no schema acima. Sem
`schoolId`, a regra de segurança de `grades` (`firestore.rules`, seção
"Opção C — mitigação temporária") não consegue isolar por escola — usa só
`isAuthorized()` (qualquer superintendente cadastrado e ativo).

## 5. Vínculo de turma por texto

`NotasView.tsx` resolve a turma do aluno comparando `g.turma === t.nome`
(ou, no matriz de escola, `t.escolaId === sch.id || schoolNamesMatch(...)`).
`ExtraViews.tsx` usa uma lógica **diferente e inconsistente**: substring
hardcoded do nome da turma (`g.turma.includes('Diva')` para "EEM Diva
Cabral", etc. — já documentado em `plano-migracao-grades-schoolId.md`).
Nomes de turma se repetem entre escolas (`"3º Ano A - Matutino"` aparece em
pelo menos 3 escolas nos dados de exemplo) — o vínculo por nome não é uma
chave confiável.

## 6. `turmas[0]` como fallback

`NotasView.tsx:232`:

```ts
const activeClass = turmas.find(t => t.nome === selectedStudent.turma) || turmas[0];
```

Ao salvar a nota de um aluno, se a turma dele não for encontrada por nome
(qualquer divergência de grafia, ou lista de turmas ainda não carregada), o
código silenciosamente atualiza a média da **primeira turma da lista**, que
pode pertencer a outra escola inteiramente. Bug confirmado, não só teórico.

## 7. Criação de IDs com `Date.now()`

`NotasView.tsx:351`: `const newId = \`grade-${Date.now()}\`;` — sem
determinismo, sem relação com escola/turma/ano/aluno; duas gravações no
mesmo milissegundo (impossível na prática, mas ilustra a ausência de
qualquer garantia) colidiriam.

## 8. Exclusão definitiva de boletins

`handleDeleteGrade` (`NotasView.tsx:386-404`) — `window.confirm(...)` seguido
de `deleteDocument('grades', studentId)`: remoção **permanente**, sem
inativação, sem preservação de histórico.

## 9. Classificação Aprovado/Recuperação/Retido

`getStatusLabel` (`NotasView.tsx:200-204`):

```ts
if (average >= 6.0) return { label: 'Aprovado', ... };
if (average >= 5.0) return { label: 'Recuperação', ... };
return { label: 'Retido', ... };
```

Classificação pedagógica formal (aprovação/reprovação/recuperação) derivada
só da média de 3 notas de um único bimestre — exatamente o que a Fase 2C
proíbe explicitamente de repetir.

## 10. Gravação de médias diretamente em `turmas`

`handleSaveGrades` (`NotasView.tsx:230-238`) e
`handleSaveSchoolLancamentos` (`NotasView.tsx:320-335`) escrevem
`mediaBimestre`/`lancamentosBimestre` diretamente no documento de `turmas` —
acopla o registro de notas individuais ao registro estrutural da turma (que
pertence à Fase 2A) e mistura dois domínios de dados diferentes num único
documento.

## 11. Ausência de isolamento escolar nas regras

`firestore.rules:452-462` (`match /grades/{gradeId}`) — `allow read: if
isAuthorized();`, sem checagem de escola. Confirmado: qualquer
superintendente ativo lê/edita boletins de qualquer escola, não só da sua.

## 12. Dados fictícios exibidos quando o Firebase retorna vazio

Já descrito no item 2 — `if (loaded.length > 0) setGrades(loaded);` nunca
limpa o estado para `[]`; uma coleção real vazia deixa `SEED_GRADES` visível
indefinidamente, mesmo autenticado.

## Conclusão

A aba atual não tem nenhuma das garantias já estabelecidas nas Fases 2A/2B
(ID determinístico, isolamento por escola, ausência de fallback perigoso,
distinção clara entre demonstração e dado real). A Fase 2C substitui a aba
inteira por um modelo novo (`student_rosters` + `student_bimester_grades`),
sem reutilizar `grades` — ver `docs/plano-migracao-grades-legado.md` para a
estratégia de transição e o plano (não executado) de migração futura.
