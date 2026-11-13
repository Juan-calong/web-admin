# ORD-FPY047 — regularização documental supervisionada

Depende da publicação anterior do PR backend `fix/umbrella-supervised-regularization`.
Não publicar esta UI contra o backend antigo. Não exige ENV nova, Worker, P3 ou
escritas fiscais globais; sessão ADMIN e escopo de pedidos existentes.

No cartão Fiscal/Bling do ORD-FPY047, somente:

1. Anexar PDF/JPEG/PNG até 256 KiB comprovando a unidade vendida/separada/entregue,
   vinculada ao pedido, com Umbrella 60 ml e GTIN 0631430443749. Catálogo não basta.
   Informar referência sem dados pessoais e confirmar revisão documental.
2. Registrar evidência complementar. Não é snapshot original da compra.
3. Revisar catálogo e aprovar regularização por cinco minutos. A API decide entre
   associação e criação, sem aceitar um ID remoto digitado pelo operador.
4. Conferir nome atual/proposto e executar uma vez a aprovação exibida. Corrige
   somente o nome para a descrição fiscal já conferida e associa o ID comprovado.
5. Preparar pedido regularizado. O GET fiscal normal recupera documentId/automationId;
   então continuam as aprovações normais, começando em Criar venda no Bling.

Em timeout, não repetir a criação. Atualizar e usar Reconciliar produto por leitura
quando o servidor mostrar UNKNOWN/SUCCEEDED. A reconciliação não cria produto, não
reescreve o histórico nem libera automaticamente a conta. Bloqueio causal restante
impede a preparação até revisão supervisionada separada.

POSTs usam skipAuthRetry; 401, timeout e erro não provocam replay. Há bloqueio de
clique concorrente e GET antes/depois de cada etapa. Não há emissão automática.

Validação local: transporte HTTP simulado, renderização estática, TypeScript e
lint direcionado. Teste visual autenticado ainda não executado. Nenhuma chamada de
produção, alteração de ENV ou operação fiscal real faz parte desta implementação.

Resultados registrados em Node 22.23.2: 10 testes novos (7 client HTTP + 3 SSR)
e 52 regressões direcionadas aprovados, zero falhas. Cobrem sessão/401 sem replay,
erro/timeout, clique simultâneo, binding, pedido distinto e bloqueio causal exibido.
TypeScript, ESLint dos cinco arquivos de código/teste alterados e diff-check: PASS.
Sem alterações de autenticação, dependências ou ENV. SSR não substitui teste visual.
