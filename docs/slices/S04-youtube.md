# S04 — Observação e apresentação do player

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S01 integrada.

**Arquivos sob sua responsabilidade:** src/platform/youtube/**, estilos próprios dessa camada e tests/unit/platform/youtube/**.

## Trabalho técnico

Leia a skill modern-web-guidance e pesquise as orientações pertinentes antes da implementação de DOM/CSS. Implemente detecção de vídeo/player e observação por eventos, com MutationObserver limitado e descarte explícito. Não usar polling contínuo.

Produza snapshots contratados para /watch e /live; exclua /shorts e páginas sem vídeo. Diferencie troca real de vídeo de anúncio, pausa, mudança de parâmetros não identitários e substituição do elemento player. Envie nova geração somente conforme contrato.

Implemente apresentação reversível: player ocupa viewport, vídeo mantém proporção, controles/legendas continuam acessíveis. Restaure classes, estilos, foco e atributos alterados pela extensão sem apagar modificações legítimas do site. Aplicar/restaurar duas vezes deve ser seguro.

Detecte Esc, F e botão do player enquanto o modo automático estiver ativo. Respeite campos editáveis, composição de texto e modificadores. Reporte saída ao controlador; não chamar chrome.windows diretamente. Eventos de teste podem ser simulados em unitários, mas não devem ser usados em produção como autorização de fullscreen.

## Critérios de aceite

- Detecção, geração, aplicação, restauração e dispose têm testes unitários.
- Sem listeners/observers duplicados após reinicialização.
- Troca do player não remove a supressão do vídeo.
- Falha ou contexto invalidado permite restaurar apresentação.
- Geometria real será verificada em S07/S09; não afirmar validação visual via jsdom.

## Limites

Não escrever background, popup nem fixtures compartilhadas de E2E. Solicitar mudanças de contrato ao integrador.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
