-- 商城專業化(Phase 1a):稀有度分級、更多裝扮類型(名牌底圖/稱號)、
-- 每日精選折扣、統一購買 RPC(server 端算折扣價,杜絕前端竄改金幣/價格)。

alter table public.shop_items
  add column if not exists rarity text not null default 'common';   -- common/rare/epic/legendary

alter table public.profiles
  add column if not exists equipped_nameplate text,
  add column if not exists equipped_title text;

-- 既有商品依價格補稀有度
update public.shop_items set rarity = case
  when price = 0 then 'common'
  when price < 150 then 'common'
  when price < 250 then 'rare'
  when price < 400 then 'epic'
  else 'legendary' end;
-- 頭像框 crown/rainbow 拉到 epic
update public.shop_items set rarity = 'epic' where key in ('frame_crown','frame_rainbow');

-- 新分類:名牌底圖 / 稱號
insert into public.shop_categories (name, type, sort)
select v.name, v.type, v.sort
from (values ('名牌底圖', 'nameplate', 4), ('稱號', 'title', 5)) as v(name, type, sort)
where not exists (select 1 from public.shop_categories c where c.type = v.type);

-- 新商品:名牌底圖(value=CSS 漸層)、稱號(value=顯示文字)、傳說級裝扮
insert into public.shop_items (category_id, key, label, type, value, price, rarity, sort)
select c.id, x.key, x.label, x.type, x.value, x.price, x.rarity, x.sort
from (values
  -- 名牌底圖(個人卡背景漸層)
  ('np_aurora', '極光名牌', 'nameplate', 'linear-gradient(135deg,#34d399,#3b82f6,#a855f7)', 180, 'rare', 1),
  ('np_sunset', '夕陽名牌', 'nameplate', 'linear-gradient(135deg,#f97316,#ec4899)', 180, 'rare', 2),
  ('np_galaxy', '星河名牌', 'nameplate', 'linear-gradient(135deg,#312e81,#7c3aed,#db2777)', 280, 'epic', 3),
  ('np_gold',   '黃金名牌', 'nameplate', 'linear-gradient(135deg,#b45309,#f59e0b,#fde68a)', 450, 'legendary', 4),
  -- 稱號(顯示在暱稱旁)
  ('title_rookie',   '🌱 新星',     'title', '🌱 新星',     60,  'common', 1),
  ('title_diligent', '📖 勤學者',   'title', '📖 勤學者',   160, 'rare', 2),
  ('title_genius',   '🧠 學霸',     'title', '🧠 學霸',     280, 'epic', 3),
  ('title_legend',   '👑 傳說學神', 'title', '👑 傳說學神', 500, 'legendary', 4),
  -- 傳說級裝扮
  ('theme_galaxy',  '銀河紫', 'theme', '#6d28d9', 400, 'legendary', 9),
  ('frame_diamond', '鑽石框', 'frame', '💎',      450, 'legendary', 5)
) as x(key, label, type, value, price, rarity, sort)
join public.shop_categories c on c.type = x.type
on conflict (key) do nothing;

-- 每日精選:用台北日期當 seed,挑 3 件打折商品(每天輪換)
create or replace function public.shop_featured_keys()
returns setof text language sql stable set search_path = public as $$
  select key from public.shop_items
  where active and price > 0 and type in ('theme','frame','nameplate','title')
  order by md5(key || ((now() at time zone 'Asia/Taipei')::date)::text)
  limit 3;
$$;

-- 逛商城:回傳全部 active 商品 + 今日折扣價/精選旗標(server 為單一真相來源)
create or replace function public.get_shop()
returns table(id bigint, key text, label text, type text, value text, price int,
              rarity text, sort int, effective_price int, is_featured boolean)
language sql stable security definer set search_path = public as $$
  with feat(key) as (select * from public.shop_featured_keys())
  select si.id, si.key, si.label, si.type, si.value, si.price, si.rarity, si.sort,
         case when si.key in (select key from feat) then ceil(si.price * 0.7)::int else si.price end,
         (si.key in (select key from feat))
  from public.shop_items si
  where si.active
  order by si.type, si.sort;
$$;
revoke all on function public.get_shop() from anon;
grant execute on function public.get_shop() to authenticated;

-- 統一購買:server 端算折扣價、檢查金幣與擁有權,裝扮進 user_items、消耗品進 inventory
create or replace function public.buy_item(p_key text)
returns table(coins int, qty int)
language plpgsql security definer set search_path = public as $$
declare v_price int; v_active boolean; v_type text; v_coins int; v_qty int; v_featured boolean;
begin
  select price, active, type into v_price, v_active, v_type from shop_items where key = p_key;
  if v_price is null then raise exception 'ITEM_NOT_FOUND'; end if;
  if not v_active then raise exception 'INACTIVE'; end if;
  if v_price <= 0 then raise exception 'FREE_ITEM'; end if;

  v_featured := p_key in (select key from shop_featured_keys() key);
  if v_featured then v_price := ceil(v_price * 0.7)::int; end if;

  select profiles.coins into v_coins from profiles where id = auth.uid() for update;
  if v_coins is null then raise exception 'NO_PROFILE'; end if;
  if v_coins < v_price then raise exception 'NOT_ENOUGH_COINS'; end if;

  if v_type in ('food', 'booster') then
    -- 消耗品:可重複買,累積數量
    update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
    insert into inventory(user_id, item_key, qty) values (auth.uid(), p_key, 1)
      on conflict (user_id, item_key) do update set qty = inventory.qty + 1
      returning inventory.qty into v_qty;
  else
    -- 裝扮:一次擁有
    if exists (select 1 from user_items where user_id = auth.uid() and key = p_key) then
      raise exception 'ALREADY_OWNED';
    end if;
    update profiles set coins = profiles.coins - v_price where id = auth.uid() returning profiles.coins into v_coins;
    insert into user_items(user_id, key) values (auth.uid(), p_key) on conflict do nothing;
    v_qty := 1;
  end if;
  return query select v_coins, v_qty;
end; $$;
revoke all on function public.buy_item(text) from anon;
grant execute on function public.buy_item(text) to authenticated;
