# S08 — Cancelamento, recuperação e concorrência

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S07 integrada.

**Arquivos sob sua responsabilidade:** src/application/**, src/background/** e testes unitários/integrados correspondentes; regressões em tests/e2e/recovery.spec.js.

## Trabalho técnico

Fortaleça o fluxo já funcional para retomada do worker e mudanças concorrentes. Simule interrupção após persistir intenção, após fullscreen e antes de confirmar apresentação; recupere pelo estado real em vez de repetir efeitos cegamente.

Cubra Esc/desligamento durante entrada, mensagens atrasadas de documento antigo, troca/fechamento da aba, remoção da janela, aba movida de janela e dupla atualização de preferência. Prefira operações serializadas com IDs e invalidação por geração; não depender somente de variáveis em memória.

Recupere dados inválidos com defaults seguros e sem entrar em loop. Uma falha ao restaurar uma janela não impede tentar restaurar as demais. Trate reinício do navegador separadamente da suspensão do worker: preferência persiste, registros temporários não.

Verifique que observação estável não mantém worker vivo por polling. Produza testes de interrupção e regressão, não só mocks confirmando ordem de chamadas.

## Critérios de aceite

- Nenhuma resposta antiga reativa fullscreen após Esc/desligamento.
- Estado persistido e janela real convergem após interrupções testadas.
- Preferência sobrevive a novo contexto usando o mesmo perfil temporário; sessão é reconciliada.
- Falha parcial é visível e não interrompe o restante da restauração.
- Cobertura e suites integradas/E2E pertinentes passam.

## Limites

Se uma correção exigir DOM/contratos, atribuir mudança delimitada ao integrador; não ampliar escopo de forma silenciosa.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
