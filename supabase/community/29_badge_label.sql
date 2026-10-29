begin;
-- Preserve existing ownership; only the visible name changes.
update public.shop_catalog set name='First Responder badge' where sku='goose_badge';
commit;
