-- 題目回報 + 考卷診斷/補強 所需的三張表
--
-- ② question_reports:孩子做題時回報「這題有問題」(缺圖/答案怪/看不懂…),
--    進管理後台待處理。孩子是最好的品質檢查員——9 月那批 45 題缺圖就是孩子發現的。
--
-- ③ diagnoses:每次上傳考卷的 AI 分析結果。只存 AI 讀出來的文字與判斷,
--    **不存考卷照片**(照片可能有姓名、學校,分析完即丟)。
--    remediation_targets:每個「答錯的單元」一筆補強目標,記錄連續答對數、是否過關、
--    何時複測、是否畢業。過關標準見 web/src/lib/remediation.ts。
--
-- 權限設計:
--   question_reports —— 孩子可新增/查看自己的回報;處理回報走後端 API(service key)。
--   diagnoses / remediation_targets —— 本人與管理者可讀,**寫入只准後端 API**。
--     補強進度若允許前端直接寫,孩子就能自己改成「已過關」;交由伺服器依題目正確答案判定。

-- ── ② 題目回報 ────────────────────────────────────────────
create table if not exists public.question_reports (
  id bigint generated always as identity primary key,
  question_id text not null references public.questions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  reason text not null check (reason in ('missing_image','wrong_answer','unreadable','bad_options','other')),
  note text,
  status text not null default 'open' check (status in ('open','hidden','fixed','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users
);
create index if not exists question_reports_status_idx on public.question_reports (status, created_at desc);
create index if not exists question_reports_question_idx on public.question_reports (question_id);

alter table public.question_reports enable row level security;
drop policy if exists "reports insert own" on public.question_reports;
drop policy if exists "reports read own or staff" on public.question_reports;
create policy "reports insert own" on public.question_reports for insert
  with check (auth.uid() = user_id);
create policy "reports read own or staff" on public.question_reports for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent'))
  );

-- ── ③ 考卷診斷 ────────────────────────────────────────────
create table if not exists public.diagnoses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,      -- 考卷主人(孩子)
  uploaded_by uuid not null references auth.users on delete cascade,  -- 上傳者(孩子本人或家長)
  subject text not null,
  scope text not null check (scope in ('full','wrong_only')),         -- 整張考卷 / 只有錯題
  title text,                                                         -- 例:九上第一次段考
  result jsonb not null default '{}'::jsonb,                          -- AI 分析結果(不含照片)
  model text,                                                         -- 實際使用的模型(不記金鑰)
  created_at timestamptz not null default now()
);
create index if not exists diagnoses_user_idx on public.diagnoses (user_id, created_at desc);

create table if not exists public.remediation_targets (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  subject text not null,
  topic text not null,
  diagnosis_id bigint references public.diagnoses on delete set null,
  reason text,                                           -- AI 說明的錯誤觀念(給孩子看)
  status text not null default 'practicing'
    check (status in ('practicing','recheck','graduated')),
  streak int not null default 0,                         -- 目前連續答對題數
  hard_in_streak int not null default 0,                 -- 這串連對中難度 ★★★ 以上的題數
  seen_ids text[] not null default '{}',                 -- 補強中已出過的題,避免重複
  total_attempts int not null default 0,
  total_correct int not null default 0,
  passed_at timestamptz,                                 -- 第一階段過關時間
  recheck_due_at timestamptz,                            -- 複測到期時間
  recheck_correct int not null default 0,                -- 複測已答對題數
  graduated_at timestamptz,                              -- 複測全對、正式畢業
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject, topic)                       -- 同單元只有一筆;再錯就重置回練習中
);
create index if not exists remediation_user_idx on public.remediation_targets (user_id, status);

alter table public.diagnoses enable row level security;
alter table public.remediation_targets enable row level security;
drop policy if exists "diagnoses read own or staff" on public.diagnoses;
drop policy if exists "remediation read own or staff" on public.remediation_targets;
create policy "diagnoses read own or staff" on public.diagnoses for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent'))
  );
create policy "remediation read own or staff" on public.remediation_targets for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent'))
  );
-- 刻意不給 insert/update policy:只能經由後端 API(service key)寫入。

-- ── 權限授予(直接在 SQL Editor 建表時,明確授權比較保險)─────────
grant select, insert on public.question_reports to authenticated;
grant select on public.diagnoses to authenticated;
grant select on public.remediation_targets to authenticated;
grant all on public.question_reports, public.diagnoses, public.remediation_targets to service_role;
