-- 0208 (ภูม 2026-06-23): raise cart cap 151 → 10000 (customers order high-qty / low-CBM).
-- CREATE OR REPLACE the cart_items_cap() function only — the BEFORE INSERT trigger
-- binding from 0011_service_order.sql stays in place and re-points at the new body.
create or replace function public.cart_items_cap()
returns trigger as $$
declare
  cnt int;
begin
  if tg_op = 'INSERT' then
    select count(*) into cnt from public.cart_items where profile_id = new.profile_id;
    if cnt >= 10000 then
      raise exception 'cart cap reached (10000 items)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
