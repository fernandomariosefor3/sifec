# Como preencher o SIFEC — de onde vem cada dado

Levantado em 08/08/2026, por observação direta dos sistemas de origem e leitura
do código. Documento operacional: diz, para cada área do SIFEC, qual é a fonte
real do dado, como chegar até ela e o que ainda está sem fonte.

Regra que atravessa o documento inteiro: **campo sem fonte não é preenchido.**
Estimar, repetir o valor do mês anterior ou usar média da rede transforma o
sistema numa fonte de erro com aparência de precisão. Lacuna visível é melhor
que número inventado.

---

## Estado em 08/08/2026

| Área | Coleção | Situação |
|---|---|---|
| Gestão de Escolas | `schools` | **Preenchido** — 7 unidades, 3.009 matrículas, região completa |
| Turmas | `turmas` | Vazio — sem lista de turmas cadastrada |
| Matrícula por bimestre | `bimonthly_enrollments` | Vazio |
| Matrícula mensal | `enrollment_snapshots` | Vazio |
| Fluxo escolar | `school_flow_results` | Vazio |
| Lançamento de notas | `grade_entry_monitoring` | Vazio |
| Farol do Estudante | `farol_estudante` | Vazio |
| Recomposição | `recomposicao_planos` | Vazio |
| Ciclo de Gestão | `cdg_planos`, `cdg_tarefas` | Vazio |
| Parecer bimestral | `parecer_bimestral_notas` | Vazio |
| Visitas técnicas | `visitas` | Vazio |

---

## 1. Gestão de Escolas — `schools` ✅ preenchido

**Fonte: SIGE Escola — Mapa de Enturmação.** URL direta, sem navegar menu:

```
https://sige.seduc.ce.gov.br/Academico/Relatorios/MapaEnturmacao/MapaEnturmacao_geral.asp
  ?nr_AnoLetivo=2026&rede=1&atend=4&unidtrabpai=23
```

`atend=4` é "Unidade Escolar". **Usar sempre esse, nunca `atend=1001`.**

### A regra que mais importa

Com `atend=4` aparece a coluna **ENTURMADOS → "SOMENTE em Escola"**, que não
existe no outro filtro. É esse o número que vai para `matriculas`.

```
              MATRICULADOS | TURMAS | SOMENTE em Escola | TODOS | NÃO
Figueiredo:        369     |   35   |       286         |  368  |  1
                                            ↑ este vai para o SIFEC
```

Em 08/08/2026 a Figueiredo Correia foi gravada por engano com 369 e depois
corrigida para 286. É a única das 56 escolas da CREDE onde os dois números
diferem — os 82 de diferença da regional inteira são dela.

### Mapeamento de campos

| Campo SIFEC | Coluna no SIGE | Observação |
|---|---|---|
| `codInep` | INEP - ESCOLA (8 primeiros dígitos) | chave primária, imutável |
| `nome` | INEP - ESCOLA (após o hífen) | imutável no update |
| `regiao` | REG. | 4 vira '4ª', 5 vira '5ª' |
| `matriculas` | SOMENTE em Escola | não usar ALUNOS MATRICULADOS |
| `cidade` | — | só existe Fortaleza no seletor |
| `idebMedio` | — | ver seção 10 |
| `metaIdeb` | — | ver seção 10 |

**Armadilha de nome:** o campo aparece na tela como "Meta SPAECE 2026" com
`data-sifec-field="metaSpaece"`, mas é gravado no Firestore como `idebMedio`.
Não existe campo `metaSpaece` no banco.

**Como preencher:** Gestão de Escolas → botão de editar da linha → alterar →
"Salvar Alterações da Escola". Exige perfil de administrador. `nome` e
`codInep` ficam desabilitados porque as regras do Firestore rejeitam alteração
neles.

---

## 2. Turmas — `turmas` ⬜ vazio

**Fonte: SIGE Escola — Acompanhamento Bimestral**, que é onde a lista de turmas
por escola aparece.

```
https://sige.seduc.ce.gov.br/Academico/Relatorios/AcompanhamentoBimestral/AcompanhamentoBimestral.asp?Inc_Alt=P
```

Caminho que funciona, sem pop-up:

1. Digitar o **código INEP** no campo pequeno de Escola — não o `cd_escola`
   interno. O nome preenche sozinho e as Ofertas carregam.
2. Não usar a lupa: ela abre pop-up que trava a página.
3. As Ofertas trazem série, modalidade e turno de cada agrupamento.

Exemplo real (Diva Cabral, 10 ofertas):

```
1ª Série | Ensino Médio | Regular | Manhã        1ª Série | ... | Tarde
2ª Série | Ensino Médio | Regular | Manhã        2ª Série | ... | Tarde
3ª Série | Ensino Médio | Regular | Manhã        3ª Série | ... | Tarde
AEE ESCOLA | AEE | Manhã                         AEE ESCOLA | AEE | Tarde
EJA Mais Qualificação Profissional I | Noite
EJA Presencial - Ensino Médio | Noite
```

