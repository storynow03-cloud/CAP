-- 夥伴探險/遠征(Phase 2c):派夥伴出任務,玩家在該科作答推進進度,
-- 完成後領獎(XP/金幣/食物/好感度)。進度由作答觸發器自動累計 → 做題就是探險燃料。

create table if not exists public.pet_expeditions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  pet text not null,
  subject text not null,
  tier int not null,                       -- 1 短程 / 2 中程 / 3 長征
  target_count int not null,               -- 需在該科作答的題數
  progress_count int not null default 0,
  reward_xp int not null,
  reward_coins int not null,
  reward_food text,                        -- 可選:獎勵食物 item_key
  reward_affection int not null default 0,
  status text not null default 'active',   -- active / done / claimed
  started_at timestamptz not null default now(),
  claimed_at timestamptz
);
alter table public.pet_expeditions enable row level security;
drop policy if exists "own expeditions" on public.pet_expeditions;
create policy "own expeditions" on public.pet_expeditions for select using (auth.uid() = user_id);
create index if not exists pet_exp_active_idx on public.pet_expeditions (user_id, status);

-- 出發:一次只能有一個未領取的探險;規模/獎勵依 tier 決定
create or replace function public.start_expedition(p_subject text, p_tier int)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_pet text; v_target int; v_xp int; v_coins int; v_food text; v_aff int;
begin
  if p_tier not in (1, 2, 3) then raise exception 'BAD_TIER'; end if;
  if exists (select 1 from pet_expeditions where user_id = auth.uid() and status in ('active', 'done')) then
    raise exception 'ALREADY_RUNNING';
  end if;
  select pet into v_pet from profiles where id = auth.uid();

  if p_tier = 1 then v_target := 10; v_xp := 60;  v_coins := 30;  v_food := null;        v_aff := 10;
  elsif p_tier = 2 then v_target := 20; v_xp := 140; v_coins := 70;  v_food := 'food_fish'; v_aff := 20;
  else v_target := 30; v_xp := 240; v_coins := 120; v_food := 'food_cake'; v_aff := 35;
  end if;

  insert into pet_expeditions(user_id, pet, subject, tier, target_count, reward_xp, reward_coins, reward_food, reward_affection)
  values (auth.uid(), coalesce(v_pet, 'cat'), p_subject, p_tier, v_target, v_xp, v_coins, v_food, v_aff)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.start_expedition(text, int) from anon;
grant execute on function public.start_expedition(text, int) to authenticated;

-- 領獎:status=done 才能領,發 XP/金幣/食物/好感度(原子)
create or replace function public.claim_expedition(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from pet_expeditions where id = p_id for update;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  if r.user_id <> auth.uid() then raise exception 'NOT_OWNER'; end if;
  if r.status <> 'done' then raise exception 'NOT_DONE'; end if;

  update profiles set xp = xp + r.reward_xp, coins = coins + r.reward_coins,
                      pet_affection = pet_affection + r.reward_affection
    where id = auth.uid();
  if r.reward_food is not null then
    insert into inventory(user_id, item_key, qty) values (auth.uid(), r.reward_food, 1)
      on conflict (user_id, item_key) do update set qty = inventory.qty + 1;
  end if;
  update pet_expeditions set status = 'claimed', claimed_at = now() where id = p_id;
end; $$;
revoke all on function public.claim_expedition(bigint) from anon;
grant execute on function public.claim_expedition(bigint) to authenticated;

-- 取消進行中的探險(放棄,不發獎)
create or replace function public.cancel_expedition(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from pet_expeditions where id = p_id and user_id = auth.uid() and status = 'active';
end; $$;
revoke all on function public.cancel_expedition(bigint) from anon;
grant execute on function public.cancel_expedition(bigint) to authenticated;

-- 更新作答觸發器:在原有 XP/金幣/任務/週XP 之外,推進「該科的進行中探險」
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int; v_subj text;
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
