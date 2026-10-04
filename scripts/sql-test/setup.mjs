// 在本機 PGlite(記憶體中的 PostgreSQL)模擬 Supabase:建立 auth/storage 假結構後,依序執行全部 migration。
// 用途:改資料庫前先在本機確認 SQL 能跑、邏輯正確,不碰正式資料庫。執行:node scripts/sql-test/scenarios.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const MIG = "D:/Claude/國中會考/supabase/migrations";
const db = new PGlite();

const STUB = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`;
await db.exec(STUB);

const files = fs.readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  try {
    await db.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
    console.log("✅", f);
  } catch (e) {
    console.log("❌", f, "→", e.message);
  }
}
await db.exec(`grant usage on schema public to authenticated, anon, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;`);

export { db };
