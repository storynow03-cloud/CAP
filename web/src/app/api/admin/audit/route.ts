import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

/**
 * 操作紀錄日誌(管理者)。資料由資料庫觸發器自動寫入(見 migration 20261004000000_audit_log.sql)。
 * GET  ?table=&rowId=&offset=  → 最近的紀錄,每頁 50 筆,附操作者暱稱
 * POST { id }                  → 還原某一筆紀錄(呼叫 audit_restore;還原本身也會留下一筆紀錄)
 */

const PAGE = 50;

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sp = req.nextUrl.searchParams;
  const filters: string[] = [];
  const table = sp.get("table");
  if (table) filters.push(`table_name=eq.${encodeURIComponent(table)}`);
  const rowId = sp.get("rowId")?.trim();
  if (rowId) filters.push(`row_id=eq.${encodeURIComponent(rowId)}`);
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);

  const r = await adminFetch(`/rest/v1/audit_log?select=*&${filters.join("&")}&order=id.desc&limit=${PAGE}&offset=${offset}`);
  const rows = await r.json();
  if (!Array.isArray(rows)) {
    return NextResponse.json(
      { error: "操作紀錄資料表尚未建立:請到 Supabase SQL Editor 執行 supabase/migrations/20261004000000_audit_log.sql" },
      { status: 500 }
    );
  }
  const actors = [...new Set(rows.map((x: { actor: string | null }) => x.actor).filter(Boolean))];
  const profiles = actors.length
    ? await (await adminFetch(`/rest/v1/profiles?id=in.(${actors.join(",")})&select=id,nickname`)).json()
    : [];
  const nick = Object.fromEntries((profiles as { id: string; nickname: string }[]).map((p) => [p.id, p.nickname]));
  return NextResponse.json({ logs: rows, nick, offset, pageSize: PAGE });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await req.json();
  if (!Number.isInteger(id)) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  const r = await adminFetch("/rest/v1/rpc/audit_restore", {
    method: "POST",
    headers: { "x-actor": auth.user.id, "x-restored-from": String(id) },
    body: JSON.stringify({ p_id: id }),
  });
  if (!r.ok) return NextResponse.json({ error: `還原失敗:${await r.text()}` }, { status: 500 });
  return NextResponse.json({ ok: true });
}
