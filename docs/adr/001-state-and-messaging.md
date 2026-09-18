# ADR 001 — Estado, identidade e mensagens versionadas

**Status:** aceito em 18/09/2026.

## Contexto

O worker é efêmero; popup e content script podem responder depois de uma navegação. A página do YouTube não é fonte confiável para ações privilegiadas e a saída manual do usuário deve sobreviver a uma recarga do mesmo vídeo.

## Decisão

1. Mensagens JSON versionadas têm envelope fechado, limite de 16 KiB e erros estruturados.
2. `requestId` correlaciona mensagens; `operationId` torna a intenção idempotente. IDs e relógio pertencem às bordas, não ao domínio.
3. Aba, janela e documento vêm de `MessageSender`; o content script precisa ser do frame principal do YouTube e o popup precisa ser a página empacotada.
4. Documento usa geração de navegação; vídeo usa geração de visualização. A → B → A é novo vídeo, mas a recarga que confirma o mesmo vídeo preserva Esc.
5. Preferência vive em `storage.local`; sessão e operações incompletas em `storage.session`, com efeitos concluídos e pendentes para reconciliação.
6. Falha de validação devolve erro e nenhum efeito; ela não consegue alterar uma janela.

## Consequências

Slices posteriores compartilham uma fronteira verificável e descartam respostas velhas antes de tocar DOM ou janelas. O adaptador Chrome terá de manter a geração de navegação confirmada e persistir intenção antes dos efeitos. Mudanças de contrato exigem proposta explícita, atualização deste ADR e novos testes.

## Alternativas descartadas

- Aceitar IDs da página, que permite forjar aba, janela ou documento.
- Chavear Esc apenas por `documentId`, perdendo a supressão na recarga.
- Chavear Esc apenas por ID de vídeo, sem distinguir A → B → A.
- Guardar operações em variáveis do worker, que somem quando ele é suspenso.
- Aceitar formato sem versão ou chaves abertas, ocultando incompatibilidades.
