-- 管理者對玩家交易所的 moderation(Phase 3d):管理者可看全部上架、強制下架(退回賣家)。

create or replace function public.admin_get_market()
returns table(id bigint, item_key text, label text, item_type text, value text,
              price int, seller_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.item_key, si.label, si.type, si.value, l.price, p.nickname, l.created_at
  from market_listings l
  join shop_items si on si.key = l.item_key
  join profiles p on p.id = l.seller
  where l.status = 'active'
    and exists (select 1 from profiles me where me.id = auth.uid() and me.role in ('teacher','parent'))
  order by l.created_at desc;
$$;
revoke all on function public.admin_get_market() from anon;
grant execute on function public.admin_get_market() to authenticated;

create or replace function public.admin_remove_listing(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_seller uuid; v_status text; v_key text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role in ('teacher','parent')) then
    raise exception 'NOT_STAFF';
  end if;
  select seller, status, item_key into v_seller, v_status, v_key from market_listings where id = p_id for update;
  if v_seller is null then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;
  update market_listings set status = 'cancelled' where id = p_id;
  insert into user_items(user_id, key) values (v_seller, v_key) on conflict do nothing;  -- 退回賣家
end; $$;
revoke all on function public.admin_remove_listing(bigint) from anon;
grant execute on function public.admin_remove_listing(bigint) to authenticated;
