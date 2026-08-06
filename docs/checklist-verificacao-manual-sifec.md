# Checklist de Verificação Manual — SIFEC (Reestruturação)

Este checklist existe porque a verificação interativa automatizada (Playwright MCP / Chrome
DevTools MCP) falhou de forma reproduzível neste ambiente — `navigate` e `snapshot` funcionam,
mas `click`/`evaluate`/`wait_for` encerram a sessão do navegador (reproduzido seis vezes, em duas
ferramentas diferentes; o servidor de desenvolvimento permaneceu saudável durante todo o processo,
confirmado via `curl`). Trata-se de uma limitação do ambiente de automação, **não** uma prova de
que a aplicação não tem defeitos interativos.

Todo o comportamento abaixo está coberto por testes automatizados (838+ unitários, 225+ de
regras), mas **verificação manual real, por um humano, em um navegador real, permanece pendente**.

Não usar nome real de estudante em nenhum passo abaixo — use dados fictícios claramente
identificáveis como tal (ex.: "Estudante Teste 1"), mesmo padrão já usado pelos dados de
demonstração do sistema.

## Preparação

- [ ] `npm run dev` rodando localmente
- [ ] Login com uma conta de superintendente de teste (nunca a conta real de produção sem
      necessidade)

## 1. Gestão de Escolas

- [ ] Abrir Gestão de Escolas
- [ ] Conferir que o card "Cobertura de Região" mostra a contagem 4ª/5ª e "N escola(s) sem região
      informada" separadamente (nunca somado ao total 4ª/5ª)
- [ ] Editar uma escola de teste e preencher o campo Região (4ª ou 5ª) — confirmar que a contagem
      do card muda corretamente
- [ ] Abrir "Matrícula por bimestre" de uma escola — conferir os 4 bimestres (1º ao 4º)
- [ ] Conferir a lista de turmas (nome, quantidade, ano letivo, ativa/inativa)

## 2. Acompanhamento de Notas

