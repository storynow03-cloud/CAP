-- 使用者資料
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null default '',
  role text not null default 'student' check (role in ('student','parent','teacher')),
  grade int,
  exam_date date default '2027-05-15',
  daily_goal int not null default 20,
  created_at timestamptz not null default now()
);

-- 題庫
create table public.questions (
  id text primary key,
  subject text not null,
  volume text,
  topic text not null,
  subtopic text,
  difficulty int not null check (difficulty between 1 and 5),
  type text not null default 'single_choice',
  question text not null,
  passage text,
  image text,
  options jsonb,
  answer int,
  answer_text text,
  explanation text,
  source text,
  curriculum_code text,
  knowledge_code text,
  tags text[] not null default '{}',
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);
create index questions_pick_idx on public.questions (subject, topic, difficulty) where not needs_review;

-- 作答紀錄
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

-- 精熟度(使用者 × 科目 × 單元)
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

-- 錯題本
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

-- 模擬考場次
create table public.exam_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  subject text not null,
  total int,
  correct int,
  grade text,
  started_at timestamptz,
  finished_at timestamptz
);

-- 每日統計
create table public.daily_stats (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  total int not null default 0,
  correct int not null default 0,
  minutes int not null default 0,
  primary key (user_id, day)
);

-- 註冊時自動建立 profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.mastery enable row level security;
alter table public.wrong_book enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.daily_stats enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "questions readable by signed-in" on public.questions for select using (auth.role() = 'authenticated');
create policy "own attempts" on public.attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own mastery" on public.mastery for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wrong_book" on public.wrong_book for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own exam_sessions" on public.exam_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own daily_stats" on public.daily_stats for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
