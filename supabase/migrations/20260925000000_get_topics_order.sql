-- 讓 get_topics 一併回傳章節編號來源(subtopic / source),前端才能依「課程進度」排序。
--
-- 為什麼:原本 order by topic 是中文筆畫排序,所以自然九上會排成
-- 「位移與路徑長 → 功與功率 → 加速度 → 動能…」,跟課本順序無關,孩子對不上進度。
--
-- 各科的編號存放位置不同:
--   自然 subtopic='01-02'、數學 subtopic='3-2'、社會 subtopic='01-05'
--   國文 subtopic 為 null,但 source='1_題庫題目/03人間好時節' 帶課次
--   英語 subtopic 為 null,課次在 topic 自身的 'L1_' 前綴
-- 而且數學('3-2')與英語('L10')沒有補零,純文字排序會把 10 排到 3 前面,
-- 因此實際排序交給前端做自然排序(把數字拆出來比大小),這裡只負責把原始資料帶出去。
--
-- source 取 min():同一單元可能有「1_題庫題目/」「7_同步練習卷/」等多個來源,
-- min() 會取到 1_ 開頭那個,正好是帶乾淨課次編號的主來源。

drop function if exists public.get_topics(text);

create or replace function public.get_topics(subj text)
returns table(topic text, cnt bigint, volume text, subtopic text, source text)
language sql stable security definer set search_path = public as $$
  with base as (
    select q.topic, q.volume, q.subtopic, q.source
    from questions q
    where q.subject = subj and not q.needs_review and q.type = 'single_choice'
  ),
  per_volume as (
    select b.topic, b.volume, count(*) as c
    from base b
    group by b.topic, b.volume
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
  ),
  meta as (
    select b.topic, min(b.subtopic) as subtopic, min(b.source) as source
    from base b
    group by b.topic
  )
  select r.topic, r.total::bigint as cnt, r.volume, m.subtopic, m.source
  from ranked r
  left join meta m on m.topic = r.topic
  where r.rn = 1
  order by r.volume nulls last, r.topic;
$$;

revoke all on function public.get_topics(text) from anon;
grant execute on function public.get_topics(text) to authenticated;
