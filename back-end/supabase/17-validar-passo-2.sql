-- Validação somente de leitura do catálogo vazio e do armazenamento de imagens.
-- Todos os itens devem retornar OK.
with checks(ordem, verificacao, aprovado, detalhe) as (
  values
    (1, 'Catálogo começa vazio',
      (select count(*) = 0 from public.products),
      'Nenhum produto fictício deve permanecer'),

    (2, 'Categorias demonstrativas removidas',
      (select count(*) = 0 from public.product_categories),
      'As categorias serão criadas quando existirem produtos reais'),

    (3, 'Bucket aceita somente imagens previstas',
      exists (
        select 1 from storage.buckets
        where id = 'product-images'
          and public = true
          and file_size_limit = 5242880
          and allowed_mime_types @> array[
            'image/jpeg', 'image/png', 'image/webp', 'image/avif'
          ]::text[]
      ),
      'Bucket público, limite de 5 MB e formatos permitidos'),

    (4, 'Upload protegido por administrador',
      exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'admin envia imagens de produtos'
          and cmd = 'INSERT' and 'authenticated' = any(roles)
      ),
      'Somente authenticated autorizado pode enviar arquivos'),

    (5, 'Exclusão de imagens protegida',
      exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'admin exclui imagens de produtos'
          and cmd = 'DELETE' and 'authenticated' = any(roles)
      ),
      'Visitantes não podem remover arquivos'),

    (6, 'Catálogo administrável protegido',
      exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'products'
          and policyname = 'admin gerencia produtos'
          and 'authenticated' = any(roles)
          and coalesce(qual, '') like '%is_admin%'
          and coalesce(with_check, '') like '%is_admin%'
      ),
      'Alterações em produtos exigem usuário administrador'),

    (7, 'Categorias administráveis protegidas',
      (select count(*) = 3 from pg_policies
       where schemaname = 'public' and tablename = 'product_categories'
         and policyname in (
           'admin consulta categorias',
           'admin cadastra categorias',
           'admin exclui categorias'
         )
         and 'authenticated' = any(roles)),
      'Consulta, criação e exclusão exigem administrador')
)
select
  ordem,
  verificacao,
  case when aprovado then 'OK' else 'FALHA' end as resultado,
  detalhe
from checks
order by ordem;
