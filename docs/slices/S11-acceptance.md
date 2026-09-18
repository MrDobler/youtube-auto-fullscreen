# S11 — Aceitação no Chrome real e encerramento

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S10 integrada.

**Arquivos sob sua responsabilidade:** docs/acceptance/** e atualização do estado de liberação; mudanças de código retornam ao slice proprietário.

## Trabalho técnico

Valide o artefato empacotado em Chrome estável com janela, usando perfis de teste separados no Mac e no Windows. Registre versão do SO/Chrome, commit, hash do ZIP e resultado por cenário.

Execute link direto sem clique adicional, navegação interna, vídeo pausado, próximo automático, playlist, live, Shorts, Esc/F, popup real e desligamento global, foco entre abas/janelas, restauração do estado original e persistência após reinício. Confira barras realmente ocultas, proporção, controles e legendas. Anúncios indisponíveis e bloqueios externos ficam como não verificados.

Não presumir acesso ao outro sistema. Se Windows ou Mac não estiver disponível, entregue o roteiro reproduzível e marque aceitação daquela plataforma como pendente; não marcar a slice completa. A conclusão exige evidência nos dois sistemas.

Falhas de produto voltam ao integrador com reprodução e teste esperado; após correção execute regressão pertinente contra novo hash. Não modificar a implementação para fazer apenas o cenário manual passar.

## Critérios de aceite

- Matriz identifica aprovado/falhou/não verificado, com evidências reais por plataforma.
- Mesma versão empacotada é aceita em Mac e Windows, ou pendências explícitas impedem concluir a slice.
- Nenhum bloqueador de saída, foco ou desligamento permanece.
- Relatório final relaciona cobertura, E2E, limitações e prontidão para publicação, sem publicar.

## Limites

Não usar perfil pessoal nem alterar preferências fora do perfil de teste. Publicação remota é decisão posterior.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
