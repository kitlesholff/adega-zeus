# Passo 1 — Fundação e segurança

Não execute os arquivos fora desta ordem.

1. Execute `schema.sql` no SQL Editor do novo projeto.
2. Execute `01-restringir-admin.sql`.
3. Crie o usuário em **Authentication → Users → Add user → Create new user**.
4. Vincule o UUID desse usuário à tabela privada de administradores com o comando fornecido durante a validação assistida.
5. Execute, na ordem, `02-criar-saidas.sql` até `14-caixinhas-produtos.sql`.
6. Execute as consultas de validação antes de conectar o site ao projeto.

## Modelo de autorização

- `anon`: pode consultar apenas produtos marcados como disponíveis e executar a criação validada de pedidos.
- `authenticated` sem vínculo administrativo: não acessa catálogo privado, pedidos, caixa ou imagens administrativas.
- administrador cadastrado em `private.admin_users`: recebe as permissões operacionais por RLS.
- chaves `secret` e `service_role`: nunca são usadas pelo site.

O projeto web deve receber somente a URL do projeto e uma chave `publishable` (`sb_publishable_...`).
