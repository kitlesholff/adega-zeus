# Ativar usuários com acesso a Pedidos e Caixa

A interface está implementada no projeto. Para funcionar na loja publicada, instale a migração e publique a Edge Function no mesmo projeto Supabase configurado em `front-end/js/config.js`.

## 1. Banco de dados

No SQL Editor, execute o conteúdo completo de `33-operadores-pedidos-caixa.sql`. A migração pressupõe as anteriores já aplicadas, incluindo a 32. Pode ser reexecutada e não apaga produtos, pedidos ou movimentações.

Seu usuário atual continua como administrador. Os operadores são cadastrados separadamente e não entram na lista de administradores.

## 2. Serviço de criação de contas

Em **Edge Functions**, crie a função **create-panel-operator** usando o editor do Supabase. Copie o conteúdo de `functions/create-panel-operator/index.ts` e publique.

Mantenha a verificação de JWT habilitada. O serviço também valida a sessão com Auth e consulta `is_admin()` antes de criar qualquer conta. As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas pelo ambiente das Edge Functions. Não copie a chave administrativa para o site.

Alternativa com Supabase CLI, a partir da pasta `back-end`:

```powershell
supabase functions deploy create-panel-operator --project-ref qjluscdqavgwmooucwlf
```

O CLI usa `back-end/supabase/config.toml` e a pasta `back-end/supabase/functions`.

## 3. Atualizar o site

Publique os arquivos atualizados de `front-end` pelo processo habitual de hospedagem. Entre com seu login atual e abra **Usuários**.

- Informe nome, e-mail e uma senha entre 12 e 128 caracteres.
- Clique em **Criar usuário**. Seu login permanece conectado.
- Entregue as credenciais ao operador por um canal adequado. O sistema não envia e-mails automaticamente.
- O operador entra na mesma página do painel e vê apenas **Pedidos** e **Caixa**.
- Use **Desativar acesso** ou **Reativar acesso** para controlar a equipe. A desativação preserva a conta e o histórico; novas operações são recusadas pelo banco. A interface verifica o acesso a cada atualização automática.

O perfil permite pedidos presenciais, confirmação e cancelamento de pedidos, consulta e movimentação do caixa, abertura, fechamento e histórico do caixa. O acesso ao catálogo é de leitura, necessário para montar pedidos. Gerenciamento de produtos, categorias, promoções, importação, usuários e reset continuam exclusivos do administrador.

O cadastro público do Auth pode permanecer desabilitado: a criação administrativa usa a API do servidor. Não é necessário abrir inscrições públicas.

## Verificação

1. Entre com seu usuário e crie um operador.
2. Em janela anônima, entre com o operador e confira as duas abas disponíveis.
3. Desative o acesso pelo administrador e confirme que o operador não consegue continuar realizando operações.

Os testes automatizados usam contas e bancos isolados. Nenhuma conta foi criada nem operação financeira realizada no Supabase de produção durante a implementação.

Referências oficiais:
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/functions/auth-legacy-jwt
