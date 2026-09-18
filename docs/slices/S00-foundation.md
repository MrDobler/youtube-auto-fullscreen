# S00 — Fundação reproduzível

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** Nenhuma.

**Arquivos sob sua responsabilidade:** Raiz, configurações, scripts de build e primeiro workflow.

## Trabalho técnico

Crie a raiz definitiva no caminho indicado pelo coordenador (padrão: /Users/arthur/Documents/ChatGPT/Full Screen Plugin Chrome/youtube-auto-fullscreen). Inicialize Git independente em main. Não importe histórico. Leia as skills oficiais existentes em /Users/arthur/Documents/ChatGPT/Full Screen Plugin Chrome/.agents/skills e copie somente as duas skills, proveniência e licença para a nova raiz. Copie este diretório de slices. Escreva AGENTS.md específico da nova aplicação.

Configure npm, Node LTS fixado, JavaScript ESM, JSDoc/checkJs/noEmit, tipos Chrome, esbuild, Vitest/V8/jsdom, Playwright, ESLint e Prettier, com lockfile. Leia as referências atuais antes de escolher versões compatíveis.

Defina build de worker ESM, content script clássico e popup com recursos locais. Crie um manifesto MV3 mínimo e uma entrada mínima com comportamento observável de inicialização, sem implementar tela cheia ainda. Teste essa inicialização e os arquivos gerados; não crie módulos vazios para etapas futuras.

Configure os quatro limites de cobertura em 90, perFile e inclusão de src/**/*.js. Prepare scripts e CI para as suítes realmente existentes; documente os comandos que entrarão nas etapas seguintes. Falha por suíte ausente não deve ser escondida.

## Critérios de aceite

- Instalação limpa com npm ci e build reproduzível.
- Manifesto referencia somente recursos existentes; extensão mínima carrega em Chromium.
- Lint, formatação, checkJs e unitários com cobertura passam.
- Workflow de base executa esses gates quando houver remoto.
- Primeiro commit local permite criar worktrees; não criar remoto nem executar push.

## Limites

Não implementar domínio, player ou popup funcional. Configurações ficarão sob controle do integrador após este slice.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