**Regra do usuário: AEE não conta como turma.** Ignorar as ofertas "AEE ESCOLA".
O Mapa de Enturmação com `atend=4` já exclui AEE, então as duas fontes batem.

**Regra do usuário para a Figueiredo Correia:** considerar só as turmas da
unidade escolar, as que passam de 30 alunos. As turmas pequenas não entram.

**Como preencher:** Gestão de Escolas → "Matrícula por bimestre" da escola →
"Cadastrar turma". Uma turma por vez, com nome, série e turno.

**Por que ainda está vazio:** o Mapa de Enturmação dá a *contagem* de turmas
(21, 35, 14…), não a lista com nome e série. Cadastrar "Turma 1" até "Turma 21"
seria inventar 21 registros. Falta extrair a lista real, que exige o XLS do
Acompanhamento Bimestral por escola.

---

## 3. Matrícula por bimestre — `bimonthly_enrollments` ⬜ vazio

Campos: `matricula` por escola, ano letivo e bimestre (1 a 4).

**Como preencher:** Gestão de Escolas → "Matrícula por bimestre" → os quatro
campos numéricos → Salvar.

**Cuidado que impede o preenchimento automático:** o Mapa de Enturmação mostra
a foto de *hoje*, não a série histórica. Preencher o 1º e o 2º bimestre com o
número de agosto falsificaria o histórico — e é justamente esse histórico que
o sistema existe para comparar. Cada bimestre precisa ser coletado no seu
próprio período, ou obtido de um relatório retroativo do SIGE.

A partir de agora, o certo é coletar o número ao fim de cada bimestre e lançar.

---

## 4. Fluxo escolar — `school_flow_results` ⬜ vazio

Campos: `aprovados`, `reprovados`, `abandono` por escola e ano letivo.

**Fonte provável:** Sala de Situação, ou o resultado final do ano letivo no
SIGE. São dados de **fechamento de ano** — para 2026 só existirão em dezembro.
Para anos anteriores (2024, 2025) a fonte precisa ser confirmada.

---

## 5. Lançamento de notas — `grade_entry_monitoring` ⬜ vazio

Campos por escola, turma, ano e bimestre: `totalStudents`,
`studentsWithCompleteGrades`, `studentsWithPartialGrades`,
`studentsWithoutGrades`, `expectedGradeEntries`, `completedGradeEntries`.

**Fonte: SIGE Escola — Acompanhamento Bimestral**, formato XLS (mesma tela da
seção 2). É o relatório que traz esses totais por turma.

**A Sala de Situação não serve para preencher esta coleção.** Ela publica só o
percentual agregado por escola, e apenas para as 10 piores da CREDE — as demais
voltam `null`, que significa "fora do ranking", nunca "sem nota lançada".
Tratar esse `null` como zero registraria escolas saudáveis como críticas.

Onde a Sala de Situação ajuda: acompanhamento visual, não alimentação do banco.

```
/rendimento_geral_crede/23         — % turmas/disciplina e alunos/disciplina
/rendimento_monitoramento_crede/23 — % alunos abaixo da média em 3+ disciplinas
```

Valores exatos saem de `Highcharts.charts[i].series[j].yData`, nunca de leitura
visual do gráfico — a diferença chega a 13 pontos percentuais.

Para as escolas fora do top-10, o mapa dá a faixa por cor:
`icones_aux` → red ≤50%, yellow 50–75%, green_light 75–95%, green >95%.

---

## 6. Farol do Estudante — `farol_estudante` ⬜ vazio

Campos incluem `estudanteNome` e `percentualAcerto`. **É a única coleção do
SIFEC com dado nominal de estudante.**

**Nunca preencher por automação.** Regra do usuário e do próprio projeto:
nenhum nome de estudante entra por importação automática. A inclusão exige
relatório nominal autorizado ou indicação manual confirmada pela escola.

---

## 7. Recomposição — `recomposicao_planos` ⬜ vazio

Campos: `prazo`, `areaDisciplina`, `turno`, `descricao` — texto livre.

**Não tem fonte automatizada e não deveria ter.** É plano pedagógico escrito
pela equipe. O sistema só guarda.

O indicador que ajuda a priorizar vem da Sala de Situação
(`/rendimento_monitoramento_crede/23`): alunos abaixo da média em 3+
disciplinas. Em 08/08/2026, quatro das sete unidades estavam entre as onze
piores da CREDE — Diva Cabral 60,3%, Anísio Teixeira 59,1%, Osires Pontes
53,7%, Canindezinho 51,3%.

---

## 8. Ciclo de Gestão — `cdg_planos` e `cdg_tarefas` ⬜ vazio

**Fonte: SIGAE — Instituto Unibanco / programa Jovem de Futuro.**

```
https://sigae.institutounibanco.org.br/plano-acao
```

Três seletores em cascata na barra superior:

```
Programa ("Jovem de Futuro") → Escola → Circuito
```

Colunas da tela "Planos de Ação": Instância do Plano · Descrição do Plano ·
Ano Letivo · Última Modificação · Situação · Status. Paginação de 10 por página.

