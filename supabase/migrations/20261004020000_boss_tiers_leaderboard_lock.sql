-- 2026-10-04:魔王關分級 + 扭蛋與魔王獎勵改由伺服器發放 + 排行榜 + 金幣/經驗值防竄改
--
-- ① 魔王關:5 科各一隻魔王(新增英文),各分 Lv1~Lv5;打倒這一級才能挑戰下一級,
--    難度、過關門檻、獎勵逐級提高。原本的「每週輪替」變成「本週加倍」(該科獎勵 ×2)。
--    每一級的獎勵只能領一次(boss_progress 記錄每科打到第幾級)。
-- ② 扭蛋(80 金幣抽一件沒有的裝扮)改由 gacha_spin() 在伺服器扣款與抽獎。
-- ③ 排行榜 get_leaderboard():8 個項目一次回傳,前端切換排序。
-- ④ 防竄改:原本 profiles 的 policy 允許本人改整列資料,包括金幣;現在金幣能換現金券,
--    所以加觸發器:直接從前端(角色 authenticated)更新時,金幣、經驗值、角色等欄位一律維持原值。
--    資料庫函式(security definer)與後端 service key 不受影響。

-- ───────────── ① 魔王關分級 ─────────────
create table if not exists public.boss_progress (
  user_id uuid not null references auth.users on delete cascade,
  subject text not null,
  tier_cleared int not null default 0,
  best_score int,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject)
);
alter table public.boss_progress enable row level security;
drop policy if exists boss_progress_own_read on public.boss_progress;
create policy boss_progress_own_read on public.boss_progress for select using ((select auth.uid()) = user_id);

-- 每級規格(前端 lib/gamify.ts 的 BOSS_TIERS 要一致)
create or replace function public.boss_tier_spec(p_tier int)
returns table(pass int, reward_xp int, reward_coins int)
language sql immutable as $$
  select t.pass, t.reward_xp, t.reward_coins from (values
    (1, 6, 60, 30), (2, 7, 100, 50), (3, 7, 150, 80), (4, 7, 200, 100), (5, 8, 300, 150)
  ) as t(tier, pass, reward_xp, reward_coins) where t.tier = p_tier;
$$;

-- 本週加倍的科目(與前端 thisWeekBoss() 相同算法:1/1 起第幾週 % 5)
create or replace function public.boss_week_subject()
returns text language sql stable as $$
  select (array['math','science','social','chinese','english'])[
    (floor(((now() at time zone 'Asia/Taipei')::date - make_date(extract(year from (now() at time zone 'Asia/Taipei'))::int, 1, 1)) / 7)::int % 5) + 1
  ];
$$;

create or replace function public.clear_boss(p_subject text, p_tier int, p_score int)
returns table(cleared boolean, reward_xp int, reward_coins int, tier_cleared int)
language plpgsql security definer set search_path = public as $$
declare cur int; s record; mult int := 1;
begin
  if p_subject not in ('math','science','social','chinese','english') or p_tier not between 1 and 5 then
    raise exception 'BAD_ARGS';
  end if;
  select bp.tier_cleared into cur from boss_progress bp where bp.user_id = auth.uid() and bp.subject = p_subject for update;
  cur := coalesce(cur, 0);
  if p_tier > cur + 1 then raise exception 'LOCKED'; end if;
  select * into s from boss_tier_spec(p_tier);
  if p_score < s.pass then
    return query select false, 0, 0, cur;
    return;
  end if;
  if p_tier <= cur then
    -- 已經打過的級數:可以重打練功,但不再發獎
    update boss_progress set best_score = greatest(coalesce(best_score, 0), p_score), updated_at = now()
     where user_id = auth.uid() and subject = p_subject;
    return query select true, 0, 0, cur;
    return;
  end if;
  if boss_week_subject() = p_subject then mult := 2; end if;
  insert into boss_progress(user_id, subject, tier_cleared, best_score)
    values (auth.uid(), p_subject, p_tier, p_score)
    on conflict (user_id, subject) do update set tier_cleared = excluded.tier_cleared, best_score = excluded.best_score, updated_at = now();
  update profiles set xp = xp + s.reward_xp * mult, coins = coins + s.reward_coins * mult where id = auth.uid();
  return query select true, s.reward_xp * mult, s.reward_coins * mult, p_tier;
