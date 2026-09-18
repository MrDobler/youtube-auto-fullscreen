# Contratos executáveis (S01)

Este documento é a fronteira das slices S02–S06. A implementação executável está em `src/shared/contracts.js`; ela não acessa DOM, `chrome.*`, armazenamento, relógio ou aleatoriedade.

## Regras imutáveis

- Protocolo e registros de armazenamento usam versão `1`; versões e tipos desconhecidos são rejeitados.
- Toda mensagem tem `requestId`. Mensagens que iniciam ou confirmam uma operação também têm `operationId`. As bordas geram esses valores; o domínio só os recebe.
- O payload JSON pode ter no máximo 16 KiB. A forma é fechada: chaves extras são rejeitadas em vez de criarem uma evolução silenciosa.
- Erros são `{ code, message, path }`. Entrada inválida equivale a `effects: []`; em especial, não pode alterar uma janela.
- A página nunca fornece `tabId`, `windowId`, `documentId` nem geração de navegação. A borda Chrome deriva esses dados de `MessageSender` e da navegação confirmada. Content scripts só são aceitos no frame principal do YouTube.
- O popup só é aceito quando o remetente é a própria extensão e sua URL é exatamente `chrome-extension://<extension-id>/popup/index.html`.

## Identidade e supressão

```js
const documentIdentity = {
  tabId: 17,
  windowId: 4,
  documentId: 'doc_7e39',
  navigationGeneration: 12,
};
const videoIdentity = {
  document: documentIdentity,
  videoId: 'dQw4w9WgXcQ',
  videoGeneration: 5,
};
```

`navigationGeneration` é monotônica por aba e nasce na borda na navegação confirmada. Uma mensagem de documento anterior não pode mudar o documento atual. `videoGeneration` muda apenas quando o domínio reconhece uma troca real de vídeo; notificações duplicadas não a alteram. A sequência A → B → A é uma nova visualização.

A supressão por Esc é `{ videoId, videoGeneration }` dentro da sessão da aba, não do documento. Quando uma recarga confirma o mesmo vídeo, o domínio preserva geração e supressão. Pausa, anúncio, troca de aba, troca de player e reinício do worker também não a liberam; nova troca real de vídeo ou reativação explícita no popup a liberam.

## Mensagens

Todas usam envelope JSON fechado:

```js
{ protocolVersion: 1, type: 'player:reported', requestId: 'req_001', payload: { videoId: 'dQw4w9WgXcQ', observationId: 3, reason: 'url-change' } }
```

| Tipo                    | Origem → destino | Payload                                                                                 |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| `player:reported`       | content → worker | vídeo, observação e motivo (`initial`, `url-change`, `player-replaced`, `state-change`) |
| `player:exit-requested` | content → worker | vídeo, observação e `reason: 'escape'`                                                  |
| `preference:get`        | popup → worker   | objeto vazio                                                                            |
| `preference:set`        | popup → worker   | `{ enabled: boolean }`                                                                  |
| `preference:result`     | worker → popup   | preferência e `operationId`                                                             |
| `presentation:apply`    | worker → content | `target: VideoIdentity` e `operationId`                                                 |
| `presentation:restore`  | worker → content | alvo, motivo e `operationId`                                                            |
| `presentation:result`   | content → worker | alvo, resultado e `operationId`                                                         |
| `operation:failed`      | worker → popup   | erro estruturado e `operationId`                                                        |

Exemplo de comando destinado ao documento correto:

```js
{ protocolVersion: 1, type: 'presentation:apply', requestId: 'req_002', operationId: 'op_009', payload: { target: videoIdentity } }
```

O adaptador envia esse comando com `chrome.tabs.sendMessage(tabId, message, { documentId })`. A confirmação é comparada a `DocumentIdentity` confiável do remetente. São inválidos, entre outros: versão `2`, tipo desconhecido, identidade de aba inserida no payload da página, payload acima de 16 KiB e confirmação de outro documento.

## Estado e recuperação

`PreferenceRecord`, armazenado isoladamente em `storage.local`:

```js
{ schemaVersion: 1, enabled: true, revision: 8 }
```

`SessionRecord`, armazenado isoladamente em `storage.session`:

```js
{
  schemaVersion: 1,
  tabs: {
    17: {
      document: documentIdentity,
      video: videoIdentity,
      suppression: { videoId: 'dQw4w9WgXcQ', videoGeneration: 5 },
      operations: [{ operationId: 'op_009', kind: 'presentation:apply', target: videoIdentity, createdAtEpochMs: 1760000000000, completedEffects: ['storage:write-session'], pendingEffects: ['content:send'] }],
    },
  },
}
```

As áreas não são uma transação. Ao acordar, o worker valida cada registro separadamente, conserva a preferência válida e reconcilia operações pendentes. Uma intenção é persistida antes de janela/apresentação; `completedEffects` e `pendingEffects` tornam resultados parciais recuperáveis e idempotentes pelo mesmo `operationId`.

## Transição, efeitos e adaptadores

S02 implementará `transition(state, event) => { state, effects }`. Os efeitos válidos são `storage:write-preference`, `storage:write-session`, `window:enter-fullscreen`, `window:restore`, `content:send` e `popup:reply`. Todo efeito que muda janela ou apresentação carrega `operationId`.

S03 implementará adaptadores que retornam `{ ok: true, value }` ou `{ ok: false, error }`: contexto e geração de navegação confiáveis, janelas com restauração apenas de alteração própria, preferência/sessão separadas e mensagens direcionadas ao `documentId` exato. As bordas injetáveis fornecem IDs e relógio.

S04 exporá `mount`, `apply`, `restore` e `dispose` idempotentes; `dispose` remove listeners, observers e estilos próprios. S05 usa exclusivamente as mensagens de preferência deste documento. Alterações futuras exigem atualizar contrato, ADR e testes de compatibilidade.
