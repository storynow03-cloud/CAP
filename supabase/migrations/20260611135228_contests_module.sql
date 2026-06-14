-- 大會考
create table public.contests (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  created_by uuid not null references auth.users,
  subject text,                -- null = 跨科
  question_ids text[] not null,
  duration_minutes int not null default 30,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 應考紀錄(每人每場一次)
create table public.contest_entries (
  contest_id bigint not null references public.contests on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  score int not null default 0,
  total int not null default 0,
  time_spent_ms bigint not null default 0,
  finished_at timestamptz not null default now(),
  primary key (contest_id, user_id)
);

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;

-- 登入者都能看大會考;只有 teacher/parent 能建立與刪除
create policy "contests readable" on public.contests for select using (auth.role() = 'authenticated');
create policy "contests insert by staff" on public.contests for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));
create policy "contests delete by owner" on public.contests for delete using (created_by = auth.uid());

-- 自己的應考紀錄自己寫;排行榜經由 RPC 讀
create policy "own entries" on public.contest_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 排行榜(跨使用者讀暱稱,security definer)
create or replace function public.get_contest_leaderboard(cid bigint)
returns table(nickname text, score int, total int, time_spent_ms bigint, finished_at timestamptz, is_me boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.nickname,''), '同學'), e.score, e.total, e.time_spent_ms, e.finished_at, e.user_id = auth.uid()
  from contest_entries e join profiles p on p.id = e.user_id
  where e.contest_id = cid
  order by e.score desc, e.time_spent_ms asc;
$$;
revoke all on function public.get_contest_leaderboard(bigint) from anon;
grant execute on function public.get_contest_leaderboard(bigint) to authenticated;
