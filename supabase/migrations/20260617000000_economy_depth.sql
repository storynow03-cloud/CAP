-- 經濟系統深化(解三風險 + 等級/好感度用途 + 每日登入 + 錯題獎勵)
--  風險1 新手前期牆 → daily_login 首日就給、等級升級給金幣(早期回饋)
--  風險2 弱勢學生賺太慢 → 答錯也給 1 金幣參與獎
--  風險3 金幣只有外觀出口 → (加成道具於下一階段 Phase B)
--  等級用途 → 升級自動發金幣(level_from_xp + on_levelup 觸發器)
--  好感度用途 → 里程碑可領獎(claim_affection_reward)
--  每日登入連續獎勵 → daily_login
--  錯題克服 → 自動發獎(on_wrong_overcome 觸發器)

alter table public.profiles
  add column if not exists login_day date,
  add column if not exists login_streak int not null default 0,
  add column if not exists affection_claimed int not null default 0;

-- 等級公式(對齊前端 levelFromXp)
create or replace function public.level_from_xp(p_xp int)
returns int language plpgsql immutable as $$
declare lvl int := 1; acc int := 0; need int := 100;
begin
  if p_xp is null then return 1; end if;
  while p_xp >= acc + need loop
    acc := acc + need; lvl := lvl + 1; need := 100 + (lvl - 1) * 50;
  end loop;
  return lvl;
end; $$;

-- 升級自動發金幣(獨立觸發器:只在 xp 變動時比較等級,不污染 on_attempt_gamify)
create or replace function public.on_levelup()
returns trigger language plpgsql security definer set search_path = public as $$
declare old_l int; new_l int; bonus int := 0; i int;
begin
  old_l := level_from_xp(OLD.xp); new_l := level_from_xp(NEW.xp);
  if new_l > old_l then
    for i in (old_l + 1)..new_l loop bonus := bonus + i * 20; end loop;  -- 每升一級給 級數×20
    update profiles set coins = coins + bonus where id = NEW.id;
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_levelup on public.profiles;
create trigger trg_levelup after update of xp on public.profiles
  for each row execute function public.on_levelup();

-- 錯題克服自動發獎(複習把錯題變 overcome 時)
create or replace function public.on_wrong_overcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'overcome' and OLD.status is distinct from 'overcome' then
    update profiles set coins = coins + 10, xp = xp + 20 where id = NEW.user_id;
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_wrong_overcome on public.wrong_book;
create trigger trg_wrong_overcome after update of status on public.wrong_book
  for each row execute function public.on_wrong_overcome();

-- 每日登入連續獎勵(首日就給,階梯式封頂)
create or replace function public.daily_login()
returns table(reward int, streak int, already boolean)
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Taipei')::date; v_last date; v_streak int; v_reward int;
begin
  select login_day, login_streak into v_last, v_streak from profiles where id = auth.uid() for update;
  if v_last = today then return query select 0, coalesce(v_streak, 0), true; return; end if;
  if v_last = today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
  v_reward := least(v_streak, 7) * 10;  -- 第1天10、第2天20…第7天起封頂70
  update profiles set login_day = today, login_streak = v_streak, coins = coins + v_reward where id = auth.uid();
  return query select v_reward, v_streak, false;
end; $$;
revoke all on function public.daily_login() from anon;
grant execute on function public.daily_login() to authenticated;

-- 好感度里程碑領獎
create or replace function public.claim_affection_reward()
returns table(reward int, tier int)
language plpgsql security definer set search_path = public as $$
declare thresholds int[] := array[50, 150, 300, 600]; rewards int[] := array[50, 100, 200, 400];
        v_claimed int; v_aff int; v_reward int;
begin
  select affection_claimed, pet_affection into v_claimed, v_aff from profiles where id = auth.uid() for update;
  if v_claimed >= array_length(thresholds, 1) then raise exception 'ALL_CLAIMED'; end if;
  if v_aff < thresholds[v_claimed + 1] then raise exception 'NOT_YET'; end if;
  v_reward := rewards[v_claimed + 1];
  update profiles set affection_claimed = affection_claimed + 1, coins = coins + v_reward where id = auth.uid();
  return query select v_reward, v_claimed + 1;
end; $$;
revoke all on function public.claim_affection_reward() from anon;
grant execute on function public.claim_affection_reward() to authenticated;

-- 重寫作答觸發器:答錯給 1 金幣參與獎(其餘維持 migration 21 版本)
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int; v_subj text; v_pet text; v_aff int;
  v_bxp int := 0; v_bcoin int := 0; v_baff int := 0; v_bsubj text[] := '{}'; v_hit boolean;
  today date := (now() at time zone 'Asia/Taipei')::date;
  wk_start date := (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date);
  q record; cur_week date;
