-- 夥伴心情/每日照顧 + 技能加成(Phase 2b)
-- 每日陪伴需「今天已作答」才能做(互動綁做題);技能依好感度解鎖,作答時自動加成。

alter table public.profiles
  add column if not exists pet_play_day date,
  add column if not exists care_streak int not null default 0,
  add column if not exists care_streak_day date;

-- 每日陪伴(摸摸夥伴):今天作答 >=5 題才能做、每天一次 → 好感度+5、推進照顧 streak
create or replace function public.pet_play()
returns table(affection int, streak int, bonus_coins int)
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Taipei')::date;
        v_answered int; v_last date; v_streak int; v_aff int; v_bonus int := 0;
begin
  select pet_play_day, care_streak into v_last, v_streak from profiles where id = auth.uid() for update;
  if v_last = today then raise exception 'ALREADY_PLAYED'; end if;

  select count(*) into v_answered from attempts
    where user_id = auth.uid() and (created_at at time zone 'Asia/Taipei')::date = today;
  if coalesce(v_answered, 0) < 5 then raise exception 'NEED_STUDY'; end if;

  if v_last = today - 1 then v_streak := coalesce(v_streak, 0) + 1; else v_streak := 1; end if;
  if v_streak % 7 = 0 then v_bonus := 50; end if;  -- 連續照顧 7 的倍數給金幣

  update profiles set pet_affection = pet_affection + 5,
                      pet_play_day = today, care_streak = v_streak, care_streak_day = today,
                      coins = coins + v_bonus
    where id = auth.uid() returning pet_affection into v_aff;
  return query select v_aff, v_streak, v_bonus;
end; $$;
revoke all on function public.pet_play() from anon;
grant execute on function public.pet_play() to authenticated;

-- 更新作答觸發器:加上「夥伴技能加成」(依好感度,作答正確時生效)
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int; v_subj text; v_aff int;
  today date := (now() at time zone 'Asia/Taipei')::date;
  wk_start date := (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date);
  q record; cur_week date;
begin
  select difficulty, subject into v_diff, v_subj from questions where id = NEW.question_id;
  v_diff := coalesce(v_diff, 3);
  if NEW.is_correct then
    v_xp := 10 + v_diff * 3;
    v_coins := 2 + (v_diff / 2);
    if NEW.mode = 'review' then v_xp := (v_xp * 3) / 2; v_coins := v_coins + 2; end if;

    -- 夥伴技能加成(依好感度;只在答對時生效)
    select pet_affection into v_aff from profiles where id = NEW.user_id;
    v_aff := coalesce(v_aff, 0);
    if v_aff >= 80  then v_coins := v_coins + (v_coins * 20) / 100; end if;  -- 🍀 幸運
    if v_aff >= 200 then v_xp := v_xp + (v_xp * 10) / 100; end if;           -- ⚡ 勤奮
    if v_aff >= 400 then v_xp := v_xp + (v_xp * 5) / 100; end if;            -- 🛡️ 堅毅
  else
    v_xp := 2; v_coins := 0;
  end if;

  select week_start into cur_week from profiles where id = NEW.user_id;
  if cur_week is distinct from wk_start then
    update profiles set xp = xp + v_xp, coins = coins + v_coins, week_xp = v_xp, week_start = wk_start where id = NEW.user_id;
  else
    update profiles set xp = xp + v_xp, coins = coins + v_coins, week_xp = week_xp + v_xp where id = NEW.user_id;
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

  -- 夥伴探險:在該科作答即推進進度,達標標記 done
  update pet_expeditions set progress_count = progress_count + 1
    where user_id = NEW.user_id and status = 'active' and subject = v_subj;
  update pet_expeditions set status = 'done'
    where user_id = NEW.user_id and status = 'active' and progress_count >= target_count;

  return NEW;
end; $$;
