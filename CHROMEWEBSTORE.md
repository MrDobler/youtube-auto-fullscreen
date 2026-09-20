# Chrome Web Store — preparação

Atualizado em 20/09/2026. Estado: desenvolvimento S05/S06; não pronto para submissão.

## Listing

Nome: YouTube Auto Fullscreen. Versão local: 0.1.0. Descrição atual: base de desenvolvimento da extensão. Propósito planejado: abrir vídeos do YouTube automaticamente em tela cheia, respeitando saída manual e preferência global. A S05 entrega a interface acessível da preferência em pt-BR e inglês, mas a persistência e a restauração de janelas ainda aguardam a integração do worker. Descrição comercial, categoria, ícones e screenshots serão preparados após implementação e validação.

## Permissões e acesso

Nenhuma permissão de API solicitada na S00. Content scripts limitados a `https://youtube.com/*` e `https://www.youtube.com/*` para verificar a inicialização da extensão nessas páginas. Não há `host_permissions`, `externally_connectable` ou recursos expostos por `web_accessible_resources`.

O content script apenas consulta um status local do worker e registra uma mensagem fixa no console. O popup da S05 envia pedidos versionados de leitura e alteração da preferência, sem controlar janelas nem acessar armazenamento diretamente. Como o worker ainda não integrou a persistência, a extensão não grava dados nem transmite dados nesta etapa. A integração futura precisará declarar somente a permissão `storage` e justificar que ela mantém a preferência global no navegador; atualizar estas justificativas quando isso ocorrer.

## Distribuição e privacidade

Distribuição local para desenvolvimento. Política de privacidade definitiva, URL pública, nome do publicador, contato, regiões e visibilidade: pendentes. Não inferir dados pessoais. Sem coleta, analytics, servidor ou execução remota na implementação atual.

## Histórico

| Versão | Entrega                                             | Situação           |
| ------ | --------------------------------------------------- | ------------------ |
| 0.1.0  | Fundação, interface de preferência e E2E controlado | Local, não enviada |

## Pendências

Funcionalidades do produto, aceitação Mac/Windows, assets, licença do código próprio e textos finais. Não houve submissão ou revisão da loja.
