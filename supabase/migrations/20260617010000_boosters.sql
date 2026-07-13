-- 加成道具/消耗品(Phase 1b):金幣的「功能性出口」,補齊經濟系統風險3(金幣只有外觀出口)。
-- XP 加倍卡 / 金幣加倍卡:使用後疊加「剩餘次數」,由作答觸發器逐次消耗、疊加加成。
-- 提示券:Quiz 作答時可消耗,移除一個錯誤選項。

alter table public.profiles
  add column if not exists boost_xp2x_left int not null default 0,
  add column if not exists boost_coin2x_left int not null default 0;

-- 新分類 + 商品(對齊既有 shop_items type='booster',buy_item RPC 已支援消耗品購買流程)
insert into public.shop_categories (name, type, sort)
select '加成道具', 'booster', 6
where not exists (select 1 from public.shop_categories where type = 'booster');

insert into public.shop_items (category_id, key, label, type, value, price, rarity, sort)
select c.id, x.key, x.label, x.type, x.value, x.price, x.rarity, x.sort
from (values
  ('booster_xp2x',   'XP 加倍卡(5題)',   'booster', '⚡', 60, 'rare', 1),
  ('booster_coin2x', '金幣加倍卡(5題)',   'booster', '💰', 60, 'rare', 2),
  ('booster_hint',   '提示券(消去一個錯的選項)', 'booster', '💡', 30, 'common', 3)
) as x(key, label, type, value, price, rarity, sort)
join public.shop_categories c on c.type = x.type
on conflict (key) do nothing;

-- 使用 XP / 金幣加倍卡:消耗 inventory 1 個 → 累加剩餘可疊加次數
create or replace function public.use_booster(p_key text)
returns table(xp2x_left int, coin2x_left int)
language plpgsql security definer set search_path = public as $$
declare v_qty int; v_x int; v_c int;
begin
  if p_key not in ('booster_xp2x', 'booster_coin2x') then raise exception 'BAD_BOOSTER'; end if;
  select qty into v_qty from inventory where user_id = auth.uid() and item_key = p_key for update;
  if v_qty is null or v_qty <= 0 then raise exception 'NO_ITEM'; end if;

  update inventory set qty = qty - 1 where user_id = auth.uid() and item_key = p_key;
  if p_key = 'booster_xp2x' then
    update profiles set boost_xp2x_left = boost_xp2x_left + 5 where id = auth.uid();
  else
    update profiles set boost_coin2x_left = boost_coin2x_left + 5 where id = auth.uid();
  end if;
  select boost_xp2x_left, boost_coin2x_left into v_x, v_c from profiles where id = auth.uid();
  return query select v_x, v_c;
end; $$;
revoke all on function public.use_booster(text) from anon;
grant execute on function public.use_booster(text) to authenticated;

-- 使用提示券:消耗 inventory 1 個(效果由前端 Quiz 端顯示,這裡只負責原子扣減庫存)
create or replace function public.use_hint()
returns int language plpgsql security definer set search_path = public as $$
declare v_qty int;
begin
  select qty into v_qty from inventory where user_id = auth.uid() and item_key = 'booster_hint' for update;
  if v_qty is null or v_qty <= 0 then raise exception 'NO_ITEM'; end if;
  update inventory set qty = qty - 1 where user_id = auth.uid() and item_key = 'booster_hint' returning qty into v_qty;
  return v_qty;
end; $$;
revoke all on function public.use_hint() from anon;
grant execute on function public.use_hint() to authenticated;

-- 作答觸發器再更新:套用「加倍卡」剩餘次數(任何作答,無論對錯皆消耗 1 次疊加機會)
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

  -- 加倍卡(任何作答皆消耗一次機會,不論對錯,鼓勵買了就快用)
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

  return NEW;
end; $$;
