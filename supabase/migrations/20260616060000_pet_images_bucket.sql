-- 夥伴圖片儲存空間(Phase 3c):管理者上傳夥伴各階段圖片。
-- 公開讀;只有 staff(teacher/parent)能寫。

insert into storage.buckets (id, name, public)
values ('pet-images', 'pet-images', true)
on conflict (id) do nothing;

drop policy if exists "pet img public read" on storage.objects;
create policy "pet img public read" on storage.objects for select using (bucket_id = 'pet-images');

drop policy if exists "pet img staff write" on storage.objects;
create policy "pet img staff write" on storage.objects for insert to authenticated
  with check (bucket_id = 'pet-images' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));

drop policy if exists "pet img staff update" on storage.objects;
create policy "pet img staff update" on storage.objects for update to authenticated
  using (bucket_id = 'pet-images' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));

drop policy if exists "pet img staff delete" on storage.objects;
create policy "pet img staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pet-images' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','parent')));
