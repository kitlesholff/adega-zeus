-- Remove somente os seis produtos demonstrativos instalados pelo schema inicial.
-- Não altera pedidos, usuários, caixa, imagens ou produtos cadastrados com outros IDs.
begin;

delete from public.products
where id in ('long-neck', 'pack-6', 'cola-2l', 'laranja-2l', 'agua-20l', 'energetico-duo');

delete from public.product_categories category
where category.name in ('Cervejas', 'Refrigerantes', 'Água', 'Energéticos')
  and not exists (
    select 1 from public.products product where product.category = category.name
  );

commit;

select
  (select count(*) from public.products
    where id in ('long-neck', 'pack-6', 'cola-2l', 'laranja-2l', 'agua-20l', 'energetico-duo')) as produtos_demonstrativos_restantes,
  (select count(*) from public.product_categories category
    where category.name in ('Cervejas', 'Refrigerantes', 'Água', 'Energéticos')
      and not exists (
        select 1 from public.products product where product.category = category.name
      )) as categorias_vazias_restantes;
