# S01 — Contratos e identidade

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S00 integrada.

**Arquivos sob sua responsabilidade:** src/shared/**, docs/contracts.md, docs/adr/001-state-and-messaging.md e tests/unit/shared/**.

## Trabalho técnico

Transforme as oito decisões de contratos do README deste diretório em contratos JSDoc, validadores executáveis e exemplos de mensagens válidas/inválidas.

Defina estado, eventos, efeitos, retornos dos adaptadores e erros estruturados. Cubra identidade de documento/vídeo e geração, versão do protocolo, request/operation IDs e limite do payload. Defina como validar remetentes diferentes: content script no frame principal versus página de popup pertencente à extensão.

Especifique a supressão por vídeo independentemente da troca do documento, sem aceitar evento atrasado de uma navegação anterior. Descreva armazenamento separado de preferência e sessão, recuperação de intenções incompletas e resultados parciais. IDs e relógio são fornecidos pelas bordas; o domínio recebe dados.

Publique exports e exemplos concretos de entrada/saída para S02–S06. Não implementar adaptadores. Um erro de validação não pode resultar em alteração de janela.

## Critérios de aceite

- Validadores rejeitam tipos/versões desconhecidos, payloads excessivos e identidades inconsistentes.
- Casos positivos documentados podem ser usados diretamente por todos os agentes.
- Testes de validação e serialização passam e cobertura cumpre os quatro limites.
- Contratos congelados em commit integrado antes de iniciar paralelismo.

## Limites

Não adicionar permissões ou dependências. Propor ao integrador qualquer ajuste indispensável no toolchain.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
