-- 2026-10-04:商城現金券 + 好友 PK 金幣對賭(即時同步對戰)
--
-- ① 現金券:50 / 100 / 500 元,金幣兌換比例 10:1(500 / 1,000 / 5,000 金幣)。
--    買了不是進背包,而是產生一筆「待發放」的兌換紀錄;家長在管理後台「現金券兌換」看到後
--    給孩子現金,再按「已發放」。不套用每日精選折扣(shop_featured_keys 只挑裝扮類)。
-- ② 好友 PK:
--    - 發起時可押金幣(0 = 友誼賽);押注 > 0 時對方要按「接受」並付出同樣金幣,雙方金幣先扣下保管。
--    - 雙方都進房間按「準備好了」→ 伺服器定一個共同開始時間,兩人同時看到題目;
--      作答中每答一題回報進度,畫面上即時看到對手答到第幾題、答對幾題。
--    - 都交卷後由資料庫結算:答對多的贏、同分比總時間;贏家拿走全部押注,平手各自退回。
--    - 結算與金幣移轉全部在資料庫函式裡做,前端不能直接改 duels(原本 for all 的 policy 改成只能讀)。

-- ───────────── ① 現金券 ─────────────
create table if not exists public.voucher_redemptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  item_key text not null,
  amount int not null,          -- 新台幣
  coins int not null,           -- 花掉的金幣
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid
);
create index if not exists voucher_redemptions_status_idx on public.voucher_redemptions (status, created_at desc);
alter table public.voucher_redemptions enable row level security;
drop policy if exists voucher_own_read on public.voucher_redemptions;
create policy voucher_own_read on public.voucher_redemptions for select
  using ((select auth.uid()) = user_id
         or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher','parent')));

insert into public.shop_categories (name, type, sort)
select '現金券', 'voucher', 0
where not exists (select 1 from public.shop_categories where type = 'voucher');

insert into public.shop_items (category_id, key, label, type, value, price, sort)
select c.id, x.key, x.label, 'voucher', x.value, x.price, x.sort
from (values
  ('voucher_50',  '50 元現金券',  '50',  500,  1),
  ('voucher_100', '100 元現金券', '100', 1000, 2),
  ('voucher_500', '500 元現金券', '500', 5000, 3)
) as x(key, label, value, price, sort)
join public.shop_categories c on c.type = 'voucher'
on conflict (key) do nothing;

-- 特權券(type privilege):兌換後由爸媽兌現,流程跟現金券一樣(產生待兌現紀錄,amount = 0)。
-- 這些牽涉家規,預設「下架」(active = false),家長在「商城管理」啟用想要的項目才會出現。
insert into public.shop_categories (name, type, sort)
select '特權券', 'privilege', 0
where not exists (select 1 from public.shop_categories where type = 'privilege');

insert into public.shop_items (category_id, key, label, type, value, price, sort, active)
select c.id, x.key, x.label, 'privilege', x.value, x.price, x.sort, false
from (values
  ('priv_dinner',   '🍜 晚餐我決定',       '🍜', 600,  1),
  ('priv_game30',   '🎮 多玩 30 分鐘',     '🎮', 800,  2),
  ('priv_chore',    '🧹 免做家事一次',     '🧹', 500,  3),
  ('priv_latebed',  '🌙 週末晚睡 30 分鐘', '🌙', 700,  4),
  ('priv_outing',   '🎡 週末出遊我挑地點', '🎡', 3000, 5)
) as x(key, label, value, price, sort)
join public.shop_categories c on c.type = 'privilege'
on conflict (key) do nothing;

-- 新的會考主題稱號、頭像框(純裝扮,直接上架)
insert into public.shop_items (category_id, key, label, type, value, price, rarity, sort)
select c.id, x.key, x.label, x.type, x.value, x.price, x.rarity, x.sort
from (values
  ('title_aplus',    '🎯 A++ 預備生', 'title', '🎯 A++ 預備生', 220, 'rare', 10),
  ('title_mathking', '🧮 數學魔法師', 'title', '🧮 數學魔法師', 300, 'epic', 11),
  ('title_bossbane', '⚔️ 魔王剋星',   'title', '⚔️ 魔王剋星',   360, 'epic', 12),
  ('title_capgod',   '🏆 會考戰神',   'title', '🏆 會考戰神',   800, 'legendary', 13),
  ('frame_fire',     '火焰框',        'frame', '🔥',            260, 'rare', 10),
  ('frame_rocket',   '火箭框',        'frame', '🚀',            320, 'epic', 11)
) as x(key, label, type, value, price, rarity, sort)
join public.shop_categories c on c.type = x.type
on conflict (key) do nothing;

-- 購買:現金券 → 產生待發放紀錄(不折扣);其他維持原本邏輯
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

-- 家長處理兌換:paid = 已發放現金;cancelled = 取消並退回金幣(只處理待發放的)
create or replace function public.handle_voucher(p_id bigint, p_action text, p_by uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare v voucher_redemptions;
  is_service boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') = 'service_role';
begin
  if not is_service and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('teacher','parent')
  ) then raise exception '需要管理者權限'; end if;
  select * into v from voucher_redemptions where id = p_id for update;
  if v.id is null then raise exception 'NOT_FOUND'; end if;
  if v.status <> 'pending' then return v.status; end if;
  if p_action = 'cancelled' then
    update profiles set coins = coins + v.coins where id = v.user_id;
  elsif p_action <> 'paid' then
    raise exception 'BAD_ACTION';
  end if;
  update voucher_redemptions set status = p_action, handled_at = now(), handled_by = coalesce(p_by, auth.uid()) where id = p_id;
  return p_action;
end; $$;
revoke all on function public.handle_voucher(bigint, text, uuid) from public;
grant execute on function public.handle_voucher(bigint, text, uuid) to authenticated, service_role;

-- ───────────── ② 好友 PK 對賭 ─────────────
alter table public.duels add column if not exists stake int not null default 0;
alter table public.duels add column if not exists status text not null default 'accepted';
alter table public.duels add column if not exists ch_ready boolean not null default false;
alter table public.duels add column if not exists op_ready boolean not null default false;
alter table public.duels add column if not exists start_at timestamptz;
alter table public.duels add column if not exists ch_answered int not null default 0;
alter table public.duels add column if not exists ch_correct int not null default 0;
alter table public.duels add column if not exists op_answered int not null default 0;
alter table public.duels add column if not exists op_correct int not null default 0;
alter table public.duels add column if not exists winner uuid;
alter table public.duels add column if not exists settled_at timestamptz;
do $$ begin
  alter table public.duels add constraint duels_status_chk
    check (status in ('pending','accepted','declined','cancelled','settled'));
exception when duplicate_object then null; end $$;
-- 舊的友誼賽:雙方都打完的算已結算
update public.duels set status = 'settled', settled_at = coalesce(settled_at, created_at)
 where ch_done and op_done and status = 'accepted';

-- 只能讀;所有寫入走下面的函式(避免前端自己改分數、改金幣)
drop policy if exists "duel participants" on public.duels;
drop policy if exists duel_participants_read on public.duels;
create policy duel_participants_read on public.duels for select
  using ((select auth.uid()) in (challenger, opponent));

drop function if exists public.create_duel(text, text);
create or replace function public.create_duel(opp_code text, subj text, p_stake int default 0)
returns bigint language plpgsql security definer set search_path = public as $$
declare opp uuid; qids text[]; new_id bigint; v_coins int;
begin
  if p_stake < 0 or p_stake > 5000 then raise exception 'BAD_STAKE'; end if;
  select id into opp from profiles where friend_code = upper(opp_code);
  if opp is null or opp = auth.uid() then return null; end if;
  if not exists (select 1 from friendships where user_id = auth.uid() and friend_id = opp) then
    return null;
  end if;
  if p_stake > 0 then
    select coins into v_coins from profiles where id = auth.uid() for update;
    if v_coins < p_stake then raise exception 'NOT_ENOUGH_COINS'; end if;
    update profiles set coins = coins - p_stake where id = auth.uid();  -- 押注先扣下保管
  end if;
  select array_agg(id) into qids from (
    select id from questions
    where subject = subj and not needs_review and type = 'single_choice'
    order by random() limit 5
  ) t;
  if qids is null or array_length(qids, 1) < 5 then raise exception 'NOT_ENOUGH_QUESTIONS'; end if;
  insert into duels(challenger, opponent, subject, question_ids, stake, status)
  values (auth.uid(), opp, subj, qids, p_stake, case when p_stake > 0 then 'pending' else 'accepted' end)
  returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.create_duel(text, text, int) from anon;
grant execute on function public.create_duel(text, text, int) to authenticated;

-- 對方接受押注:付出同樣金幣
create or replace function public.accept_duel(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare d duels; v_coins int;
begin
  select * into d from duels where id = p_id for update;
  if d.id is null or d.opponent <> auth.uid() then raise exception 'NOT_FOUND'; end if;
  if d.status <> 'pending' then return d.status; end if;
  select coins into v_coins from profiles where id = auth.uid() for update;
  if v_coins < d.stake then raise exception 'NOT_ENOUGH_COINS'; end if;
  update profiles set coins = coins - d.stake where id = auth.uid();
  update duels set status = 'accepted' where id = p_id;
  return 'accepted';
end; $$;

-- 對方拒絕 / 發起人取消(尚未接受時):退回發起人的押注
create or replace function public.cancel_duel(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_id for update;
  if d.id is null or auth.uid() not in (d.challenger, d.opponent) then raise exception 'NOT_FOUND'; end if;
  if d.status <> 'pending' then return d.status; end if;
  update profiles set coins = coins + d.stake where id = d.challenger;
  update duels set status = case when auth.uid() = d.opponent then 'declined' else 'cancelled' end where id = p_id;
  return 'cancelled';
end; $$;

-- 進房間按「準備好了」;兩人都準備好 → 定共同開始時間(4 秒後,給倒數)
create or replace function public.duel_ready(p_id bigint)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare d duels;
begin
  select * into d from duels where id = p_id for update;
  if d.id is null or auth.uid() not in (d.challenger, d.opponent) then raise exception 'NOT_FOUND'; end if;
  if d.status <> 'accepted' then raise exception 'NOT_ACCEPTED'; end if;
  if auth.uid() = d.challenger then d.ch_ready := true; else d.op_ready := true; end if;
  if d.ch_ready and d.op_ready and d.start_at is null then d.start_at := now() + interval '4 seconds'; end if;
  update duels set ch_ready = d.ch_ready, op_ready = d.op_ready, start_at = d.start_at where id = p_id;
  return d.start_at;
end; $$;

-- 作答中回報進度(對手畫面即時顯示)
create or replace function public.duel_progress(p_id bigint, p_answered int, p_correct int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update duels set
    ch_answered = case when challenger = auth.uid() then greatest(ch_answered, p_answered) else ch_answered end,
    ch_correct  = case when challenger = auth.uid() then greatest(ch_correct, p_correct) else ch_correct end,
    op_answered = case when opponent = auth.uid() then greatest(op_answered, p_answered) else op_answered end,
    op_correct  = case when opponent = auth.uid() then greatest(op_correct, p_correct) else op_correct end
  where id = p_id and auth.uid() in (challenger, opponent) and status = 'accepted';
end; $$;

-- 交卷;雙方都交卷就結算(贏家拿走全部押注,平手退回)
create or replace function public.finish_duel(p_id bigint, p_score int, p_time bigint)
returns text language plpgsql security definer set search_path = public as $$
declare d duels; w uuid;
begin
  select * into d from duels where id = p_id for update;
  if d.id is null or auth.uid() not in (d.challenger, d.opponent) then raise exception 'NOT_FOUND'; end if;
  if d.status <> 'accepted' then return d.status; end if;
  p_score := least(greatest(p_score, 0), coalesce(array_length(d.question_ids, 1), 5));
  if auth.uid() = d.challenger and not d.ch_done then
    d.ch_score := p_score; d.ch_time := p_time; d.ch_done := true;
    d.ch_answered := coalesce(array_length(d.question_ids, 1), 5); d.ch_correct := p_score;
  elsif auth.uid() = d.opponent and not d.op_done then
    d.op_score := p_score; d.op_time := p_time; d.op_done := true;
    d.op_answered := coalesce(array_length(d.question_ids, 1), 5); d.op_correct := p_score;
  end if;
  update duels set ch_score = d.ch_score, ch_time = d.ch_time, ch_done = d.ch_done, ch_answered = d.ch_answered, ch_correct = d.ch_correct,
                   op_score = d.op_score, op_time = d.op_time, op_done = d.op_done, op_answered = d.op_answered, op_correct = d.op_correct
   where id = p_id;
  if d.ch_done and d.op_done then
    if d.ch_score <> d.op_score then
      w := case when d.ch_score > d.op_score then d.challenger else d.opponent end;
    elsif d.ch_time <> d.op_time then
      w := case when d.ch_time < d.op_time then d.challenger else d.opponent end;
    end if;
    if d.stake > 0 then
      if w is null then
        update profiles set coins = coins + d.stake where id in (d.challenger, d.opponent);
      else
        update profiles set coins = coins + d.stake * 2 where id = w;
      end if;
    end if;
    update duels set status = 'settled', winner = w, settled_at = now() where id = p_id;
    return 'settled';
  end if;
  return 'waiting';
end; $$;

revoke all on function public.accept_duel(bigint) from anon;
revoke all on function public.cancel_duel(bigint) from anon;
revoke all on function public.duel_ready(bigint) from anon;
revoke all on function public.duel_progress(bigint, int, int) from anon;
revoke all on function public.finish_duel(bigint, int, bigint) from anon;
grant execute on function public.accept_duel(bigint) to authenticated;
grant execute on function public.cancel_duel(bigint) to authenticated;
grant execute on function public.duel_ready(bigint) to authenticated;
grant execute on function public.duel_progress(bigint, int, int) to authenticated;
grant execute on function public.finish_duel(bigint, int, bigint) to authenticated;

-- 回傳欄位變多 → 先 drop 再建
drop function if exists public.get_duel(bigint);
create or replace function public.get_duel(duel_id bigint)
returns table(
  id bigint, subject text, question_ids text[],
  challenger uuid, opponent uuid,
  ch_name text, op_name text,
  ch_score int, ch_time bigint, ch_done boolean,
  op_score int, op_time bigint, op_done boolean,
  am_i_challenger boolean,
  stake int, status text, ch_ready boolean, op_ready boolean, start_at timestamptz,
  ch_answered int, ch_correct int, op_answered int, op_correct int, winner uuid, server_now timestamptz
)
language sql stable security definer set search_path = public as $$
  select d.id, d.subject, d.question_ids, d.challenger, d.opponent,
         pc.nickname, po.nickname,
         d.ch_score, d.ch_time, d.ch_done, d.op_score, d.op_time, d.op_done,
         d.challenger = auth.uid(),
         d.stake, d.status, d.ch_ready, d.op_ready, d.start_at,
         d.ch_answered, d.ch_correct, d.op_answered, d.op_correct, d.winner, now()
  from duels d
  join profiles pc on pc.id = d.challenger
  join profiles po on po.id = d.opponent
  where d.id = duel_id and auth.uid() in (d.challenger, d.opponent);
$$;
revoke all on function public.get_duel(bigint) from anon;
grant execute on function public.get_duel(bigint) to authenticated;

drop function if exists public.my_duels();
create or replace function public.my_duels()
returns table(
  id bigint, subject text, ch_name text, op_name text,
  ch_score int, ch_time bigint, ch_done boolean,
  op_score int, op_time bigint, op_done boolean,
  am_i_challenger boolean, created_at timestamptz,
  stake int, status text, winner uuid, i_won boolean
)
language sql stable security definer set search_path = public as $$
  select d.id, d.subject, pc.nickname, po.nickname,
         d.ch_score, d.ch_time, d.ch_done, d.op_score, d.op_time, d.op_done,
         d.challenger = auth.uid(), d.created_at,
         d.stake, d.status, d.winner, d.winner = auth.uid()
  from duels d
  join profiles pc on pc.id = d.challenger
  join profiles po on po.id = d.opponent
  where auth.uid() in (d.challenger, d.opponent)
  order by d.created_at desc limit 30;
$$;
revoke all on function public.my_duels() from anon;
grant execute on function public.my_duels() to authenticated;
