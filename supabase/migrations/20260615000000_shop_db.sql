-- 商城資料庫化(取代寫死在 gamify.ts 的 SHOP_ITEMS)
-- 分類 + 商品兩張表;商品大家可讀,只有 staff(teacher/parent)能寫。
-- 購買仍走既有的 user_items(扣 coins 在前端)。

create table if not exists public.shop_categories (
  id bigint generated always as identity primary key,
  name text not null,
  type text not null,                 -- theme / frame / food
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_items (
  id bigint generated always as identity primary key,
  category_id bigint references public.shop_categories on delete set null,
  key text unique not null,           -- 穩定識別碼(user_items.key / equipped_* 都參照這個)
  label text not null,
  type text not null,                 -- theme(主色 hex)/ frame(emoji)/ food(寵物食物)
  value text not null,                -- 對應內容:theme=hex、frame=emoji、food=好感度點數
  price int not null default 0,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.shop_categories enable row level security;
alter table public.shop_items enable row level security;

-- 大家可讀(含未登入時的 SSR);管理頁需看到全部(含 inactive)所以不過濾
drop policy if exists "shop_categories readable" on public.shop_categories;
drop policy if exists "shop_items readable" on public.shop_items;
create policy "shop_categories readable" on public.shop_categories for select using (true);
create policy "shop_items readable" on public.shop_items for select using (true);

-- 只有 staff 能新增/修改/刪除(寫入主要走後端 service key,這裡是額外防線)
drop policy if exists "shop_categories staff write" on public.shop_categories;
drop policy if exists "shop_items staff write" on public.shop_items;
create policy "shop_categories staff write" on public.shop_categories for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));
create policy "shop_items staff write" on public.shop_items for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));

-- ===== Seed:把原本寫死的商品搬進 DB =====
-- 分類(只在空表時 seed,避免重複)
insert into public.shop_categories (name, type, sort)
select v.name, v.type, v.sort
from (values ('主題色', 'theme', 1), ('頭像框', 'frame', 2), ('寵物食物', 'food', 3))
  as v(name, type, sort)
where not exists (select 1 from public.shop_categories);

-- 商品(以 key 防重,可重複套用)
insert into public.shop_items (category_id, key, label, type, value, price, sort)
select c.id, x.key, x.label, x.type, x.value, x.price, x.sort
from (values
  -- 主題色
  ('theme_indigo',  '靛藍(預設)', 'theme', '#4f46e5',   0, 1),
  ('theme_rose',    '玫瑰紅',       'theme', '#e11d48', 100, 2),
  ('theme_emerald', '翡翠綠',       'theme', '#059669', 100, 3),
  ('theme_amber',   '琥珀橙',       'theme', '#d97706', 100, 4),
  ('theme_violet',  '紫羅蘭',       'theme', '#7c3aed', 150, 5),
  ('theme_cyan',    '天青藍',       'theme', '#0891b2', 150, 6),
  ('theme_pink',    '櫻花粉',       'theme', '#db2777', 200, 7),
  ('theme_slate',   '石墨黑',       'theme', '#334155', 200, 8),
  -- 頭像框
  ('frame_star',    '星星框',       'frame', '⭐', 120, 1),
  ('frame_fire',    '火焰框',       'frame', '🔥', 120, 2),
  ('frame_crown',   '皇冠框',       'frame', '👑', 300, 3),
  ('frame_rainbow', '彩虹框',       'frame', '🌈', 300, 4),
  -- 寵物食物(給 #二 寵物餵食用;value = 好感度點數)
  ('food_cookie',   '餅乾',         'food',  '5',   20, 1),
  ('food_fish',     '小魚乾',       'food',  '10',  40, 2),
  ('food_cake',     '蛋糕',         'food',  '20',  80, 3)
) as x(key, label, type, value, price, sort)
join public.shop_categories c on c.type = x.type
on conflict (key) do nothing;
