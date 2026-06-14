-- profiles 加上遊戲化欄位
alter table public.profiles
  add column if not exists xp int not null default 0,
  add column if not exists coins int not null default 0,
  add column if not exists equipped_theme text,
  add column if not exists equipped_frame text;

-- 每日任務
create table if not exists public.daily_quests (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  key text not null,
  label text not null,
  target int not null,
  progress int not null default 0,
  reward_xp int not null default 0,
  reward_coins int not null default 0,
  completed boolean not null default false,
  primary key (user_id, day, key)
);

-- 已解鎖成就(定義在程式碼,這裡只記誰解了什麼)
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 已擁有道具/裝扮(目錄在程式碼)
create table if not exists public.user_items (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.daily_quests enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_items enable row level security;
create policy "own quests" on public.daily_quests for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own achievements" on public.user_achievements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own items" on public.user_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 每次作答自動發 XP/金幣 + 推進每日任務(server 端,client 不用管)
-- 注意:此函式在 20260614030934_gamification_phase_bc.sql 會被更新(加入週 XP)
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int;
  today date := (now() at time zone 'Asia/Taipei')::date;
  q record;
begin
  select difficulty into v_diff from questions where id = NEW.question_id;
  v_diff := coalesce(v_diff, 3);

  if NEW.is_correct then
    v_xp := 10 + v_diff * 3;
    v_coins := 2 + (v_diff / 2);
    if NEW.mode = 'review' then v_xp := (v_xp * 3) / 2; v_coins := v_coins + 2; end if;  -- 複習加成
  else
    v_xp := 2; v_coins := 0;  -- 參與分
  end if;
  update profiles set xp = xp + v_xp, coins = coins + v_coins where id = NEW.user_id;

  insert into daily_quests(user_id, day, key, label, target, reward_xp, reward_coins) values
    (NEW.user_id, today, 'answer',  '今日完成 15 題',  15, 30, 15),
    (NEW.user_id, today, 'correct', '答對 10 題',      10, 40, 20),
    (NEW.user_id, today, 'review',  '複習 5 題錯題',    5, 50, 25)
  on conflict (user_id, day, key) do nothing;

  update daily_quests set progress = progress + 1
    where user_id = NEW.user_id and day = today and key = 'answer' and not completed;
  if NEW.is_correct then
    update daily_quests set progress = progress + 1
      where user_id = NEW.user_id and day = today and key = 'correct' and not completed;
  end if;
  if NEW.mode = 'review' then
    update daily_quests set progress = progress + 1
      where user_id = NEW.user_id and day = today and key = 'review' and not completed;
  end if;

  for q in select * from daily_quests
           where user_id = NEW.user_id and day = today and not completed and progress >= target loop
    update profiles set xp = xp + q.reward_xp, coins = coins + q.reward_coins where id = NEW.user_id;
    update daily_quests set completed = true where user_id = NEW.user_id and day = today and key = q.key;
  end loop;

  return NEW;
end; $$;

drop trigger if exists trg_attempt_gamify on public.attempts;
create trigger trg_attempt_gamify after insert on public.attempts
  for each row execute function public.on_attempt_gamify();
