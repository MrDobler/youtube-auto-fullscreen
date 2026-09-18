# S05 — Interface de preferência global

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S01 integrada.

**Arquivos sob sua responsabilidade:** src/popup/**, public/\_locales/** e tests/unit/popup/**.

## Trabalho técnico

Implemente popup pequeno em HTML/CSS/JavaScript, com interruptor global acessível, estado de carregamento, ativado/desativado e falhas. Use os contratos de leitura/alteração de preferência; a UI não controla janelas.

A preferência inicial é obtida do worker. Após alteração, mostrar o resultado confirmado. Prevenir envios duplicados e tratar falha parcial sem exibir sucesso completo. Ao reabrir, recuperar o estado persistido e eventual falha relevante.

Preparar mensagens pt-BR/en. Usar scripts externos, navegação por teclado, foco visível, labels e anúncio de status. Verificar as referências pertinentes de popup e frontend nas skills.

Teste a UI com transporte injetado. O comando deve ter responsabilidade no worker para poder terminar se o popup fechar. Não apresentar o transporte simulado como prova da operação completa.

## Critérios de aceite

- Teclado e clique alteram a preferência pelo protocolo.
- Estado confirmado é exibido; erro não fica mascarado como sucesso.
- Reabrir recupera preferência e falhas.
- Testes cobrem clique duplicado, carregamento e resposta inválida/negada.
- Cobertura e gates passam; funcionamento real será integrado em S07.

## Limites

Não alterar domínio, adaptadores Chrome, contratos ou dependências. A inclusão dos recursos de localização no build é coordenada pelo integrador.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
