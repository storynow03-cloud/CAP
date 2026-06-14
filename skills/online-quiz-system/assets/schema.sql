-- Online Quiz / Exam-Practice System — initial schema (Supabase / Postgres)
-- Apply as your first migration. Adjust the exam_date default to your context.

-- ============ Core tables ============

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null default '',
  role text not null default 'student' check (role in ('student','parent','teacher')),
  grade int,
  exam_date date default '2027-05-15',
  daily_goal int not null default 20,
  created_at timestamptz not null default now()
);

create table public.questions (
  id text primary key,
  subject text not null,
  volume text,
  topic text not null,
  subtopic text,
  difficulty int not null check (difficulty between 1 and 5),
  type text not null default 'single_choice',
  question text not null,          -- may contain controlled HTML (<img> formulas, <sup>)
  passage text,                    -- for reading-comprehension groups
  image text,
  options jsonb,                   -- array of option strings (may be HTML)
  answer int,                      -- correct option index (0-based) for single_choice
  answer_text text,                -- for non-choice / multi-answer
  explanation text,
  source text,
  curriculum_code text,
  knowledge_code text,
  tags text[] not null default '{}',
  needs_review boolean not null default false,  -- hide degraded/incomplete questions
  created_at timestamptz not null default now()
);
create index questions_pick_idx on public.questions (subject, topic, difficulty) where not needs_review;

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  question_id text not null references public.questions,
  selected int,
  is_correct boolean not null,
  time_spent_ms int,
  mode text not null default 'practice' check (mode in ('practice','challenge','exam','review')),
  created_at timestamptz not null default now()
);
create index attempts_user_idx on public.attempts (user_id, created_at desc);
create index attempts_user_q_idx on public.attempts (user_id, question_id);

create table public.mastery (
  user_id uuid not null references auth.users on delete cascade,
  subject text not null,
  topic text not null,
  level int not null default 1 check (level between 1 and 5),
  score numeric not null default 0,
  recent jsonb not null default '[]',
  attempts_count int not null default 0,
  correct_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject, topic)
);

create table public.wrong_book (
  user_id uuid not null references auth.users on delete cascade,
  question_id text not null references public.questions,
  added_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '1 day',
  interval_days int not null default 1,
  streak int not null default 0,
  status text not null default 'active' check (status in ('active','overcome')),
  primary key (user_id, question_id)
);
create index wrong_book_due_idx on public.wrong_book (user_id, due_at) where status = 'active';

create table public.exam_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  subject text not null,
  total int, correct int, grade text,
  started_at timestamptz, finished_at timestamptz
);

create table public.daily_stats (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  total int not null default 0,
  correct int not null default 0,
  minutes int not null default 0,
  primary key (user_id, day)
);

-- ============ Contests (teacher-built papers + leaderboard) ============

create table public.contests (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  created_by uuid not null references auth.users,
  subject text,
  question_ids text[] not null,
  duration_minutes int not null default 30,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.contest_entries (
  contest_id bigint not null references public.contests on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  score int not null default 0,
  total int not null default 0,
  time_spent_ms bigint not null default 0,
  finished_at timestamptz not null default now(),
  primary key (contest_id, user_id)
);

-- ============ Auto-create profile on signup ============

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============ Row Level Security ============

alter table public.profiles        enable row level security;
alter table public.questions       enable row level security;
alter table public.attempts        enable row level security;
alter table public.mastery         enable row level security;
alter table public.wrong_book      enable row level security;
alter table public.exam_sessions   enable row level security;
alter table public.daily_stats     enable row level security;
alter table public.contests        enable row level security;
alter table public.contest_entries enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "questions readable" on public.questions for select using (auth.role() = 'authenticated');
create policy "own attempts" on public.attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own mastery" on public.mastery for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wrong_book" on public.wrong_book for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own exam_sessions" on public.exam_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily_stats" on public.daily_stats for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contests readable" on public.contests for select using (auth.role() = 'authenticated');
create policy "contests insert by staff" on public.contests for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));
create policy "contests delete by owner" on public.contests for delete using (created_by = auth.uid());
create policy "own entries" on public.contest_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ RPCs ============

-- Distinct topics for a subject (client select is capped at 1000 rows, so a big bank would truncate)
create or replace function public.get_topics(subj text)
returns table(topic text, cnt bigint)
language sql stable security definer set search_path = public as $$
  select topic, count(*) cnt from questions
  where subject = subj and not needs_review and type = 'single_choice'
  group by topic order by topic;
$$;
revoke all on function public.get_topics(text) from anon;
grant execute on function public.get_topics(text) to authenticated;

-- Leaderboard: expose other users' nicknames+scores for one contest without opening profiles
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
