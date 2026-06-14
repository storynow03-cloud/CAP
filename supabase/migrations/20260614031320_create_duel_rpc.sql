-- 建立一場 PK 對戰:用好友碼找對手,隨機抽 5 題,回傳 duel id
create or replace function public.create_duel(opp_code text, subj text)
returns bigint language plpgsql security definer set search_path = public as $$
declare opp uuid; qids text[]; new_id bigint;
begin
  select id into opp from profiles where friend_code = upper(opp_code);
  if opp is null or opp = auth.uid() then return null; end if;
  -- 必須是好友
  if not exists (select 1 from friendships where user_id = auth.uid() and friend_id = opp) then
    return null;
  end if;
  select array_agg(id) into qids from (
    select id from questions
    where subject = subj and not needs_review and type = 'single_choice'
    order by random() limit 5
  ) t;
  if qids is null or array_length(qids, 1) < 5 then return null; end if;
  insert into duels(challenger, opponent, subject, question_ids)
  values (auth.uid(), opp, subj, qids) returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.create_duel(text, text) from anon;
grant execute on function public.create_duel(text, text) to authenticated;

-- 對戰雙方都要能看到對方暱稱 → RPC 取單場對戰詳情(含雙方暱稱)
create or replace function public.get_duel(duel_id bigint)
returns table(
  id bigint, subject text, question_ids text[],
  challenger uuid, opponent uuid,
  ch_name text, op_name text,
  ch_score int, ch_time bigint, ch_done boolean,
  op_score int, op_time bigint, op_done boolean,
  am_i_challenger boolean
)
language sql stable security definer set search_path = public as $$
  select d.id, d.subject, d.question_ids, d.challenger, d.opponent,
         pc.nickname, po.nickname,
         d.ch_score, d.ch_time, d.ch_done, d.op_score, d.op_time, d.op_done,
         d.challenger = auth.uid()
  from duels d
  join profiles pc on pc.id = d.challenger
  join profiles po on po.id = d.opponent
  where d.id = duel_id and auth.uid() in (d.challenger, d.opponent);
$$;
revoke all on function public.get_duel(bigint) from anon;
grant execute on function public.get_duel(bigint) to authenticated;

-- 列出我的對戰(含雙方暱稱)
create or replace function public.my_duels()
returns table(
  id bigint, subject text, ch_name text, op_name text,
  ch_score int, ch_time bigint, ch_done boolean,
  op_score int, op_time bigint, op_done boolean,
  am_i_challenger boolean, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select d.id, d.subject, pc.nickname, po.nickname,
         d.ch_score, d.ch_time, d.ch_done, d.op_score, d.op_time, d.op_done,
         d.challenger = auth.uid(), d.created_at
  from duels d
  join profiles pc on pc.id = d.challenger
  join profiles po on po.id = d.opponent
  where auth.uid() in (d.challenger, d.opponent)
  order by d.created_at desc limit 30;
$$;
revoke all on function public.my_duels() from anon;
grant execute on function public.my_duels() to authenticated;
