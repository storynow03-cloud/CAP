-- 夥伴加成統一(回應「資料要共用、不要各模組各自一份」)+ 多項需求:
--  * 取消好感度技能(寫死在 gamify + 觸發器兩份)→ 全部改為 pet_defs 上的「每隻夥伴加成」(單一 DB 來源)
--  * 加成可指定考科(bonus_subjects,空=全科)
--  * 非經典夥伴皆需付費(寶可夢設 500);新增瑪莉歐×5、柯南×5(500)
--  * 加成對任何夥伴生效(不再限傳說);is_legendary 僅決定「華麗特效」外觀

alter table public.pet_defs
  add column if not exists bonus_subjects text[] not null default '{}';  -- 空陣列 = 全科

-- 非經典夥伴設定價格(寶可夢 500);經典維持免費
update public.pet_defs set price = 500 where origin = '寶可夢' and price = 0;

-- 新增瑪莉歐 / 柯南 角色(emoji 為佔位,管理者可於 /admin/pets 換成上傳圖片),每隻 500
insert into public.pet_defs (key, name, origin, kind, stage1, stage2, stage3, rarity, price, sort) values
  ('mario_mario',  '瑪利歐',     '瑪莉歐', 'emoji', '🍄', '🔥', '⭐', 'rare', 500, 20),
  ('mario_luigi',  '路易吉',     '瑪莉歐', 'emoji', '🌱', '🟢', '💚', 'rare', 500, 21),
  ('mario_peach',  '碧姬公主',   '瑪莉歐', 'emoji', '🌷', '👸', '👑', 'rare', 500, 22),
  ('mario_bowser', '庫巴',       '瑪莉歐', 'emoji', '🥚', '🐢', '🐲', 'rare', 500, 23),
  ('mario_yoshi',  '耀西',       '瑪莉歐', 'emoji', '🥚', '🦎', '🦖', 'rare', 500, 24),
  ('conan_conan',  '柯南',       '柯南',   'emoji', '🔎', '🕵️', '🎓', 'rare', 500, 30),
  ('conan_kid',    '怪盜基德',   '柯南',   'emoji', '🎴', '🎩', '💎', 'rare', 500, 31),
  ('conan_ran',    '小蘭',       '柯南',   'emoji', '🥋', '💪', '❤️', 'rare', 500, 32),
  ('conan_agasa',  '阿笠博士',   '柯南',   'emoji', '🔧', '👓', '🔬', 'rare', 500, 33),
  ('conan_haibara','灰原哀',     '柯南',   'emoji', '🧫', '🧪', '💊', 'rare', 500, 34)
on conflict (key) do nothing;

-- 移除「自訂上傳夥伴」:把仍使用 custom 的玩家改回貓貓(欄位保留,功能停用)
update public.profiles set pet = 'cat' where pet = 'custom';

-- 重寫作答觸發器:移除寫死的好感度技能,改套用「當前夥伴在 pet_defs 上設定的加成」
-- (任何夥伴皆可有加成;bonus_subjects 空=全科,否則僅該科生效)
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
  -- 當前夥伴的加成設定(單一來源:pet_defs)
  select bonus_xp, bonus_coins, bonus_affection, bonus_subjects
    into v_bxp, v_bcoin, v_baff, v_bsubj from pet_defs where key = v_pet;
  v_hit := coalesce(array_length(v_bsubj, 1), 0) = 0 or v_subj = any(v_bsubj);  -- 該科是否吃加成

  if NEW.is_correct then
    v_xp := 10 + v_diff * 3;
    v_coins := 2 + (v_diff / 2);
    if NEW.mode = 'review' then v_xp := (v_xp * 3) / 2; v_coins := v_coins + 2; end if;
    if v_hit then
      v_xp := v_xp + (v_xp * coalesce(v_bxp, 0)) / 100;
      v_coins := v_coins + (v_coins * coalesce(v_bcoin, 0)) / 100;
    end if;
  else
    v_xp := 2; v_coins := 0;
  end if;

  -- 夥伴加成的好感度(答對且該科吃加成時)
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
