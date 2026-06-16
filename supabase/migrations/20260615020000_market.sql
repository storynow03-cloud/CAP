-- 玩家交易所(#四):玩家把自己擁有的裝扮(user_items 的 theme/frame)上架,別人用金幣買。
-- 一切金幣與擁有權轉移都走 security definer RPC(原子交易),前端不直接寫,杜絕競態/作弊。
-- 託管設計:上架時把道具從 user_items 移出(放進 listing),避免「一物多賣」或上架期間還能用/再上架。

create table if not exists public.market_listings (
  id bigint generated always as identity primary key,
  seller uuid not null references auth.users on delete cascade,
  item_key text not null,
  price int not null check (price > 0),
  status text not null default 'active',     -- active / sold / cancelled
  buyer uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
alter table public.market_listings enable row level security;
-- 大家可讀(逛市集);寫入一律走 RPC,不開 insert/update/delete policy
drop policy if exists "market readable" on public.market_listings;
create policy "market readable" on public.market_listings for select using (true);
create index if not exists market_active_idx on public.market_listings (status, created_at desc);

-- 上架:檢查擁有 + 可交易 → 託管(移出 user_items)+ 卸下裝備 + 建 listing
create or replace function public.create_listing(p_item_key text, p_price int)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_price is null or p_price <= 0 then raise exception 'BAD_PRICE'; end if;
  if not exists (select 1 from user_items where user_id = auth.uid() and key = p_item_key) then
    raise exception 'NOT_OWNED';
  end if;
  if not exists (select 1 from shop_items where key = p_item_key and type in ('theme','frame')) then
    raise exception 'NOT_TRADEABLE';
  end if;

  delete from user_items where user_id = auth.uid() and key = p_item_key;
  update profiles set equipped_theme = null where id = auth.uid() and equipped_theme = p_item_key;
  update profiles set equipped_frame = null where id = auth.uid() and equipped_frame = p_item_key;
  insert into market_listings(seller, item_key, price) values (auth.uid(), p_item_key, p_price)
    returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.create_listing(text, int) from anon;
grant execute on function public.create_listing(text, int) to authenticated;

-- 下架:只能下架自己的 active listing → 退回道具
create or replace function public.cancel_listing(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_seller uuid; v_status text; v_key text;
begin
  select seller, status, item_key into v_seller, v_status, v_key
    from market_listings where id = p_id for update;
  if v_seller is null then raise exception 'NOT_FOUND'; end if;
  if v_seller <> auth.uid() then raise exception 'NOT_SELLER'; end if;
  if v_status <> 'active' then raise exception 'NOT_ACTIVE'; end if;

  update market_listings set status = 'cancelled' where id = p_id;
  insert into user_items(user_id, key) values (auth.uid(), v_key) on conflict do nothing;
end; $$;
revoke all on function public.cancel_listing(bigint) from anon;
grant execute on function public.cancel_listing(bigint) to authenticated;

-- 購買:鎖 listing → 驗狀態/非自己/未擁有/金幣足 → 扣買方加賣方、移轉道具、標記售出(全原子)
create or replace function public.buy_listing(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_seller uuid; v_status text; v_price int; v_key text; v_coins int;
begin
  select seller, status, price, item_key into v_seller, v_status, v_price, v_key
    from market_listings where id = p_id for update;
  if v_seller is null then raise exception 'NOT_FOUND'; end if;
  if v_status <> 'active' then raise exception 'SOLD_OR_CANCELLED'; end if;
  if v_seller = auth.uid() then raise exception 'OWN_LISTING'; end if;
  if exists (select 1 from user_items where user_id = auth.uid() and key = v_key) then
    raise exception 'ALREADY_OWNED';
  end if;

  select profiles.coins into v_coins from profiles where id = auth.uid() for update;
  if v_coins < v_price then raise exception 'NOT_ENOUGH_COINS'; end if;

  update profiles set coins = profiles.coins - v_price where id = auth.uid();
  update profiles set coins = profiles.coins + v_price where id = v_seller;
  insert into user_items(user_id, key) values (auth.uid(), v_key) on conflict do nothing;
  update market_listings set status = 'sold', buyer = auth.uid(), sold_at = now() where id = p_id;
end; $$;
revoke all on function public.buy_listing(bigint) from anon;
grant execute on function public.buy_listing(bigint) to authenticated;

-- 逛市集:回傳所有 active listing(含道具外觀與賣家暱稱、是否為自己上架)
create or replace function public.get_market()
returns table(id bigint, item_key text, label text, item_type text, value text, price int,
              seller_name text, is_mine boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, l.item_key, si.label, si.type, si.value, l.price,
         p.nickname, l.seller = auth.uid(), l.created_at
  from market_listings l
  join shop_items si on si.key = l.item_key
  join profiles p on p.id = l.seller
  where l.status = 'active'
  order by l.created_at desc;
$$;
revoke all on function public.get_market() from anon;
grant execute on function public.get_market() to authenticated;
