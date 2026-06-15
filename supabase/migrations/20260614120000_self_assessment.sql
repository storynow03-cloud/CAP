-- 學生自評各章節掌握度 + 章節總覽 RPC(自評 vs 系統掌握度)
create table if not exists public.self_assessment (
  user_id uuid not null references auth.users on delete cascade,
  subject text not null,
  topic text not null,
  rating int not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, subject, topic)
);
alter table public.self_assessment enable row level security;
create policy "own self_assessment" on public.self_assessment for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.get_chapter_overview(subj text)
returns table(topic text, q_count bigint, sys_score numeric, sys_level int, sys_attempts int, self_rating int)
language sql stable security definer set search_path = public as $$
  select t.topic, t.cnt, m.score, m.level, m.attempts_count, s.rating
  from (
    select topic, count(*) cnt from questions
    where subject = subj and not needs_review and type = 'single_choice'
      and topic !~ '^[0-9]{3}年會考$'   -- 排除年度卷,只留課程章節
    group by topic
  ) t
  left join mastery m on m.user_id = auth.uid() and m.subject = subj and m.topic = t.topic
  left join self_assessment s on s.user_id = auth.uid() and s.subject = subj and s.topic = t.topic
  order by t.topic;
$$;
revoke all on function public.get_chapter_overview(text) from anon;
grant execute on function public.get_chapter_overview(text) to authenticated;
