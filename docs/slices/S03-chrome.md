# S03 — Adaptadores de Chrome e persistência

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S01 integrada.

**Arquivos sob sua responsabilidade:** src/platform/chrome/** e tests/unit/platform/chrome/**.

## Trabalho técnico

Implemente as interfaces de contexto, janelas, abas, storage e mensagens contratadas em S01. Injete o objeto Chrome para testes unitários, mantendo as mesmas assinaturas usadas em produção.

Persista preferência versionada em storage.local e sessão em storage.session. Trate falhas de leitura/gravação, dados inválidos, aba/janela fechada e ausência de receptor. A API de sessão deve permitir ao executor persistir intenção antes do efeito e registrar conclusão depois.

Envie comandos ao documento/frame esperado, sem confiar em IDs arbitrários do payload. Normalize erros esperados em resultados contratados e preserve informações necessárias para recuperação. Não engolir falhas desconhecidas como sucesso.

Use APIs suportadas pela versão mínima selecionada em S00. Verifique permissões na documentação oficial: não ampliar acesso por conveniência. Não instalar polling ou keepalive para o worker.

## Critérios de aceite

- Testes cobrem sucesso, rejeição, aba fechada e storage corrompido.
- Destino de mensagem é derivado do contexto confiável.
- Operações não assumem transação entre storage.local e session.
- Todos os adaptadores respeitam docs/contracts.md e cobertura ≥90% nos quatro indicadores.

## Limites

Não registrar listeners globais nem implementar regras de domínio. Dependências e manifesto ficam com o integrador.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
