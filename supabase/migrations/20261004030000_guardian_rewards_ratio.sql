-- 2026-10-04:L2 家長帳號(guardian)+ 發放獎勵 + 現金券兌換比例改 100:1
--
-- ① 新角色 guardian(畫面顯示「家長(L2)」):只能看孩子的學習狀況、發放獎勵;
--    帳號/題目/商城設定/操作紀錄等管理功能仍只限 teacher / parent(L1)。
-- ② 發放獎勵 grant_reward():L1/L2 家長可以給孩子金幣,或任一件商城商品
--    (現金券/特權券 → 產生待兌現紀錄;道具 → 背包 +1;裝扮 → 直接擁有)。
--    每次發放都記在 reward_grants,孩子在商城看得到「誰送了什麼」。
-- ③ 現金券:使用者決定改成 100 金幣 = 1 元(50/100/500 元 = 5,000/10,000/50,000 金幣)。

-- ───── ① 角色 ─────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'parent', 'teacher', 'guardian'));

-- ───── ② 發放獎勵 ─────
create table if not exists public.reward_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,   -- 收到的孩子
  granted_by uuid,                                                -- 發放的家長
  kind text not null check (kind in ('coins', 'item')),
  item_key text,
  coins int not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists reward_grants_user_idx on public.reward_grants (user_id, created_at desc);
alter table public.reward_grants enable row level security;
drop policy if exists reward_grants_read on public.reward_grants;
create policy reward_grants_read on public.reward_grants for select
  using ((select auth.uid()) = user_id
         or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher', 'parent', 'guardian')));

create or replace function public.grant_reward(
  p_user uuid, p_kind text, p_item_key text default null, p_coins int default 0,
  p_note text default null, p_by uuid default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  is_service boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') = 'service_role';
  v_by uuid := coalesce(p_by, auth.uid());
  v_type text; v_value text; v_id bigint;
begin
  if not is_service and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('teacher', 'parent', 'guardian')
  ) then raise exception '需要家長權限'; end if;
  if not exists (select 1 from profiles where id = p_user and role = 'student') then raise exception 'NOT_STUDENT'; end if;

  if p_kind = 'coins' then
    if p_coins is null or p_coins < 1 or p_coins > 50000 then raise exception 'BAD_COINS'; end if;
    update profiles set coins = coins + p_coins where id = p_user;
  elsif p_kind = 'item' then
    select type, value into v_type, v_value from shop_items where key = p_item_key;
    if v_type is null then raise exception 'ITEM_NOT_FOUND'; end if;
    if v_type in ('voucher', 'privilege') then
      insert into voucher_redemptions(user_id, item_key, amount, coins)
        values (p_user, p_item_key, case when v_type = 'voucher' then v_value::int else 0 end, 0);
    elsif v_type in ('food', 'booster') then
      insert into inventory(user_id, item_key, qty) values (p_user, p_item_key, 1)
        on conflict (user_id, item_key) do update set qty = inventory.qty + 1;
    else
      insert into user_items(user_id, key) values (p_user, p_item_key) on conflict do nothing;
    end if;
    p_coins := 0;
  else
    raise exception 'BAD_KIND';
  end if;

  insert into reward_grants(user_id, granted_by, kind, item_key, coins, note)
    values (p_user, v_by, p_kind, case when p_kind = 'item' then p_item_key end, p_coins, nullif(trim(p_note), ''))
    returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.grant_reward(uuid, text, text, int, text, uuid) from public;
grant execute on function public.grant_reward(uuid, text, text, int, text, uuid) to authenticated, service_role;

-- 發放紀錄也進操作紀錄日誌
drop trigger if exists audit_reward_grants on public.reward_grants;
create trigger audit_reward_grants after insert or update or delete on public.reward_grants
  for each row execute function public.audit_trigger();

-- ───── ③ 現金券 100:1 ─────
update public.shop_items set price = 5000  where key = 'voucher_50';
update public.shop_items set price = 10000 where key = 'voucher_100';
update public.shop_items set price = 50000 where key = 'voucher_500';

-- ───── ④ 每日兌換上限 50 元(使用者決定)─────
-- 金幣可以一直賺、不封頂;限制的是「用金幣換現金券」:每人每天(台北時間)合計最多 50 元。
-- 家長發放的券(grant_reward,coins = 0)不算在內。上限只能換 50 元 → 100/500 元券先下架(商城管理可再上架)。
create or replace function public.voucher_daily_limit() returns int language sql immutable as $$ select 50 $$;

create or replace function public.voucher_redeemed_today(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from voucher_redemptions
   where user_id = p_user and status <> 'cancelled' and coins > 0
     and (created_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date;
$$;
revoke all on function public.voucher_redeemed_today(uuid) from public;
grant execute on function public.voucher_redeemed_today(uuid) to authenticated, service_role;

create or replace function public.buy_item(p_key text)
returns table(coins int, qty int)
language plpgsql security definer set search_path = public as $$
declare v_price int; v_active boolean; v_type text; v_value text; v_coins int; v_qty int; v_featured boolean;
begin
  select price, active, type, value into v_price, v_active, v_type, v_value from shop_items where key = p_key;
  if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not v_active then raise exception 'INACTIVE'; end if;
  if v_price <= 0 then raise exception 'FREE_ITEM'; end if;

  if v_type not in ('voucher', 'privilege') then
    v_featured := p_key in (select key from shop_featured_keys() key);
    if v_featured then v_price := ceil(v_price * 0.7)::int; end if;
  end if;

  if v_type = 'voucher' and voucher_redeemed_today(auth.uid()) + v_value::int > voucher_daily_limit() then
    raise exception 'DAILY_LIMIT';
  end if;

  select profiles.coins into v_coins from profiles where id = auth.uid() for update;
  if v_coins is null then raise exception 'NO_PROFILE'; end if;
  if v_coins < v_price then raise exception 'NOT_ENOUGH_COINS'; end if;

  if v_type in ('voucher', 'privilege') then
    update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
    insert into voucher_redemptions(user_id, item_key, amount, coins)
      values (auth.uid(), p_key, case when v_type = 'voucher' then v_value::int else 0 end, v_price);
    select count(*)::int into v_qty from voucher_redemptions where user_id = auth.uid() and status = 'pending';
  elsif v_type in ('food', 'booster') then
    update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
    insert into inventory(user_id, item_key, qty) values (auth.uid(), p_key, 1)
      on conflict (user_id, item_key) do update set qty = inventory.qty + 1
      returning inventory.qty into v_qty;
  else
    if exists (select 1 from user_items where user_id = auth.uid() and key = p_key) then
      raise exception 'ALREADY_OWNED';
    end if;
    update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
    insert into user_items(user_id, key) values (auth.uid(), p_key) on conflict do nothing;
    v_qty := 1;
  end if;
  return query select v_coins, v_qty;
end; $$;
revoke all on function public.buy_item(text) from anon;
grant execute on function public.buy_item(text) to authenticated;

update public.shop_items set active = false where key in ('voucher_100', 'voucher_500');
