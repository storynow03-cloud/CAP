-- 2026-10-04:防止狂按刷題(使用者要求)
-- 原規則:答錯也給 1 金幣、作答秒數不檢查 → 2 秒按一題亂選也能賺錢,每日任務「完成 15 題」亂按就能領。
-- 新規則(金幣數量本身不變,之後用任務加碼):
--   ① 答錯不給金幣(經驗值 2 點保留)
--   ② 作答少於 5 秒 = 亂按:不給金幣、經驗值,也不推進每日任務/探險/秘境
--   ③ 同一題同一天重複答對,只有第一次給金幣
-- 其餘(錯題複習加成、夥伴加成、加倍道具、每日任務、探險、秘境)與 20260617020000_realms.sql 相同。

create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int; v_subj text; v_pet text; v_aff int;
  v_bxp int := 0; v_bcoin int := 0; v_baff int := 0; v_bsubj text[] := '{}'; v_hit boolean;
  v_xp2x int; v_coin2x int;
  today date := (now() at time zone 'Asia/Taipei')::date;
  wk_start date := (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date);
  q record; cur_week date;
  v_valid boolean; v_repeat boolean;
begin
  -- 防刷題:作答少於 5 秒視為亂按 → 不給金幣、經驗值,也不推進任務/探險/秘境
  v_valid := coalesce(NEW.time_spent_ms, 0) >= 5000;
  if not v_valid then return NEW; end if;
  -- 同一題同一天已經答對過 → 這次答對不再給金幣(經驗值照給)
  v_repeat := NEW.is_correct and exists (
    select 1 from attempts a
     where a.user_id = NEW.user_id and a.question_id = NEW.question_id and a.id <> NEW.id and a.is_correct
       and (a.created_at at time zone 'Asia/Taipei')::date = today
       and coalesce(a.time_spent_ms, 0) >= 5000
  );

  select difficulty, subject into v_diff, v_subj from questions where id = NEW.question_id;
  v_diff := coalesce(v_diff, 3);
  select pet, boost_xp2x_left, boost_coin2x_left into v_pet, v_xp2x, v_coin2x from profiles where id = NEW.user_id;
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
    if v_repeat then v_coins := 0; end if;
  else
    v_xp := 2; v_coins := 0;  -- 答錯不給金幣(原本給 1 枚參與獎,會讓亂按刷題有利可圖)
  end if;

  if coalesce(v_xp2x, 0) > 0 then
    v_xp := v_xp * 2;
    update profiles set boost_xp2x_left = boost_xp2x_left - 1 where id = NEW.user_id;
  end if;
  if coalesce(v_coin2x, 0) > 0 then
    v_coins := v_coins * 2;
    update profiles set boost_coin2x_left = boost_coin2x_left - 1 where id = NEW.user_id;
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

  -- 秘境進度(限時間內、限科目,已加入的人才推進)
  update realm_participants set progress = progress + 1
    where user_id = NEW.user_id and not claimed
      and realm_id in (
        select id from realms
        where active and now() between starts_at and ends_at
          and (subject is null or subject = v_subj)
      );

  return NEW;
end; $$;
