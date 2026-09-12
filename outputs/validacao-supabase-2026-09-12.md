# Validacao remota do Supabase - 12/09/2026

Projeto: qjluscdqavgwmooucwlf. Consultas GET com a chave publica da aplicacao; nenhuma mutacao.

Confirmado:
- Auth e catalogo respondem HTTP 200; URL e chave publica funcionam.
- Colunas de promocoes, kits, fardos, destaques e tipos de produto consultadas sem erro de schema.
- Consulta de produtos indisponiveis retornou zero linhas. Isoladamente, isso nao comprova a politica RLS se nao houver produtos indisponiveis no banco.
- Leitura anonima de orders, order_items, expenses, cash_closings, cash_sessions, cash_movements e cash_register_closings recusada: HTTP 401, SQLSTATE 42501.
- Consulta publica de categorias aceita.
- Login por email habilitado; confirmacao de email exigida.

Ponto de atencao:
- Cadastro publico habilitado (disable_signup=false). Como o aplicativo usa contas apenas para administracao, recomenda-se desabilitar Allow new users to sign up em Authentication. Isso preserva o login de usuarios existentes. Nao foi alterado nesta validacao.
- Fonte: https://supabase.com/docs/guides/auth/general-configuration

Ainda nao validado em producao:
- Vinculo de administrador, acesso de usuario comum, todas as politicas RLS, privilegios das funcoes, triggers e configuracao do bucket.
- URLs de redirecionamento do Auth e demais configuracoes administrativas.
- Nao ha conector Supabase nem navegador conectado nesta sessao para acessar o painel administrativo.

Proximo passo concreto: executar outputs/validar-supabase-producao.sql no SQL Editor e revisar as duas tabelas de resultados. A consulta e somente de leitura e nao exige apagar produtos nem movimentacoes reais.

Evidencias HTTP: supabase-public-checks-2026-09-12.json.
