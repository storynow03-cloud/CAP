-- 傳說特效夥伴(使用者新需求):夥伴可設為傳說,帶作答加成(金幣/XP/好感度)與特效。
-- 夥伴改為「可購買」:price>0 的夥伴需用金幣買(user_pets 記擁有);皇小米/英語老師=2000 傳說夥伴。

alter table public.pet_defs
  add column if not exists is_legendary boolean not null default false,
  add column if not exists bonus_xp int not null default 0,        -- 作答 XP +%
  add column if not exists bonus_coins int not null default 0,     -- 作答金幣 +%
  add column if not exists bonus_affection int not null default 0; -- 每答對 +好感度

-- 已擁有的夥伴(免費夥伴不需記;付費夥伴買了才入此表)
create table if not exists public.user_pets (
  user_id uuid not null references auth.users on delete cascade,
  pet_key text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, pet_key)
);
alter table public.user_pets enable row level security;
drop policy if exists "own user_pets" on public.user_pets;
create policy "own user_pets" on public.user_pets for select using (auth.uid() = user_id);

-- 購買夥伴:免費(price=0)直接可用不需買;付費需扣金幣;不可重複買
create or replace function public.buy_pet(p_key text)
returns table(coins int)
language plpgsql security definer set search_path = public as $$
declare v_price int; v_active boolean; v_coins int;
begin
  select price, active into v_price, v_active from pet_defs where key = p_key;
  if v_price is null then raise exception 'NOT_FOUND'; end if;
  if not v_active then raise exception 'INACTIVE'; end if;
  if exists (select 1 from user_pets where user_id = auth.uid() and pet_key = p_key) then
    raise exception 'ALREADY_OWNED';
  end if;

  if v_price > 0 then
    select profiles.coins into v_coins from profiles where id = auth.uid() for update;
    if v_coins < v_price then raise exception 'NOT_ENOUGH_COINS'; end if;
    update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
  else
    select profiles.coins into v_coins from profiles where id = auth.uid();
  end if;
  insert into user_pets(user_id, pet_key) values (auth.uid(), p_key) on conflict do nothing;
  return query select v_coins;
end; $$;
revoke all on function public.buy_pet(text) from anon;
grant execute on function public.buy_pet(text) to authenticated;

-- seed 兩隻傳說特效夥伴(圖片在 web/public/partner/),2000 元,帶加成
insert into public.pet_defs (key, name, origin, kind, stage1, stage2, stage3, rarity, price, is_legendary, bonus_xp, bonus_coins, bonus_affection, sort) values
  ('legend_xmi', '皇小米',   '傳說', 'image', '/partner/皇小米.jpg', '/partner/皇小米.jpg', '/partner/皇小米.jpg', 'legendary', 2000, true, 10, 10, 1, 100),
  ('legend_eng', '英語老師', '傳說', 'image', '/partner/英語老師.png', '/partner/英語老師.png', '/partner/英語老師.png', 'legendary', 2000, true, 10, 10, 1, 101)
on conflict (key) do nothing;

-- 更新作答觸發器:加上「傳說夥伴加成」(玩家當前夥伴若為傳說,套用 XP/金幣 % 與每答對好感度)
create or replace function public.on_attempt_gamify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff int; v_xp int; v_coins int; v_subj text; v_aff int; v_pet text;
  v_leg boolean; v_bxp int := 0; v_bcoin int := 0; v_baff int := 0;
  today date := (now() at time zone 'Asia/Taipei')::date;
  wk_start date := (date_trunc('week', (now() at time zone 'Asia/Taipei'))::date);
  q record; cur_week date;
begin
  select difficulty, subject into v_diff, v_subj from questions where id = NEW.question_id;
  v_diff := coalesce(v_diff, 3);
  select pet, pet_affection into v_pet, v_aff from profiles where id = NEW.user_id;
  v_aff := coalesce(v_aff, 0);
  -- 當前夥伴的傳說加成
  select is_legendary, bonus_xp, bonus_coins, bonus_affection
    into v_leg, v_bxp, v_bcoin, v_baff from pet_defs where key = v_pet;
  v_leg := coalesce(v_leg, false);

  if NEW.is_correct then
    v_xp := 10 + v_diff * 3;
    v_coins := 2 + (v_diff / 2);
    if NEW.mode = 'review' then v_xp := (v_xp * 3) / 2; v_coins := v_coins + 2; end if;

    -- 夥伴技能加成(依好感度)
    if v_aff >= 80  then v_coins := v_coins + (v_coins * 20) / 100; end if;
    if v_aff >= 200 then v_xp := v_xp + (v_xp * 10) / 100; end if;
    if v_aff >= 400 then v_xp := v_xp + (v_xp * 5) / 100; end if;

    -- 傳說夥伴加成
    if v_leg then
      v_xp := v_xp + (v_xp * coalesce(v_bxp, 0)) / 100;
      v_coins := v_coins + (v_coins * coalesce(v_bcoin, 0)) / 100;
    end if;
  else
    v_xp := 2; v_coins := 0;
  end if;

  -- 傳說夥伴每答對加好感度
  if NEW.is_correct and v_leg then v_aff := coalesce(v_baff, 0); else v_aff := 0; end if;

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
