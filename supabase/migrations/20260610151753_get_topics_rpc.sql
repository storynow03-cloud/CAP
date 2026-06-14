create or replace function public.get_topics(subj text)
returns table(topic text, cnt bigint)
language sql stable security definer set search_path = public as $$
  select topic, count(*) cnt
  from questions
  where subject = subj and not needs_review and type = 'single_choice'
  group by topic
  order by topic;
$$;
revoke all on function public.get_topics(text) from anon;
grant execute on function public.get_topics(text) to authenticated;
