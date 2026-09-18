# YouTube Auto Fullscreen

Chrome extension for automatic YouTube fullscreen, implemented in incremental slices.

**Estado: S00 — fundação.** A versão atual carrega o worker, o content script e uma página de status. A tela cheia automática e o interruptor global ainda não foram implementados.

## Desenvolvimento

Use Node **24.21.0** e npm **11.19.0**, disponíveis juntos na distribuição oficial do Node. A versão está registrada em `.nvmrc`, `.node-version` e `package.json`. Se você usa nvm, execute `nvm install` e `nvm use` antes de instalar as dependências.

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

Para instalar a base localmente no Chrome:

1. Execute `npm run build`.
2. Abra `chrome://extensions`, ative Modo do desenvolvedor e escolha Carregar sem compactação.
3. Selecione a pasta `dist` deste repositório.
4. Abra a ação da extensão: o status deve mostrar “Base carregada.”

`npm run dev` recompila JavaScript e copia alterações de HTML/CSS/manifesto. Depois das mudanças, recarregue a extensão no Chrome e as abas de teste. O desenvolvimento não usa servidor remoto nem código carregado de fora do pacote.

## Comandos

| Comando                 | O que verifica/faz                                               |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run build`         | Gera `dist` com worker ESM, content script clássico e popup      |
| `npm run dev`           | Observa arquivos e recompila/copia recursos                      |
| `npm run lint`          | ESLint                                                           |
| `npm run format:check`  | Formatação de código e documentos próprios                       |
| `npm run format`        | Aplica Prettier; skills de terceiros permanecem intactas         |
| `npm run typecheck`     | Verifica JavaScript de produção e scripts com JSDoc/checkJs      |
| `npm run test:unit`     | Vitest, somente testes unitários                                 |
| `npm run test:coverage` | Unitários com limites obrigatórios de 90% nos quatro indicadores |
| `npm run test:build`    | Valida recursos do pacote e builds repetidos idênticos           |
| `npm run test:e2e`      | Carrega o build em Chromium isolado e testa inicialização        |
| `npm run check`         | Lint, formato, tipos, cobertura e artefato                       |

Relatórios locais: `coverage/`, `playwright-report/` e `test-results/`. Não são versionados.

## Organização

- `src/background`: registro do worker.
- `src/content`: inicialização do content script.
- `src/popup`: página de status, ainda sem controles do produto.
- `public`: manifesto MV3.
- `scripts`: build.
- `tests/unit`, `tests/build`, `tests/e2e`: verificações separadas.
- `docs/slices`: instruções e dependências das próximas entregas.
- `.agents/skills`: orientações oficiais versionadas, com [proveniência e licença](docs/third-party/SKILLS.md).

Os diretórios de domínio/aplicação/adaptadores serão criados quando houver código real para eles. Não há dependências de runtime; as ferramentas são dependências de desenvolvimento.

## Qualidade e próximos passos

O CI executa instalação limpa e checks em Linux, macOS e Windows, além do smoke de Chromium no Linux. A configuração preparada localmente não equivale a uma execução observada no GitHub.

A S00 tem somente smoke de carregamento: não testa navegação real do YouTube, tela cheia, popup sobre vídeo ou integração visual com o sistema operacional. A infraestrutura completa de fixtures entra em S06; contratos em S01; integração em S07. Os comandos de integração, smoke ao vivo e pacote ZIP serão criados com suas suítes nas slices correspondentes, sem scripts que sempre retornem sucesso.

Veja [slices](docs/slices/README.md) e [validação S00](docs/acceptance/S00.md).

Licença do código próprio ainda não escolhida; `UNLICENSED` e pacote npm privado até decisão do autor. Licenças das skills são independentes. Nenhum remoto ou publicação foi configurado.
