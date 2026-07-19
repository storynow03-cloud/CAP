-- 修復:搬遷後 identity 序列(sequence)沒有推進,導致新 insert 主鍵衝突
--
-- 背景:restore-3-data.mjs 用 OVERRIDING SYSTEM VALUE 把舊資料連同 id 一起灌回
-- 新專案的 `bigint generated always as identity` 欄位,但沒有同步把每張表的 identity
-- 序列 setval 到 max(id)。結果搬遷後任何新 insert 都會拿到一個早已存在的小 id,
-- 觸發 `duplicate key value violates unique constraint "..._pkey"`,全系統無法記錄新
-- 作答 / 大會考 / 商品 / 秘境等任何有自動遞增主鍵的資料。
--
-- 本檔一次把 public schema 底下所有 identity 欄位的序列推進到 max(id)+1。
-- 可重複執行(idempotent),之後若再搬遷,restore 灌完資料後應再跑一次這段。

do $$
declare
  r record;
  mx bigint;
  seq text;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and is_identity = 'YES'
  loop
    seq := pg_get_serial_sequence('public.' || r.table_name, r.column_name);
    if seq is not null then
      execute format('select coalesce(max(%I), 0) from public.%I', r.column_name, r.table_name)
        into mx;
      -- mx>0:setval(seq, mx, true) → 下一個 id = mx+1
      -- mx=0(空表):setval(seq, 1, false) → 下一個 id = 1
      perform setval(seq, greatest(mx, 1), mx > 0);
    end if;
  end loop;
end $$;
