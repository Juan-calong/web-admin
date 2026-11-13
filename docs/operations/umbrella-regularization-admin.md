# Admin — regularização do ORD-FPY047

Depende do backend PR #42 com os controles P0 publicados previamente. Não alterar
ENV, Worker/P3 ou flags globais. Sessão ADMIN existente; nenhuma cópia de Bearer.

1. Após infraestrutura privada autorizada e validada, anexar documento da unidade
   vendida/separada/entregue deste pedido (60 ml / GTIN 0631430443749).
2. Abrir o documento pela API autenticada. Conferir conteúdo e marcar a declaração
   precisa. Aprovar a versão/hash aberta. Um anexo, PDF válido ou catálogo não bastam.
3. Anexar, abrir e revisar separadamente evidência da empresa da conta Bling autenticada,
   informando o CNPJ exibido. Não incluir tokens, senhas ou credenciais no documento.
   Backend compara emitente/configuração e vincula a revisão à conexão OAuth atual.
4. Revisar catálogo e aprovar regularização por cinco minutos. A API decide associação
   ou criação; operador não fornece ID remoto. Confirmar execução uma vez.
5. Preparar pedido regularizado e seguir aprovações fiscais existentes, começando por
   Criar venda. Troca de documento/conta ou qualquer gate pendente bloqueia.

Timeout: atualizar e clicar Reconciliar produto por leitura. A confirmação deixa
claro que não haverá nova criação nem repetição. API resolve somente causa comprovada,
informa conta liberada ou ainda bloqueada e o painel refaz o GET. Outra incerteza
mantém bloqueio. Repetição automática de POST/401 nunca ocorre.

Renovação OAuth invalida a revisão de conexão conservadoramente: nova evidência da
mesma empresa pode ser anexada/revisada mesmo bloqueada para permitir recuperação
por leitura. Não repetir a criação. Metadados e arquivos privados só passam por
rotas administrativas específicas; documentos abrem em blob local/sandbox e a URL
é revogada ao trocar/sair. Não há URL pública, token em query ou armazenamento local
persistente de documento/token.

Retenção, backup, chave e provider privados ainda precisam ser autorizados/verificados;
nenhuma configuração ou infraestrutura foi alterada por este trabalho. Sem essas
condições, o backend fecha upload e regularização. Teste visual autenticado ainda
pendente; testes locais usam SSR e HTTP simulado, sem provocar UNKNOWN real.

Validação final Node 22.23.2: 10 testes de client/evidência, 9 SSR e 52 regressões
fiscais/autenticação = 71 aprovados, zero falhas. TypeScript, lint direcionado e
diff-check PASS. Nenhum teste visual autenticado ou operação externa real realizado.

O backend PR #42 usa 18 cenários agrupados em quatro configurações PostgreSQL 16.14,
com recuperação causal/rollback e sem duplicidade. Isso não certifica automaticamente
o provider privado nem os documentos reais. Não ativar/publicar o fluxo operacional
antes das pendências externas e aprovações registradas no PR #42.
