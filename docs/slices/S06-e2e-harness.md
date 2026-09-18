# S06 — Ambiente ponta a ponta reproduzível

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S01 integrada.

**Arquivos sob sua responsabilidade:** tests/e2e/harness/**, tests/e2e/bootstrap.spec.js e tests/fixtures/**.

## Trabalho técnico

Crie fixture Playwright que carregue dist/ como extensão real no Chromium empacotado, usando contexto persistente temporário e perfil sem dados pessoais. Derive o ID da extensão do worker carregado.

Crie páginas próprias de teste servidas por roteamento nas URLs elegíveis do YouTube. Inclua um pequeno vídeo local gerado ou com licença adequada, navegação SPA, player atrasado/substituído e avanço automático controlado. Bloqueie tráfego não esperado. Use o manifesto e bundle de produção sem ampliar permissões.

Exponha helpers de teste para escolher cenário, observar player e consultar estado real de janela/storage via APIs da extensão. Não mockar chrome.windows/storage/mensagens no E2E. Os controles da fixture não podem existir no build de produção.

Prepare traces/screenshots em falhas, teardown de contexto/perfil e separação entre cenários headless e com janela. Verifique limitações de abertura do popup real e documente o mecanismo suportado; a página do popup é um teste distinto.

## Critérios de aceite

- Extensão mínima de S00 carrega e recursos do build são encontrados.
- Fixture navega sem tráfego externo e renderiza mídia local.
- Teardown fecha o contexto e remove somente diretório temporário criado pelo teste.
- Smoke de bootstrap passa; testes de fullscreen funcional só entram quando S07 estiver disponível.

## Limites

Não editar playwright.config.js, pacote ou CI em paralelo: entregar alterações necessárias ao integrador. Não adicionar testes que passem sem executar a extensão.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