**Armadilha:** com escola selecionada mas **sem circuito**, a tabela retorna
"Nenhum registro encontrado". Isso não significa ausência de plano, significa
filtro incompleto — mesmo tipo de erro do `null` da Sala de Situação.

**Ainda não mapeado:** os campos internos do plano (diagnóstico, objetivo,
meta, ação, responsável, prazo, evidência, percentual de execução,
homologação). Exige selecionar um circuito e abrir um plano existente.

**Antes de automatizar, resolver uma questão que não é técnica:** o SIGAE é
plataforma de parceiro, não da SEDUC. Extração automatizada de sistema de
terceiro precisa de autorização formal, diferente dos sistemas próprios.

---

## 9. Parecer bimestral — `parecer_bimestral_notas` ⬜ vazio

Campo `encaminhamentos`, texto livre. Escrito pelo superintendente. Sem fonte
externa, por natureza.

---

## 10. Metas SPAECE e IDEB — sem fonte confirmada ⚠️

`idebMedio` (rotulado "Meta SPAECE 2026") já tem valores que parecem reais e
variados: 4.7, 5.2, 3.8, 3.6, 4.0, 4.9, 4.7. **Não sobrescrever.**

`metaIdeb` está **5.0 em seis das sete unidades** e 5.5 numa. Repetição nessa
proporção sugere valor padrão, não meta pactuada por unidade. O relatório da
carteira sinaliza isso automaticamente (`detectarMetaSuspeita`).

**Candidato a fonte: SISEDU.**

```
https://sisedu.seduc.ce.gov.br/analytics/buscar_escola/
```

Combos em cascata: Município → Instituição → Série → Oferta. Menu lateral tem
Home, Alunos, Relatórios, Relatórios de Progressão. `/listar_aluno/` é lista
nominal — não abrir.

**Bloqueio de acesso, não técnico:** em 08/08/2026 o SISEDU estava autenticado
como **Maria Auxiliadora da Silva Rodrigues — Articuladora SEFOR**, não como
Fernando. Coletar dali faria o `audit_log` do SIFEC registrar Fernando como
autor de dado extraído da sessão de outra servidora. Resolver o acesso próprio
antes de automatizar.

A Sala de Situação tem IDEB em `/main`, mas é da rede estadual com base 2021 —
não é meta por unidade para 2026.

---

## Erros já cometidos — não repetir

**Não chutar URL de relatório em sistema de governo.** Duas tentativas de
adivinhar endereço no SIGE derrubaram a sessão e levaram a 404.

**Não chutar código de escola.** O campo pequeno do Acompanhamento Bimestral
espera o **INEP** (23067918), não o `cd_escola` interno (577). Usar o errado
abre um alert nativo que congela a página, e só o usuário consegue fechar.

**Não usar a lupa de busca de escola.** Abre pop-up fora do alcance da
automação e trava a página-mãe.

**Não usar `fetch()` para sondar URLs do SIGE** — congela o renderizador.

**Não ler valor de gráfico por screenshot.** Estimativa visual deu 47% onde o
dado real era 60,27%.

**Conferir o `codInep` dentro do modal antes de salvar.** Abortar se não for a
escola pretendida.

---

## Códigos das 7 escolas

Casar sempre por INEP. Os nomes no SIFEC divergem dos oficiais (EEM vs EEFM,
com e sem "Professora"), então casar por nome falha.

| INEP | Nome no SIGE | `cd_escola` | Região |
|---|---|---|---|
| 23067918 | EEM PROFESSORA DIVA CABRAL | 577 | 5ª |
| 23070242 | EEFM FIGUEIREDO CORREIA | 619 | 4ª |
| 23068914 | EEFM JOSÉ LEOPOLDINO DA SILVA FILHO | 564 | 5ª |
| 23233168 | EEFM SÃO FRANCISCO DE ASSIS - CANINDEZINHO | 673 | 5ª |
| 23065214 | EEMTI ANISIO TEIXEIRA | 540 | 4ª |
| 23069511 | EEMTI ESTADO DO AMAZONAS | 615 | 4ª |
| 23069163 | EEMTI SENADOR OSIRES PONTES | 588 | 5ª |

Na Sala de Situação, o array `unidadesTrabalho` traz esse mesmo `cd_escola` —
é por ele que as duas fontes se casam.

---

## Ordem sugerida de preenchimento

1. **Turmas** — destrava média por turma, matrícula por bimestre e lançamento
   de notas, que dependem de ter turma cadastrada.
2. **Matrícula por bimestre** — a partir do bimestre corrente, sem retroagir
   com número de hoje.
3. **Lançamento de notas** — depende de turmas; exige o XLS do Acompanhamento
   Bimestral por escola.
4. **Metas** — depende de resolver o acesso ao SISEDU.
5. **Ciclo de Gestão** — depende de mapear o SIGAE e da autorização de uso.
6. **Fluxo escolar** — só faz sentido no fechamento do ano.
