# Emissão fiscal supervisionada no Admin

Escopo: tela Fiscal / Bling do pedido. Backend de referência:
c7fbec21c331a825beaff8f3016e553a965714c0 + extensão READ ONLY `individualBinding`
do GET de workflow, em https://github.com/Juan-calong/ecommerce-api/pull/39. Publicar o backend antes
deste frontend. Nenhuma alteração de CORS, gates, banco, Worker ou documento fiscal.

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
- O GET administrativo de workflow retorna `individualBinding` com
  orderId/documentId/automationId somente quando as relações persistidas coincidem.
  O Admin exige o mesmo pedido/documento lido no GET fiscal. IDs antigos da aba
  são descartados e não substituem o vínculo do servidor. Aprovações ficam em memória.
- Automações preparadas fora desta aba são recuperadas apenas pelo GET, inclusive
  após recarga. Nenhum POST de preparação serve para descobrir IDs, e não há campo
  para IDs do operador. Backend antigo ou vínculo divergente bloqueia a execução.
- Uma resposta perdida de preparação só é reconciliada se o GET provar vínculo,
  documento NOT_CREATED sem venda/NF-e e automação QUEUED sem processamento ou
  reconciliação. Isso libera a próxima etapa, nunca repete a preparação.
- Timeout/resultado incerto mantém um marcador sem credenciais na sessão e bloqueia
  novos POSTs. Uma leitura que prove a etapa concluída pode liberar a próxima etapa;
  UNKNOWN/reconciliação no servidor continua bloqueando tudo. Perda da resposta de
  aprovação ou sincronização sem prova conclusiva exige revisão assistida.
- Documento arquivado apenas com storage key e sem URL utilizável não é baixado
  novamente para abrir. O bloqueio fica explícito; exige link de leitura autorizado.
- Persistem todos os gates e pendências fiscais/logísticas. Worker e P3 ficam desligados.

## Validação local

Node 22.23.2, dependências locais existentes, sem chamadas fiscais externas.
40 testes direcionados aprovados, zero falhas/skips, em execuções individuais:
- 30: política fiscal, vínculos, concorrência, timeout e recuperação pelo GET.
- 3: authStore e cliente HTTP real com adaptador simulado; POST fiscal 401 sem
  refresh/replay, login/refresh/logout e módulo novo sem token após recarga simulada.
- 3: adaptador GET real, comparação pedido/documento e compatibilidade fail-closed
  com backend antigo.
- 4: renderização SSR, aprovação expirada, NF-e 395 autorizada e arquivos existentes.

Executar cada arquivo com `node --import ./scripts/test-admin-loader.mjs ARQUIVO`:
`src/lib/supervisedFiscal.test.mjs`, `src/lib/auth.test.mjs`,
`src/lib/supervisedFiscalApi.test.mjs`,
`src/components/admin/SupervisedFiscalActions.test.mjs`.
TypeScript: `tsc --noEmit --incremental false`; lint dos arquivos afetados e
`git diff --check` aprovados. Nenhum build de produção ou operação fiscal real.

## Bloqueio de merge e validação visual pendente

NO-GO para merge: não há sessão de navegador autenticada conectada às ferramentas.
Os testes HTTP simulados e SSR não comprovam cookies reais, CORS ou navegação.
Após publicar o backend mediante autorização própria, validar no Admin:
1. Login ADMIN legítimo; token ausente do localStorage/sessionStorage.
2. Recarga da página restaura a sessão por cookie, sem copiar Bearer.
3. Logout encerra a sessão e impede acesso; recarga não recupera sessão encerrada.
4. Buriti ORD-L3F0HN mostra NF-e 395 AUTHORIZED e arquivos, sem criar/reenviar.
5. Vínculo incompleto recupera pelo GET; ORD-AO6TTY continua bloqueado.
6. Nenhuma ação fiscal é disparada por login, recarga ou logout.

Os cenários de 401 fiscal e timeout são simulados localmente, sem provocar
emissão real para testar falhas. Merge e publicação dependem dessa validação visual;
este patch não os executa nem ativa Worker/P3/gates.

## Correção da sessão após F5

Reprodução local do corpo real do AuthGuard com agendamento controlado de efeitos:
setup/cleanup/setup emitia dois POSTs /auth/refresh; um efeito descartado ainda
podia limpar a sessão e redirecionar. O App Router habilita Strict Mode por padrão
no desenvolvimento. O backend publicado rotaciona o refresh token e trata reuse
como motivo para revogar as sessões. Isso comprova a corrida possível, não a
causa exclusiva do incidente no Chrome sem o Network daquela execução.

