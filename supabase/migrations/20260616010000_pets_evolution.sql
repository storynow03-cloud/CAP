-- 夥伴進化改吃「等級 + 好感度」:好友排行 RPC 需一起回傳 pet_affection,
-- 好友列表的夥伴進化階段才會與本人頁面一致。

drop function if exists public.get_friends_board();
create or replace function public.get_friends_board()
returns table(nickname text, xp int, week_xp int, pet text, pet_affection int,
              frame text, friend_code text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.nickname, p.xp, p.week_xp, p.pet, p.pet_affection, p.equipped_frame, p.friend_code, p.id = auth.uid()
  from profiles p
  where p.id = auth.uid()
     or p.id in (select friend_id from friendships where user_id = auth.uid())
  order by week_xp desc, xp desc;
$$;
revoke all on function public.get_friends_board() from anon;
grant execute on function public.get_friends_board() to authenticated;
