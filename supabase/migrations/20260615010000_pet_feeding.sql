-- 寵物餵食 / 好感度(依賴 #三 商城的 type=food 商品)
-- 食物是消耗品,用 inventory 記數量;裝扮類仍用 user_items(一次擁有)。
-- 買食物 / 餵食都走 security definer RPC,保證原子性、防止前端竄改數量或負金幣。

alter table public.profiles
  add column if not exists pet_affection int not null default 0,
  add column if not exists pet_fed_at timestamptz;

create table if not exists public.inventory (
  user_id uuid not null references auth.users on delete cascade,
  item_key text not null,
  qty int not null default 0,
  primary key (user_id, item_key)
);
alter table public.inventory enable row level security;
-- 只開讀(寫入一律走 RPC,前端不能直接改數量)
drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select using (auth.uid() = user_id);

-- 買食物:檢查商品有效 + 金幣足夠 → 扣金幣、庫存 +1(原子)
create or replace function public.buy_food(p_key text)
returns table(coins int, qty int)
language plpgsql security definer set search_path = public as $$
declare v_price int; v_active boolean; v_type text; v_coins int; v_qty int;
begin
  select price, active, type into v_price, v_active, v_type from shop_items where key = p_key;
  if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if v_type <> 'food' then raise exception 'NOT_FOOD'; end if;
  if not v_active then raise exception 'INACTIVE'; end if;

  select profiles.coins into v_coins from profiles where id = auth.uid() for update;
  if v_coins is null then raise exception 'NO_PROFILE'; end if;
  if v_coins < v_price then raise exception 'NOT_ENOUGH_COINS'; end if;

  update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
  insert into inventory(user_id, item_key, qty) values (auth.uid(), p_key, 1)
    on conflict (user_id, item_key) do update set qty = inventory.qty + 1
    returning inventory.qty into v_qty;
  return query select v_coins, v_qty;
end; $$;
revoke all on function public.buy_food(text) from anon;
grant execute on function public.buy_food(text) to authenticated;

-- 餵食:檢查有庫存 → 庫存 -1、好感度 += 食物 value(原子)
create or replace function public.feed_pet(p_key text)
returns table(affection int, qty int)
language plpgsql security definer set search_path = public as $$
declare v_qty int; v_value int; v_aff int;
begin
  select coalesce(nullif(value, '')::int, 0) into v_value from shop_items where key = p_key and type = 'food';
  if v_value is null then raise exception 'NOT_FOOD'; end if;

  select inventory.qty into v_qty from inventory where user_id = auth.uid() and item_key = p_key for update;
  if v_qty is null or v_qty <= 0 then raise exception 'NO_FOOD'; end if;

  update inventory set qty = inventory.qty - 1 where user_id = auth.uid() and item_key = p_key returning inventory.qty into v_qty;
  update profiles set pet_affection = profiles.pet_affection + v_value, pet_fed_at = now()
    where id = auth.uid() returning profiles.pet_affection into v_aff;
  return query select v_aff, v_qty;
end; $$;
revoke all on function public.feed_pet(text) from anon;
grant execute on function public.feed_pet(text) to authenticated;
