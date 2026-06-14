-- 頭像 URL 欄位 + 頭像儲存空間(公開 bucket)
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar public read" on storage.objects;
create policy "avatar public read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatar own upload" on storage.objects;
create policy "avatar own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar own update" on storage.objects;
create policy "avatar own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar own delete" on storage.objects;
create policy "avatar own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 好友排行加回傳 avatar_url(回傳型別變更,需先 DROP)
drop function if exists public.get_friends_board();
create function public.get_friends_board()
returns table(nickname text, xp int, week_xp int, pet text, frame text, avatar_url text, friend_code text, is_me boolean)
language sql stable security definer set search_path = public as $$
  select p.nickname, p.xp, p.week_xp, p.pet, p.equipped_frame, p.avatar_url, p.friend_code, p.id = auth.uid()
  from profiles p
  where p.id = auth.uid()
     or p.id in (select friend_id from friendships where user_id = auth.uid())
  order by week_xp desc, xp desc;
$$;
revoke all on function public.get_friends_board() from anon;
grant execute on function public.get_friends_board() to authenticated;