begin
  select difficulty, subject into v_diff, v_subj from questions where id = NEW.question_id;
  v_diff := coalesce(v_diff, 3);
  select pet into v_pet from profiles where id = NEW.user_id;
  select bonus_xp, bonus_coins, bonus_affection, bonus_subjects
    into v_bxp, v_bcoin, v_baff, v_bsubj from pet_defs where key = v_pet;
  v_hit := coalesce(array_length(v_bsubj, 1), 0) = 0 or v_subj = any(v_bsubj);

  if NEW.is_correct then
    v_xp := 10 + v_diff * 3;
    v_coins := 2 + (v_diff / 2);
    if NEW.mode = 'review' then v_xp := (v_xp * 3) / 2; v_coins := v_coins + 2; end if;
    if v_hit then
      v_xp := v_xp + (v_xp * coalesce(v_bxp, 0)) / 100;
      v_coins := v_coins + (v_coins * coalesce(v_bcoin, 0)) / 100;
    end if;
  else
    v_xp := 2; v_coins := 1;  -- 風險2:答錯也給 1 金幣參與獎
  end if;

  if NEW.is_correct and v_hit then v_aff := coalesce(v_baff, 0); else v_aff := 0; end if;

  select week_start into cur_week from profiles where id = NEW.user_id;
  if cur_week is distinct from wk_start then
    update profiles set xp = xp + v_xp, coins = coins + v_coins, week_xp = v_xp, week_start = wk_start,
                        pet_affection = pet_affection + v_aff where id = NEW.user_id;
  else
    update profiles set xp = xp + v_xp, coins = coins + v_coins, week_xp = week_xp + v_xp,
                        pet_affection = pet_affection + v_aff where id = NEW.user_id;
  end if;

  insert into daily_quests(user_id, day, key, label, target, reward_xp, reward_coins) values
    (NEW.user_id, today, 'answer',  '今日完成 15 題',  15, 30, 15),
    (NEW.user_id, today, 'correct', '答對 10 題',      10, 40, 20),
    (NEW.user_id, today, 'review',  '複習 5 題錯題',    5, 50, 25)
  on conflict (user_id, day, key) do nothing;

  update daily_quests set progress = progress + 1 where user_id = NEW.user_id and day = today and key = 'answer' and not completed;
  if NEW.is_correct then
    update daily_quests set progress = progress + 1 where user_id = NEW.user_id and day = today and key = 'correct' and not completed;
  end if;
  if NEW.mode = 'review' then
    update daily_quests set progress = progress + 1 where user_id = NEW.user_id and day = today and key = 'review' and not completed;
  end if;

  for q in select * from daily_quests where user_id = NEW.user_id and day = today and not completed and progress >= target loop
    update profiles set xp = xp + q.reward_xp, coins = coins + q.reward_coins where id = NEW.user_id;
    update daily_quests set completed = true where user_id = NEW.user_id and day = today and key = q.key;
  end loop;

  update pet_expeditions set progress_count = progress_count + 1
    where user_id = NEW.user_id and status = 'active' and subject = v_subj;
  update pet_expeditions set status = 'done'
    where user_id = NEW.user_id and status = 'active' and progress_count >= target_count;

  return NEW;
end; $$;

-- 成就給獎勵:成就解鎖仍由前端判定並 upsert user_achievements(既有流程不變),
-- 但獎勵發放獨立走此 RPC,金額由 DB 端權威表決定(與 gamify.ts ACHIEVEMENTS 保持一致、
-- 不信任前端傳入的獎勵數字),並用 rewarded 旗標防止重複請領。
alter table public.user_achievements add column if not exists rewarded boolean not null default false;

create or replace function public.claim_achievement_reward(p_key text)
returns table(reward_xp int, reward_coins int)
language plpgsql security definer set search_path = public as $$
declare v_xp int; v_coins int; v_rewarded boolean;
begin
  select rewarded into v_rewarded from user_achievements where user_id = auth.uid() and key = p_key for update;
  if v_rewarded is null then raise exception 'NOT_UNLOCKED'; end if;
  if v_rewarded then raise exception 'ALREADY_CLAIMED'; end if;

  select x.xp, x.coins into v_xp, v_coins from (values
    ('first_step', 20, 10), ('answer_100', 100, 50), ('answer_500', 300, 150),
    ('streak_3', 60, 30), ('streak_7', 150, 80), ('streak_30', 500, 300),
    ('master_1', 80, 40), ('master_5', 200, 100), ('challenger', 150, 80),
    ('conquer_10', 80, 40), ('conquer_50', 250, 120), ('exam_5', 100, 50)
  ) as x(key, xp, coins) where x.key = p_key;
  if v_xp is null then raise exception 'UNKNOWN_ACHIEVEMENT'; end if;

  update profiles set xp = xp + v_xp, coins = coins + v_coins where id = auth.uid();
  update user_achievements set rewarded = true where user_id = auth.uid() and key = p_key;
  return query select v_xp, v_coins;
end; $$;
revoke all on function public.claim_achievement_reward(text) from anon;
grant execute on function public.claim_achievement_reward(text) to authenticated;