end; $$;
revoke all on function public.clear_boss(text, int, int) from anon;
grant execute on function public.clear_boss(text, int, int) to authenticated;

-- ───────────── ② 扭蛋 ─────────────
create or replace function public.gacha_spin()
returns table(won_key text, won_label text, coins int, refunded boolean)
language plpgsql security definer set search_path = public as $$
declare v_coins int; v_key text; v_label text;
begin
  select p.coins into v_coins from profiles p where p.id = auth.uid() for update;
  if v_coins < 80 then raise exception 'NOT_ENOUGH_COINS'; end if;
  select si.key, si.label into v_key, v_label from shop_items si
   where si.active and si.type in ('theme','frame','nameplate','title') and si.price > 0
     and not exists (select 1 from user_items ui where ui.user_id = auth.uid() and ui.key = si.key)
   order by random() limit 1;
  if v_key is null then
    update profiles set coins = profiles.coins - 40 where id = auth.uid() returning profiles.coins into v_coins;
    return query select null::text, null::text, v_coins, true;
    return;
  end if;
  insert into user_items(user_id, key) values (auth.uid(), v_key) on conflict do nothing;
  update profiles set coins = profiles.coins - 80 where id = auth.uid() returning profiles.coins into v_coins;
  return query select v_key, v_label, v_coins, false;
end; $$;
revoke all on function public.gacha_spin() from anon;
grant execute on function public.gacha_spin() to authenticated;

-- ───────────── ③ 排行榜 ─────────────
-- 家庭/班級規模:所有學生帳號一起排。一次回傳 8 個指標,前端切換排序。
create or replace function public.get_leaderboard()
returns table(
  user_id uuid, nickname text, avatar_url text, pet text, is_me boolean,
  coins int, xp int, total_answered bigint, week_xp int, acc30 numeric, answered30 bigint,
  login_streak int, overcome bigint, duel_wins bigint, boss_tiers bigint
)
language sql stable security definer set search_path = public as $$
  with wk as (select (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date) as d)
  select p.id, p.nickname, p.avatar_url, p.pet, p.id = auth.uid(),
         p.coins, p.xp,
         (select coalesce(sum(ds.total), 0) from daily_stats ds where ds.user_id = p.id),
         case when p.week_start = (select d from wk) then p.week_xp else 0 end,
         (select case when sum(ds.total) >= 50 then round(sum(ds.correct)::numeric * 100 / sum(ds.total), 1) end
            from daily_stats ds where ds.user_id = p.id and ds.day >= (now() at time zone 'Asia/Taipei')::date - 29),
         (select coalesce(sum(ds.total), 0) from daily_stats ds where ds.user_id = p.id and ds.day >= (now() at time zone 'Asia/Taipei')::date - 29),
         coalesce(p.login_streak, 0),
         (select count(*) from wrong_book w where w.user_id = p.id and w.status = 'overcome'),
         (select count(*) from duels d where d.winner = p.id),
         (select coalesce(sum(bp.tier_cleared), 0) from boss_progress bp where bp.user_id = p.id)
  from profiles p
  where p.role = 'student'
     or p.id = auth.uid();
$$;
revoke all on function public.get_leaderboard() from anon;
grant execute on function public.get_leaderboard() to authenticated;

-- ───────────── ④ 防竄改 ─────────────
create or replace function public.profiles_lock_columns() returns trigger
language plpgsql as $$
begin
  -- current_user = authenticated:前端直接 update(security definer 函式裡是函式擁有者,不受限)
  if current_user = 'authenticated' then
    new.coins := old.coins;
    new.xp := old.xp;
    new.week_xp := old.week_xp;
    new.week_start := old.week_start;
    new.role := old.role;
    new.login_day := old.login_day;
    new.login_streak := old.login_streak;
    new.affection_claimed := old.affection_claimed;
    new.boost_xp2x_left := old.boost_xp2x_left;
    new.boost_coin2x_left := old.boost_coin2x_left;
  end if;
  return new;
end $$;
drop trigger if exists profiles_lock_columns on public.profiles;
create trigger profiles_lock_columns before update on public.profiles
  for each row execute function public.profiles_lock_columns();

-- ───────────── ⑤ 交易所只給登入者看(2026-10-04 系統掃描發現未登入也讀得到賣家/買家/價格) ─────────────
drop policy if exists "market readable" on public.market_listings;
create policy "market readable" on public.market_listings for select to authenticated using (true);
