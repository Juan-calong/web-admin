# Emissão fiscal supervisionada no Admin

Escopo: tela Fiscal / Bling do pedido. Backend de referência:
c7fbec21c331a825beaff8f3016e553a965714c0. Nenhuma alteração de backend,
CORS, gates, banco, Worker, emissão fiscal ou documento existente neste patch.

## Uso

1. Entrar pelo login administrativo existente e abrir os detalhes do pedido.
2. Atualizar a situação fiscal e conferir os impedimentos.
3. Confirmar a preparação individual, quando suportada pelo backend.
4. Para cada etapa, solicitar aprovação e confirmar separadamente sua execução.
5. O envio à SEFAZ tem confirmação explícita própria. A NF-e autorizada nunca
   disponibiliza criação ou envio de substituição.
6. Sincronização e salvamento de DANFE/XML usam o mesmo mecanismo individual.
   Links HTTPS de documentos existentes podem ser abertos sem novo transporte.

GETs: fiscal-workflow e fiscal do pedido. POSTs: somente individual/prepare,
approvals e approvals/:approvalId/execute. Todos os POSTs usam skipAuthRetry=true,
sem retries no cliente ou execução automática em efeitos/refetch.
A aprovação deve estar dentro do prazo e continuar anunciada como válida pela
projeção do servidor imediatamente antes do POST de execução.
O servidor continua responsável por ADMIN ativo/verificado/escopo, revisão,
snapshot, gates, geração, locks/fencing, consumo único e idempotência.
Os botões fiscais genéricos/reprocessamento foram substituídos nesta tela.

## Autenticação

O mesmo authStore e cliente HTTP são reutilizados. Access token somente em memória;
a chave legada accessToken é removida do localStorage. Login, refresh por cookie
já existente, logout e CORS não foram substituídos. Logs brutos do login foram
removidos porque um AxiosError pode conter cabeçalhos/corpo de autenticação.
Na recarga, AuthGuard utiliza o refresh por cookie que já existia.
Não há campo para colar Bearer, IDs de aprovação ou hashes fiscais.

## Limites explícitos e recuperação

- A preparação publicada é limitada a Buriti ORD-L3F0HN e ao caso histórico
  ORD-FPY047. Outros pedidos não ganham autorização pelo frontend.
- ORD-AO6TTY não possui contrato de preparação individual nesta revisão da API.
- Os GETs publicados não retornam automationId. O Admin guarda somente o vínculo
  orderId/documentId/automationId recebido da preparação no sessionStorage da aba.
  Esse vínculo nunca substitui validação no servidor. Aprovações ficam em memória.
- Uma automação criada fora desta interface/aba sem vínculo recuperável fica
  bloqueada. Não se chama prepare novamente para descobrir IDs e não se solicita
  entrada manual. Melhoria futura mínima: expor IDs vinculados em uma projeção GET
  autenticada já existente; não foi criado endpoint nem alterado o backend aqui.
- Timeout/resultado incerto mantém um marcador sem credenciais na sessão e bloqueia
  novos POSTs. Uma leitura que prove a etapa concluída pode liberar a próxima etapa;
  UNKNOWN/reconciliação no servidor continua bloqueando tudo. Perda da resposta de
  preparação/aprovação ou sincronização sem prova conclusiva exige revisão assistida.
- Documento arquivado apenas com storage key e sem URL utilizável não é baixado
  novamente para abrir. O bloqueio fica explícito; exige link de leitura autorizado.
- Persistem todos os gates e pendências fiscais/logísticas. Worker e P3 ficam desligados.

## Validação local

Node 22.23.2, dependências locais existentes, sem chamadas fiscais externas.
30 testes direcionados aprovados, zero falhas/skips. Testes de autenticação e 401 sem refresh/replay fiscal, estados, preparação,
aprovação expirada/stale, single-flight, timeout, arquivos, NF-e autorizada e SSR.
Comando: node --import ./scripts/test-admin-loader.mjs --test
src/lib/supervisedFiscal.test.mjs src/lib/auth.test.mjs
src/components/admin/SupervisedFiscalActions.test.mjs
TypeScript: tsc --noEmit --incremental false. Lint somente dos arquivos afetados.
Não houve build de produção, teste de navegador autenticado ou emissão real.
Antes do merge/publicação, revisar login/logout/recarga na interface e confirmar
os limites de retomada acima. Publicação e operações reais exigem autorização própria.
