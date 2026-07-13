-- 秘境(Phase C):管理者/家長出的限時懸賞任務,可個人挑戰或團體(全員進度加總)達成,
-- 完成可領獎。做題(該科目或全科)即自動推進,與夥伴探險同一套「做題=進度」邏輯。

create table if not exists public.realms (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  subject text,                 -- null = 全科
  target_count int not null check (target_count > 0),
  reward_xp int not null default 0,
  reward_coins int not null default 0,
  is_team boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
alter table public.realms enable row level security;
drop policy if exists "realms readable" on public.realms;
create policy "realms readable" on public.realms for select using (true);
drop policy if exists "realms staff write" on public.realms;
create policy "realms staff write" on public.realms for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));

create table if not exists public.realm_participants (
  realm_id bigint not null references public.realms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  progress int not null default 0,
  claimed boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (realm_id, user_id)
);
alter table public.realm_participants enable row level security;
drop policy if exists "realm participants readable" on public.realm_participants;
create policy "realm participants readable" on public.realm_participants for select using (true);

-- 加入秘境(限時間內、尚未加入過)
create or replace function public.join_realm(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_active boolean; v_start timestamptz; v_end timestamptz;
begin
  select active, starts_at, ends_at into v_active, v_start, v_end from realms where id = p_id;
  if v_active is null then raise exception 'NOT_FOUND'; end if;
  if not v_active then raise exception 'INACTIVE'; end if;
  if now() < v_start or now() > v_end then raise exception 'NOT_IN_WINDOW'; end if;
  insert into realm_participants(realm_id, user_id) values (p_id, auth.uid())
    on conflict do nothing;
end; $$;
revoke all on function public.join_realm(bigint) from anon;
grant execute on function public.join_realm(bigint) to authenticated;

-- 領獎:個人模式需自己進度達標;團體模式需全隊總進度達標(每人各領一份,不互相瓜分)
create or replace function public.claim_realm_reward(p_id bigint)
returns table(reward_xp int, reward_coins int)
language plpgsql security definer set search_path = public as $$
declare v_team boolean; v_target int; v_rxp int; v_rcoins int;
        v_my int; v_claimed boolean; v_total int;
begin
  select r.is_team, r.target_count, r.reward_xp, r.reward_coins into v_team, v_target, v_rxp, v_rcoins
    from realms r where r.id = p_id;
  if v_target is null then raise exception 'NOT_FOUND'; end if;

  select progress, claimed into v_my, v_claimed from realm_participants
    where realm_id = p_id and user_id = auth.uid() for update;
  if v_my is null then raise exception 'NOT_JOINED'; end if;
  if v_claimed then raise exception 'ALREADY_CLAIMED'; end if;

  if v_team then
    select coalesce(sum(progress), 0) into v_total from realm_participants where realm_id = p_id;
    if v_total < v_target then raise exception 'NOT_YET'; end if;
  else
    if v_my < v_target then raise exception 'NOT_YET'; end if;
  end if;

  update realm_participants set claimed = true where realm_id = p_id and user_id = auth.uid();
  update profiles set xp = xp + v_rxp, coins = coins + v_rcoins where id = auth.uid();
  return query select v_rxp, v_rcoins;
end; $$;
revoke all on function public.claim_realm_reward(bigint) from anon;
grant execute on function public.claim_realm_reward(bigint) to authenticated;

-- 逛秘境:回傳所有秘境 + 我的參與狀態/進度/隊伍總進度
create or replace function public.get_realms()
returns table(id bigint, title text, description text, subject text, target_count int,
              reward_xp int, reward_coins int, is_team boolean, starts_at timestamptz, ends_at timestamptz,
              is_open boolean, is_joined boolean, my_progress int, team_total int,
              participant_count int, claimed boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.title, r.description, r.subject, r.target_count, r.reward_xp, r.reward_coins,
         r.is_team, r.starts_at, r.ends_at,
         (r.active and now() between r.starts_at and r.ends_at),
         (rp.user_id is not null),
         coalesce(rp.progress, 0),
         coalesce((select sum(progress) from realm_participants where realm_id = r.id), 0)::int,
         coalesce((select count(*) from realm_participants where realm_id = r.id), 0)::int,
         coalesce(rp.claimed, false)
  from realms r
  left join realm_participants rp on rp.realm_id = r.id and rp.user_id = auth.uid()
  where r.active
  order by r.ends_at asc;
$$;
revoke all on function public.get_realms() from anon;
grant execute on function public.get_realms() to authenticated;

-- 作答觸發器再更新:加上「秘境進度推進」(邏輯同夥伴探險:做題即算,不論對錯;限時間內、限科目)
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int; v_subj text; v_pet text; v_aff int;
  v_bxp int := 0; v_bcoin int := 0; v_baff int := 0; v_bsubj text[] := '{}'; v_hit boolean;
  v_xp2x int; v_coin2x int;
  today date := (now() at time zone 'Asia/Taipei')::date;
  wk_start date := (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date);
  q record; cur_week date;
begin
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
  else
    v_xp := 2; v_coins := 1;
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
