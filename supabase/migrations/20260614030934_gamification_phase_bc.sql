-- Phase B:寵物 + Phase C:好友碼、週 XP
alter table public.profiles
  add column if not exists pet text not null default 'cat',
  add column if not exists week_xp int not null default 0,
  add column if not exists week_start date,
  add column if not exists friend_code text;

-- 補發好友碼給現有帳號
update public.profiles
  set friend_code = upper(substring(md5(random()::text || id::text) from 1 for 6))
  where friend_code is null;
create unique index if not exists profiles_friend_code_idx on public.profiles (friend_code);

-- 好友(雙向各存一列)
create table if not exists public.friendships (
  user_id uuid not null references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.friendships enable row level security;
create policy "own friendships" on public.friendships for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- PK 對戰(非同步:雙方做同一份題,比分數與用時)
create table if not exists public.duels (
  id bigint generated always as identity primary key,
  challenger uuid not null references auth.users on delete cascade,
  opponent uuid not null references auth.users on delete cascade,
  subject text not null,
  question_ids text[] not null,
  ch_score int, ch_time bigint, ch_done boolean not null default false,
  op_score int, op_time bigint, op_done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.duels enable row level security;
create policy "duel participants" on public.duels for all
  using (auth.uid() in (challenger, opponent))
  with check (auth.uid() in (challenger, opponent));

-- 王關通關紀錄(每週一隻)
create table if not exists public.boss_clears (
  user_id uuid not null references auth.users on delete cascade,
  week text not null,
  score int not null,
  cleared_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table public.boss_clears enable row level security;
create policy "own boss" on public.boss_clears for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 更新作答觸發器:加上「週 XP」(每週一自動歸零)
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int;
  today date := (now() at time zone 'Asia/Taipei')::date;
  wk_start date := (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date);
  q record; cur_week date;
begin
  select difficulty into v_diff from questions where id = NEW.question_id;
  v_diff := coalesce(v_diff, 3);
  if NEW.is_correct then
    v_xp := 10 + v_diff * 3;
    v_coins := 2 + (v_diff / 2);
    if NEW.mode = 'review' then v_xp := (v_xp * 3) / 2; v_coins := v_coins + 2; end if;
  else
    v_xp := 2; v_coins := 0;
  end if;

  -- 週 XP 歸零判斷
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

  return NEW;
end; $$;

-- 新帳號也要有好友碼
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, friend_code)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
          upper(substring(md5(random()::text || new.id::text) from 1 for 6)));
  return new;
end; $$;

-- 用好友碼加好友(雙向)
create or replace function public.add_friend(code text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid; target_name text;
begin
  select id, nickname into target, target_name from profiles where friend_code = upper(code);
  if target is null then return 'NOT_FOUND'; end if;
  if target = auth.uid() then return 'SELF'; end if;
  insert into friendships(user_id, friend_id) values (auth.uid(), target) on conflict do nothing;
  insert into friendships(user_id, friend_id) values (target, auth.uid()) on conflict do nothing;
  return target_name;
end; $$;
revoke all on function public.add_friend(text) from anon;
grant execute on function public.add_friend(text) to authenticated;

-- 好友週排行(含自己)
create or replace function public.get_friends_board()
returns table(nickname text, xp int, week_xp int, pet text, frame text, friend_code text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.nickname, p.xp, p.week_xp, p.pet, p.equipped_frame, p.friend_code, p.id = auth.uid()
  from profiles p
  where p.id = auth.uid()
     or p.id in (select friend_id from friendships where user_id = auth.uid())
  order by week_xp desc, xp desc;
$$;
revoke all on function public.get_friends_board() from anon;
grant execute on function public.get_friends_board() to authenticated;
