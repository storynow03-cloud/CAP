-- 讓 get_topics 一併回傳冊次(volume),前端才能把單元依年級分組。
--
-- 為什麼:原本下拉選單是 68~138 個單元依中文筆畫排序的一長串,孩子要在裡面找
-- 「學校現在上到的那一單元」幾乎不可能。questions.volume 本來就存著「第 1 冊」~
-- 「第 6 冊」(對應七上~九下),拿出來分組即可,不需要新資料。
--
-- 跨冊處理:極少數單元橫跨多冊(數學「應用問題」跨第1/2/3冊),取題數最多的那一冊,
-- 避免同一單元在選單裡重複出現。
-- volume 為 null 的單元全部是「103~114年會考」真題,前端會獨立成一組。
--
-- 注意:Postgres 不允許用 CREATE OR REPLACE 改變回傳型別,必須先 DROP。

drop function if exists public.get_topics(text);

create or replace function public.get_topics(subj text)
returns table(topic text, cnt bigint, volume text)
language sql stable security definer set search_path = public as $$
  with per_volume as (
    select q.topic, q.volume, count(*) as c
    from questions q
    where q.subject = subj and not q.needs_review and q.type = 'single_choice'
    group by q.topic, q.volume
  ),
  ranked as (
    select
      p.topic,
      p.volume,
      sum(p.c) over (partition by p.topic) as total,
      row_number() over (
        partition by p.topic
        order by p.c desc, p.volume nulls last
      ) as rn
    from per_volume p
  )
  select r.topic, r.total::bigint as cnt, r.volume
  from ranked r
  where r.rn = 1
  order by r.volume nulls last, r.topic;
$$;

revoke all on function public.get_topics(text) from anon;
grant execute on function public.get_topics(text) to authenticated;