AuthGuard e interceptor agora usam o mesmo single-flight por contexto JavaScript.
Efeitos desmontados não alteram estado/navegação após a espera. Uma geração de
sessão, somente em memória, impede resposta atrasada de repor o access token ou
apagar um login posterior após clearAll/clearAccessToken. Cookies, backend,
ENVs e política skipAuthRetry dos POSTs fiscais permanecem iguais.

8 testes novos aprovados, além dos 40 anteriores, sem falhas/skips. Os novos
simulam login com token em memória, F5 e recargas consecutivas concluídas,
setup/cleanup/setup, refresh junto de reads expirados, falha após desmontagem,
logout e recarga após logout. Comando adicional:
`node --experimental-test-module-mocks --import ./scripts/test-admin-loader.mjs src/components/__test__/AuthGuard.session.test.mjs`.
O mock controla hooks/navegação e HTTP, sem substituir o corpo do AuthGuard.
Não é um teste visual nem comprova a persistência real do cookie no Chrome.

Repetir visualmente no localhost: login, um F5, dois F5 após cada carregamento,
logout e F5. O single-flight não coordena abas ou páginas diferentes nem resolve
uma navegação interrompida enquanto um refresh anterior ainda é processado.
Se falhar, anotar apenas quantidade de refreshes, status HTTP e erro curto:
`Sem refresh token` distingue ausência do cookie de `Refresh reuse detectado`.
No DevTools, conferir somente presença e atributos de rt e motivo de bloqueio em
Network/Cookies ou Issues, sem copiar valores, headers, HAR, senhas ou tokens.
O backend usa HttpOnly/Secure/SameSite=None/Path=/auth em production e o cliente
usa withCredentials. Restrições de cookies de terceiros podem impedir envio;
não alterar proteções do Chrome, CORS ou atributos do cookie para mascarar isso.

Mantido NO-GO para merge até o reteste visual e a publicação prévia do backend #39.

## Atualização mínima das dependências de runtime

Base da correção: 8263b77335ff7f01931d816100dde136b75c1335.
Next 16.2.4 -> 16.4.1; Axios 1.15.2 -> 1.20.0;
eslint-config-next alinhado em 16.4.1. São as únicas três declarações alteradas.
React/React DOM 19.2.3 e o código fiscal/autenticação permanecem inalterados.

Transitivos corrigidos no lockfile: sharp 0.35.5 (libvips 8.18.7/librsvg 2.63.2),
follow-redirects 1.16.3, form-data 4.0.6, PostCSS 8.5.23, nanoid 3.3.20,
source-map-js 1.2.2, baseline-browser-mapping 2.11.37 e fflate 0.8.3.
As demais mudanças pertencem à árvore desses pacotes atualizados, incluindo
binários opcionais por plataforma. Sem audit fix, force ou atualização geral.

Fontes: https://github.com/vercel/next.js/releases/tag/v16.4.1,
https://github.com/advisories/GHSA-2464-fhr4-w9xw,
https://github.com/advisories/GHSA-wq5f-xc86-pv6w e
https://github.com/axios/axios/releases/tag/v1.20.0.

Validação com Node 22.23.2, instalação própria do worktree:
- npm ci: aprovado; nenhum grupo de secrets ou arquivo ENV utilizado.
- npm run build e TypeScript standalone: aprovados.
- 48 testes direcionados: aprovados, zero falhas/skips (sem somar repetições).
- Lint do escopo: zero erros, duas advertências da nova regra de navegação
  sobre código preexistente.
- npm run lint completo: falhou com 33 erros; comparação com eslint-config-next
  16.2.4 preservado confirmou os mesmos 33 erros, sem nenhum erro novo.
  Estão em telas fora deste patch; não foram corrigidos nem desabilitados.
- npm audit --omit=dev: de 1 crítica/7 altas/2 moderadas para zero vulnerabilidades,
  exit code 0. A árvore incluindo desenvolvimento ainda reporta quatro altas;
  não representa o resultado de runtime e não foi ampliada esta correção.
- npm ci avisou que o postinstall de unrs-resolver não estava autorizado;
  não houve aprovação de script. Build e lint do escopo funcionaram mesmo assim.

A compatibilidade de login/refresh e tela fiscal foi verificada pelos 48 testes
locais simulados existentes. GET anônimo local de /login retornou 200; a página
usa Suspense e a hidratação do formulário depende do navegador. Nenhuma sessão
real, preview sinalizado, operação fiscal ou backend de produção foi acessado.
Nenhum gate, ENV, dependência do backend, Worker ou cadastro fiscal foi alterado.

Correção de segurança validada. O lint global não está verde e precisa de
tratamento ou aceitação explícita da dívida preexistente antes de declarar a
validação integral para merge. Não considerar somente o sucesso do build.
