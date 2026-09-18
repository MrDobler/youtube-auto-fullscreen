# S09 — Matriz de regressão da experiência

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S08 integrada.

**Arquivos sob sua responsabilidade:** tests/e2e/**, docs/testing.md e correções delimitadas em src/platform/youtube/** ou src/popup/** com respectivos unitários.

## Trabalho técnico

Complete a matriz E2E controlada usando extensão real: vídeos pausados, navegação SPA, avanço automático, lives, exclusão de Shorts, player tardio/substituído, abas/janelas em segundo plano, múltiplas janelas, Esc/F, campos editáveis, restauração de janela normal/maximizada e fullscreen preexistente.

Verifique geometria do player, proporção do vídeo, controles, legendas e overlays de anúncio das fixtures. Teste resposta do popup, preferência persistida e desligamento durante fullscreen. Distinguir página do popup de popup real.

Asserções devem observar estado real de janela e geometria/visibilidade, não apenas classes internas. Use esperas por estado, não sleeps arbitrários. Corrija defeitos encontrados com regressão unitária no componente; sem alterar limites de cobertura.

Crie suíte separada de smoke para YouTube real, sem depender de conta pessoal e sem incluí-la como requisito de PR. Documente fixtures como representação controlada, sem alegar equivalência a todas as versões do site.

## Critérios de aceite

- Cada requisito funcional tem pelo menos um cenário mapeado em docs/testing.md.
- E2E controlado obrigatório passa sem tráfego externo inesperado.
- Testes com/sem janela são identificados; capacidade indisponível não vira aprovação.
- Falhas geram evidências suficientes para reprodução.
- Cobertura e todos os testes locais obrigatórios passam.

## Limites

Não completar etapas de login, publicação ou consentimentos imprevistos automaticamente. Não ocultar flaky tests com retries ilimitados.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