- [ ] Abrir Acompanhamento de Notas (conferir que o nome do menu é este, nunca "Lançamento de
      Notas")
- [ ] Selecionar uma escola — conferir a tabela "Resumo por turma" (grade_entry_monitoring, total
      geral, sem disciplina)
- [ ] Na seção "Acompanhamento por turma e disciplina", clicar "Adicionar disciplina"
- [ ] Testar disciplina: digitar um nome de disciplina que NÃO está na lista sugerida (ex.:
      "Espanhol") — confirmar que é aceito (nunca limitado a 4 disciplinas fixas)
- [ ] Testar disciplina: digitar "História" e depois, em outra linha, "Geografia" — confirmar que
      viram duas linhas distintas (não colidem)
- [ ] Testar faixas de cor: registrar lançamentos esperados/realizados que produzam exatamente
      75% — confirmar que a cor é "Bom" (verde claro), nunca "Atenção" (limite inclusivo)
- [ ] Testar faixas de cor: 96% → Ótimo; 60% → Atenção; 40% → Crítico; 0 esperado → "Não
      informado" (nunca vermelho, nunca 0%)
- [ ] Testar períodos: trocar a visão para "1º Período", "2º Período" e "Consolidado" — conferir
      que os números mudam de forma consistente com os bimestres somados
- [ ] Ativar "Agregados regionais (SEFOR 3)" — conferir que aparece "X de Y escola(s) carregada(s)
      com sucesso"
- [ ] Conferir o resumo por área de conhecimento (Linguagens, Matemática, Ciências da Natureza,
      Ciências Humanas etc.) logo acima da tabela de disciplinas

## 3. Sala de Situação (ranking)

- [ ] Abrir Sala de Situação
- [ ] Abrir o painel "Como o ranking de urgência/risco é calculado" — conferir que menciona
      explicitamente "critério técnico provisório", nunca "metodologia oficial"
- [ ] Conferir que os pesos exibidos no painel batem com o que está documentado no código
      (`RISK_WEIGHTS` em `schoolRiskRanking.ts`)
- [ ] Se houver uma escola com 3+ fontes indisponíveis (ou simulável em modo demonstração),
      conferir que ela aparece com o rótulo "Dados insuficientes" em vez de uma posição numerada

## 4. Ciclo de Gestão

- [ ] Abrir Ciclo de Gestão
- [ ] Conferir só os campos: situação do plano (Ativo/Inativo), status de execução (Não
      iniciado/Em execução/Concluído), lista de tarefas com status e prazo
- [ ] Conferir que uma tarefa com prazo vencido aparece destacada como atrasada

## 5. Farol do Estudante

- [ ] Abrir "Alunos com Baixo Desempenho (Farol do Estudante)"
- [ ] Registrar um estudante de teste com percentual de acerto 24% — confirmar que é aceito
- [ ] Tentar registrar com percentual 25% — confirmar que é **rejeitado** (o limite é `< 25`,
      nunca `<= 25`)
- [ ] Preencher a data de referência e o status de acompanhamento — confirmar que ambos são
      obrigatórios
- [ ] **Arquivar um registro de teste** (nunca excluir) — confirmar que:
  - [ ] o botão diz "Arquivar", não "Excluir"
  - [ ] depois de arquivado, o registro desaparece da lista padrão
  - [ ] marcar o filtro "Mostrar arquivados" faz o registro reaparecer, com o rótulo "Arquivado"
  - [ ] uma mensagem de confirmação aparece dizendo que o registro foi arquivado, não apagado
- [ ] Conferir que não existe nenhum botão de exclusão física visível para o superintendente comum

## 6. Recomposição

- [ ] Abrir Recomposição
- [ ] Registrar um plano de teste (prazo, área/disciplina, turno, descrição) — confirmar que não
      existe nenhum campo de lista nominal de estudantes

## 7. Parecer Bimestral

- [ ] Abrir Parecer Bimestral, selecionar uma escola/ano/bimestre com dados de teste
- [ ] Navegar pelos 9 cards (Capa, Matrícula, Fluxo Escolar, Notas Informadas, Farol do Estudante,
      Sala de Situação, Ciclo de Gestão, Recomposição, Conclusão e Encaminhamentos) — conferir que
      cada card mostra "Fonte:" e "Atualizado em:"
- [ ] No card "Notas Informadas", conferir a consolidação por área de conhecimento (disciplinas
      reais, não só o total por turma)
- [ ] **Trocar de escola** com um card não-Capa ativo — confirmar que os dados da escola anterior
      nunca aparecem durante o carregamento (deve mostrar "Carregando...", nunca o parecer da
      escola errada)
- [ ] **Trocar de ano** e **trocar de bimestre** — mesma verificação acima
- [ ] Escrever um texto em "Conclusão e Encaminhamentos" e salvar — recarregar a página e
      confirmar que o texto persiste
- [ ] Clicar "Imprimir / Exportar PDF" (ou usar o preview de impressão do navegador,
      Ctrl+P/Cmd+P)
- [ ] **Confirmar em A4** que:
  - [ ] cada card ocupa sua própria página (quebra de página entre cards)
  - [ ] o menu lateral e os botões de navegação não aparecem na impressão
  - [ ] **nenhum nome de estudante do Farol do Estudante aparece na versão impressa** — só a
        contagem agregada por turma/disciplina
  - [ ] o cabeçalho de cada página mostra escola, ano e bimestre
  - [ ] nenhum conteúdo fica cortado nas bordas da página

## Encerramento

- [ ] Nenhum dado real de estudante foi usado em nenhum passo acima
- [ ] Nenhum registro de teste foi deixado sem identificação clara como fictício (prefixo
      "Teste"/"Demonstração" em qualquer nome usado)
- [ ] Reportar qualquer divergência encontrada entre este checklist e o comportamento real —
      mesmo pequena — antes de considerar a reestruturação pronta para uso em produção
