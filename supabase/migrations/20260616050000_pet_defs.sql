-- 夥伴資料庫化(Phase 3a):夥伴目錄改由 DB 管理,管理者可 CRUD、每階段可放 emoji 或圖片。
-- 3 階段進化:stage1 幼年 / stage2 成長期 / stage3 完全體。

create table if not exists public.pet_defs (
  id bigint generated always as identity primary key,
  key text unique not null,
  name text not null,
  origin text not null default '經典',
  kind text not null default 'emoji',     -- 'emoji' | 'image'
  stage1 text not null,                    -- 幼年(emoji 或圖片 URL)
  stage2 text not null,                    -- 成長期
  stage3 text not null,                    -- 完全體
  rarity text not null default 'common',
  price int not null default 0,            -- 預留
  is_custom boolean not null default false,
  owner uuid references auth.users on delete cascade,  -- 自訂夥伴擁有者
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.pet_defs enable row level security;

drop policy if exists "pet_defs read public" on public.pet_defs;
drop policy if exists "pet_defs read own custom" on public.pet_defs;
drop policy if exists "pet_defs staff write" on public.pet_defs;
-- 公開夥伴大家可讀;自訂夥伴只有擁有者可讀
create policy "pet_defs read public" on public.pet_defs for select using (active and not is_custom);
create policy "pet_defs read own custom" on public.pet_defs for select using (is_custom and owner = auth.uid());
-- staff 可寫(寫入主要走後端 service key,這裡是額外防線)
create policy "pet_defs staff write" on public.pet_defs for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));

-- seed:經典 4 + 寶可夢風 5(3 階段 emoji)。皮克敏改由管理者上傳正確圖片(避免版權)。
insert into public.pet_defs (key, name, origin, kind, stage1, stage2, stage3, sort) values
  ('cat',    '貓貓',   '經典',   'emoji', '🐱', '🐈', '🦁', 1),
  ('dog',    '狗狗',   '經典',   'emoji', '🐶', '🐕', '🐺', 2),
  ('dragon', '龍龍',   '經典',   'emoji', '🦎', '🐲', '🐉', 3),
  ('bird',   '鳥鳥',   '經典',   'emoji', '🐤', '🐦', '🦅', 4),
  ('spark',  '電光鼠', '寶可夢', 'emoji', '🐭', '🐹', '⚡', 5),
  ('flame',  '火蜥蜴', '寶可夢', 'emoji', '🦎', '🐊', '🔥', 6),
  ('leaf',   '種子龍', '寶可夢', 'emoji', '🌱', '🌿', '🌳', 7),
  ('aqua',   '水靈龜', '寶可夢', 'emoji', '🐢', '🐉', '🌊', 8),
  ('ghost',  '夜魅',   '寶可夢', 'emoji', '👻', '🦇', '🌙', 9)
on conflict (key) do nothing;
