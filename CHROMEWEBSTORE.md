# Chrome Web Store — preparação

Atualizado em 21/09/2026. Estado: desenvolvimento S07; não pronto para submissão.

## Listing

Nome: YouTube Auto Fullscreen. Versão local: 0.1.0. Descrição atual: base de desenvolvimento da extensão. Propósito planejado: abrir vídeos do YouTube automaticamente em tela cheia, respeitando saída manual e preferência global. A S07 integra o fluxo de vídeo direto, Esc e restauração de mudanças próprias. Descrição comercial, categoria, ícones e screenshots serão preparados após implementação e validação.

## Permissões e acesso

É solicitada somente a permissão `storage`, para manter no navegador a preferência global e o estado temporário recuperável das operações. Content scripts limitados a `https://youtube.com/*` e `https://www.youtube.com/*`. Não há `host_permissions`, `externally_connectable` ou recursos expostos por `web_accessible_resources`.

O content script observa o player elegível e aplica estilos reversíveis após confirmação do worker. O popup envia pedidos versionados de leitura e alteração da preferência, sem acessar armazenamento diretamente. O worker grava apenas esses dados locais e pode solicitar tela cheia da janela ativa; não há transmissão de dados, analytics, servidor ou execução remota.

O runner E2E atual consegue abrir a página empacotada do popup para validar a interface, mas não reproduz o remetente de um popup aberto pela ação do navegador; a troca real de preferência permanece coberta por testes unitários do contrato e requer aceitação manual no Chrome.

## Distribuição e privacidade

Distribuição local para desenvolvimento. Política de privacidade definitiva, URL pública, nome do publicador, contato, regiões e visibilidade: pendentes. Não inferir dados pessoais. Sem coleta, analytics, servidor ou execução remota na implementação atual.

## Histórico

| Versão | Entrega                                                 | Situação           |
| ------ | ------------------------------------------------------- | ------------------ |
| 0.1.0  | Fundação, preferência, fluxo integrado e E2E controlado | Local, não enviada |

## Pendências

Funcionalidades do produto, aceitação Mac/Windows, assets, licença do código próprio e textos finais. Não houve submissão ou revisão da loja.
