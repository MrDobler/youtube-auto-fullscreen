# Chrome Web Store — preparação

Atualizado em 18/09/2026. Estado: desenvolvimento S00; não pronto para submissão.

## Listing

Nome: YouTube Auto Fullscreen. Versão local: 0.1.0. Descrição atual: base de desenvolvimento da extensão. Propósito planejado: abrir vídeos do YouTube automaticamente em tela cheia, respeitando saída manual e preferência global. Descrição comercial, categoria, ícones e screenshots serão preparados após implementação e validação.

## Permissões e acesso

Nenhuma permissão de API solicitada na S00. Content scripts limitados a `https://youtube.com/*` e `https://www.youtube.com/*` para verificar a inicialização da extensão nessas páginas. Não há `host_permissions`, `externally_connectable` ou recursos expostos por `web_accessible_resources`.

O content script apenas consulta um status local do worker e registra uma mensagem fixa no console. A S00 não lê conteúdo da página, não persiste dados e não transmite dados. O popup apresenta o resultado da mesma consulta. Atualizar justificativas quando funcionalidades e acesso forem adicionados.

## Distribuição e privacidade

Distribuição local para desenvolvimento. Política de privacidade definitiva, URL pública, nome do publicador, contato, regiões e visibilidade: pendentes. Não inferir dados pessoais. Sem coleta, analytics, servidor ou execução remota na implementação atual.

## Histórico

| Versão | Entrega                                 | Situação           |
| ------ | --------------------------------------- | ------------------ |
| 0.1.0  | Fundação e verificação de inicialização | Local, não enviada |

## Pendências

Funcionalidades do produto, aceitação Mac/Windows, assets, licença do código próprio e textos finais. Não houve submissão ou revisão da loja.
