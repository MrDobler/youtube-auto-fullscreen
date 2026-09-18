# S10 — CI, pacote e documentação de entrega

## Instrução para o agente

Implemente apenas esta slice no worktree da aplicação definitiva fornecido pelo coordenador. Leia AGENTS.md, docs/slices/README.md e, quando disponível, docs/contracts.md. Consulte as skills oficiais pertinentes; verifique referências atuais antes de adotar APIs. Não inicie slices dependentes nem delegue automaticamente.

**Dependências:** S09 integrada.

**Arquivos sob sua responsabilidade:** scripts/**, .github/**, configurações de build/teste, README.md, CONTRIBUTING.md, SECURITY.md, PRIVACY.md, CHANGELOG.md, CHROMEWEBSTORE.md e docs de distribuição.

## Trabalho técnico

Finalize comandos e CI: instalação limpa, lint, formatação, tipos, unitários/90%, integração, build, E2E controlado e pacote. Execute Linux com janela virtual quando necessário; em Windows/macOS execute suites compatíveis, identificando separadamente a aceitação com janela.

Valide manifesto MV3, caminhos e versões consistentes, CSP, permissões justificadas, recursos de localização e ícones reais. Gere ZIP por lista explícita contendo só runtime de dist/. Teste também a instalação do pacote extraído, não somente a pasta de desenvolvimento.

Escreva documentação do zero para a aplicação entregue: instalação, desenvolvimento, testes, arquitetura, limitações, contribuição e privacidade. Atualize CHROMEWEBSTORE.md com comportamento e permissões realmente presentes; não preencher dados pessoais/conta ou avaliações inexistentes.

Prepare templates de issue/PR, artefatos de teste e atualização de dependências. Fixe actions/dependências, minimize permissões de workflow e não usar secrets em testes de PR. Preservar licença das skills; licença do código próprio é decisão do autor.

## Critérios de aceite

- npm ci seguido dos gates e package funciona em checkout limpo no ambiente disponível.
- ZIP contém somente arquivos de runtime e instala corretamente quando extraído.
- Nenhum badge de cobertura sem relatório real.
- Workflows preparados e validados localmente; execução remota só declarada se observada.
- README diferencia validação automatizada e real por plataforma.

## Limites

Não criar remoto, publicar release ou submeter à Chrome Web Store. Se nome/visibilidade/licença ainda não foram escolhidos, registrar essas decisões como pendentes para publicação.

Todos os arquivos JavaScript de produção criados/alterados exigem unitários e os limites de 90% definidos no README das slices. Integração/E2E são relatados separadamente. Execute os gates pertinentes à etapa e informe resultados reais, limitações e arquivos alterados no formato de entrega comum. Se um contrato bloquear a tarefa, descreva a alteração mínima necessária ao integrador em vez de inventar uma interface incompatível.
