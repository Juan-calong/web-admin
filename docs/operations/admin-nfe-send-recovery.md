# Recuperar envio incerto no Admin

## Escopo e plano

Integração exclusiva do endpoint do backend e361dbd, sem alteração de emissão,
login, CORS, flags, Worker ou P3. O GET fiscal-workflow já expõe
`automation.lastErrorCode` e `individualBinding` (orderId/documentId/automationId).
O frontend não declara a recuperação aprovada: apresenta uma solicitação por
leitura quando o servidor informa NFE_SEND_RECONCILIATION_PENDING e vínculo válido.

1. Testar sucesso, conta ainda bloqueada, evidência insuficiente, 401, timeout,
   erro e clique simultâneo com transporte simulado.
2. Adicionar método exclusivo no client existente: GET fresco antes do POST,
   nonce UUID/reviewRef, confirmação fixa e skipAuthRetry; nenhum retry automático.
3. Mostrar botão e confirmação na seção Fiscal/Bling, inclusive quando emissão
   está bloqueada. Manter decisões normais de emissão intactas.
4. Atualizar por GET após a tentativa e mostrar a decisão de bloqueio do backend.
5. Validar componentes, client HTTP real com adapter simulado, TypeScript, lint e
   diff-check. Abrir PR separado do web-admin, sem merge/deploy.

O nonce de recuperação pode ser guardado em sessionStorage, sem credenciais ou
permissões. Em resposta perdida, uma nova confirmação manual reutiliza a mesma
chave apenas para o vínculo novamente confirmado pelo GET; nunca usa IDs locais
como autoridade. Não existe POST disparado por montagem, refresh, 401 ou efeito.

## Comportamento entregue

Nos detalhes do pedido, no cartão **Fiscal / Bling — emissão supervisionada**,
a seção **Recuperação de envio incerto** aparece somente com o código retornado
pelo backend. Sem vínculo confiável, ambiente/autoridade compatível ou documento
existente, o botão fica desabilitado com explicação. Documento já AUTHORIZED com
marcador pendente ainda pode solicitar a reconciliação; isso não habilita reemissão.

O diálogo exige confirmação antes de qualquer POST. Um GET fresco valida o vínculo;
o servidor decide se as evidências permitem recuperar e liberar a causa do bloqueio.
O resultado distingue conta liberada de conta ainda bloqueada, sem confundir liberação
de reconciliação com abertura dos gates fiscais. Após sucesso ou erro, o painel refaz
o GET. Se o GET falhar, sinaliza o erro e bloqueia novas ações até leitura válida.

## Validação local

Node 22.23.2, somente dados sintéticos e transporte simulado:

- 15 testes de estado/client de recuperação.
- 3 testes do adapter HTTP existente: sucesso e leitura posterior, 401 sem replay,
  timeout sem replay.
- 3 testes de renderização da ação e avisos, ausência de marcador e bloqueio.
- 30 regressões do client fiscal, 3 do adapter GET, 4 de renderização fiscal
  e 3 de autenticação: **61 testes aprovados, zero falhas**.
- TypeScript (`tsc --noEmit --incremental false`), ESLint dos seis arquivos de
  código/teste alterados e `git diff --check`: PASS.
- `npm run lint` global: 33 erros e 21 avisos em arquivos não alterados pelo patch.
  Nenhuma supressão ou correção fora do escopo foi adicionada.

Os testes de componentes usam renderização estática e os testes HTTP executam o
client/interceptors reais com adapter simulado. Não substituem um teste visual
autenticado; nenhum cenário UNKNOWN foi provocado em produção. Não houve chamada
à API de produção ou ao Bling, nem alteração de backend, flags ou infraestrutura.

## Revisão e publicação

Depende do backend PR #41 já publicado (contrato conferido na revisão e361dbd).
Nenhuma extensão de GET ou mudança de backend é necessária. O PR do Admin deve ser
revisado antes de merge/publicação. Validar visualmente o diálogo e mensagens com
respostas simuladas; não gerar um UNKNOWN real para testar o botão.
