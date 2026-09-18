# S02 — Regras funcionais de tela cheia

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S01 integrada.

**Arquivos sob sua responsabilidade:** src/domain/** e tests/unit/domain/**.

## Trabalho técnico

Implemente transition(state, event) retornando novo estado e descrições de efeitos conforme docs/contracts.md. Não acessar chrome, DOM, storage, relógio ou aleatoriedade.

Cubra elegibilidade de vídeos/lives, exclusão de Shorts, foco de aba/janela, janela minimizada, preferência global, supressão após Esc e restauração do estado original. Diferencie tela cheia iniciada pela extensão daquela que já existia.

Modele entering/exiting e eventos de sucesso/falha. Respostas com operationId ou geração antigos não mudam o estado atual. Eventos repetidos não produzem efeitos duplicados. Teste a mudança de vídeo durante entrada e desligamento/saída durante operação pendente.

Crie tabelas de casos e sequências de eventos que expressem os requisitos, sem espelhar linhas de implementação. Preserve os objetos de entrada, com testes usando objetos congelados quando útil.

## Critérios de aceite

- Link direto elegível gera intenção de entrada; segundo plano não gera.
- Esc mantém supressão nos eventos equivalentes e a mudança real de vídeo a libera.
- Desligamento invalida entradas pendentes e restaura somente recursos próprios.
- Repetição e reordenação de eventos não reativam vídeo suprimido.
- Cobertura unitária e demais gates passam.

## Limites

Não implementar executor, armazenamento ou DOM. Consumir contratos S01; não criar um protocolo concorrente.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
