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
