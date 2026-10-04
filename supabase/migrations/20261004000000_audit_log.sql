-- 操作紀錄日誌(2026-10-04):重要資料表的每一次新增/修改/刪除都自動記錄「改之前 / 改之後」,
-- 管理後台(/admin/audit)可以查詢並一鍵還原。
--
-- 為什麼用觸發器:不只管理後台的操作,連腳本大量修題(restore-eq-fields 等)、SQL Editor 手動改的,
-- 也都會被記錄;不靠每支程式自己記得寫日誌。
-- 誰改的:管理後台 API 呼叫 Supabase 時帶 x-actor 標頭(PostgREST 會放進 request.headers),
-- 觸發器讀出來記錄;腳本或 SQL Editor 改的 actor 是 null,畫面顯示「系統/腳本」。
--
-- 只記「內容類」資料表(題目、商城、寵物、副本、回報),不記 profiles / attempts 這種
-- 每答一題就變動的表,否則日誌會被雜訊淹沒。

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  op text not null check (op in ('INSERT','UPDATE','DELETE')),
  row_id text not null,
  before jsonb,
  after jsonb,
  -- 還原操作本身也會產生一筆日誌,這裡標記它還原的是哪一筆
  restored_from bigint
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id, at desc);

alter table public.audit_log enable row level security;
-- 只有管理者(teacher/parent)能讀;寫入只透過觸發器(security definer)
drop policy if exists audit_log_staff_read on public.audit_log;
create policy audit_log_staff_read on public.audit_log for select
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('teacher','parent')));

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hdr json;
  actor_id uuid;
  restored bigint;
  rid text;
begin
  begin
    hdr := nullif(current_setting('request.headers', true), '')::json;
    actor_id := nullif(hdr->>'x-actor', '')::uuid;
    restored := nullif(hdr->>'x-restored-from', '')::bigint;
  exception when others then
    actor_id := null; restored := null;
  end;
  if actor_id is null then actor_id := auth.uid(); end if;

  if tg_op = 'DELETE' then
    rid := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'key');
    insert into audit_log(actor, table_name, op, row_id, before, after, restored_from)
      values (actor_id, tg_table_name, tg_op, rid, to_jsonb(old), null, restored);
    return old;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) = to_jsonb(new) then return new; end if;
    rid := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key');
    insert into audit_log(actor, table_name, op, row_id, before, after, restored_from)
      values (actor_id, tg_table_name, tg_op, rid, to_jsonb(old), to_jsonb(new), restored);
    return new;
  else
    rid := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key');
    insert into audit_log(actor, table_name, op, row_id, before, after, restored_from)
      values (actor_id, tg_table_name, tg_op, rid, null, to_jsonb(new), restored);
    return new;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['questions','shop_items','shop_categories','pet_defs','realms','question_reports'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s
                      for each row execute function public.audit_trigger()', t);
    end if;
  end loop;
end $$;

-- 一鍵還原某一筆日誌:UPDATE → 改回修改前;DELETE → 把刪掉的列放回去;INSERT → 刪掉新增的列。
-- 還原本身也會被觸發器記成新日誌(restored_from 指向原日誌),所以還原也可以再還原。
create or replace function public.audit_restore(p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare
  l audit_log;
  cols text;
  is_service boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') = 'service_role';
begin
  if not is_service and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role in ('teacher','parent')
  ) then
    raise exception '需要管理者權限';
  end if;
  select * into l from audit_log where id = p_id;
  if l.id is null then raise exception '找不到這筆日誌'; end if;
  if l.table_name not in ('questions','shop_items','shop_categories','pet_defs','realms','question_reports') then
    raise exception '這張表不支援還原';
  end if;

  if l.op = 'UPDATE' then
    -- 只還原一般欄位(主鍵/自動產生欄位不能更新)
    select string_agg(format('%I = r.%I', column_name, column_name), ', ') into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = l.table_name
       and is_identity = 'NO' and is_generated = 'NEVER' and column_name <> 'id';
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id::text = $2',
                   l.table_name, cols, l.table_name) using l.before, l.row_id;
  elsif l.op = 'DELETE' then
    execute format('insert into public.%I overriding system value select * from jsonb_populate_record(null::public.%I, $1)',
                   l.table_name, l.table_name) using l.before;
  else
    execute format('delete from public.%I where id::text = $1', l.table_name) using l.row_id;
  end if;
  return 'ok';
end $$;
revoke all on function public.audit_restore(bigint) from public;
grant execute on function public.audit_restore(bigint) to authenticated, service_role;
