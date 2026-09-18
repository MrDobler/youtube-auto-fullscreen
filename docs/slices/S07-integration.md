# S07 — Primeiro fluxo funcional completo

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S02, S03, S04, S05 e S06 integradas.

**Arquivos sob sua responsabilidade:** src/application/**, src/background/index.js, src/content/index.js, tests/unit/application/**, tests/unit/entrypoints/**, tests/integration/** e tests/e2e/core-flow.spec.js.

## Trabalho técnico

Monte dependências e registre listeners do worker sincronicamente. Implemente executor de efeitos e reconciliação usando domínio e adaptadores existentes.

Entregue o fluxo vertical: abrir URL de vídeo → detectar player → verificar contexto ativo → persistir intenção → fullscreen da janela → apresentar player → confirmar estado. Na falha, compensar efeitos próprios. Esc e desligamento invalidam a operação e restauram.

Conecte popup à preferência real e propagação global. Conecte anúncio de content pronto, navegação, troca de aba, fechamento e foco do navegador. Nenhum fluxo deve exigir clique adicional para entrar.

Integre as alterações de build/manifestações propostas pelas slices, registrando qualquer permissão adicional. Mantenha testes de entradas dentro da cobertura. Execute testes integrados e E2E de caminho principal sobre dist/.

## Critérios de aceite

- E2E: link direto entra sem gesto extra; Esc sai; mesmo vídeo permanece fora; outro vídeo entra.
- E2E: aba não elegível restaura a janela.
- Teste integrado: desligar restaura todas as janelas possíveis; falhas parciais são reportadas.
- Popup real sobre vídeo é exercitado em runner suportado; limitação de ambiente fica explícita.
- npm check, cobertura global e build passam no checkout combinado.

## Limites

Resolver incompatibilidades pela atualização única de contratos, não por duplicação de adaptadores. Não alegar conclusão de toda a matriz de plataformas.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
