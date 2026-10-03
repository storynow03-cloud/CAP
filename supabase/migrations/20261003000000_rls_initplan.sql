-- 權限規則(RLS)加速:auth.uid() / auth.role() 改成 (select auth.uid()) / (select auth.role())
--
-- 為什麼:直接寫 auth.uid() = user_id 時,Postgres 會對「每一列」重新呼叫一次 auth.uid()。
-- 題庫有近 10 萬列,questions 的規則 auth.role() = 'authenticated' 光是判斷權限就要上百毫秒。
-- 包成 (select auth.uid()) 後,Postgres 會把它當成整個查詢只算一次的常數(initPlan),
-- 結果完全一樣、只是快很多。這是 Supabase 官方文件的建議寫法
-- (Database Advisors 的「auth_rls_initplan」警告就是在抓這個)。
--
-- 做法:不重建規則(後續 migration 改過部分規則,重建可能覆蓋掉),而是讀出資料庫「目前」
-- 每條規則的條件文字,只把 auth.xxx() 包起來,其餘條件原封不動,用 ALTER POLICY 改回去。
-- 已經包過的(含 "SELECT auth.")會跳過,所以重跑也安全。
--
-- ⚠️ 請在 Supabase SQL Editor 執行,執行前確認左上角專案是「CAP」(不是 CAP-review)。

do $$
declare
  p record;
  new_qual text;
  new_check text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.(uid|role|jwt)\(\)' or coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)')
      and coalesce(qual, '') !~* 'select auth\.'
      and coalesce(with_check, '') !~* 'select auth\.'
  loop
    new_qual  := regexp_replace(p.qual,       'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(p.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is not null then sql := sql || format(' using (%s)', new_qual); end if;
    if new_check is not null then sql := sql || format(' with check (%s)', new_check); end if;
    execute sql;
    raise notice '已更新:%.% → %', p.tablename, p.policyname, coalesce(new_qual, new_check);
  end loop;
end $$;

-- 驗證:結果應該是 0 列(所有規則都已改成 select 包起來的寫法)
select tablename, policyname, qual, with_check
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') ~ 'auth\.(uid|role|jwt)\(\)' or coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)')
  and coalesce(qual, '') !~* 'select auth\.'
  and coalesce(with_check, '') !~* 'select auth\.';
