import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";
import { CHAPTER_COLUMNS } from "@/lib/chapter";

/**
 * 題目管理(管理者):隱藏的題目孩子看不到,但管理者要能找到、修正、再放出來。
 *
 * GET  ?kw=&subject=&hidden=1|0|&offset=  → 搜尋題目(含隱藏題),每頁 30 題
 * GET  ?id=xxx                            → 單一題目完整內容
 * PATCH { id, fields }                    → 修改題目(題幹/選項/答案/詳解/隱藏狀態)
 *
 * 儲存後,這題所有待處理的回報自動結案(放回題庫 = 已修正、隱藏 = 已隱藏)。
 * 修改會帶 x-actor 標頭,操作紀錄日誌(audit_log)記得是誰改的,改錯可以從 /admin/audit 還原。
 */

const COLS = `id,type,question,options,answer,answer_text,explanation,needs_review,difficulty,${CHAPTER_COLUMNS}`;
const PAGE = 30;
const EDITABLE = ["question", "options", "answer", "answer_text", "explanation", "needs_review", "difficulty"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sp = req.nextUrl.searchParams;

  const id = sp.get("id");
  if (id) {
    const rows = await (await adminFetch(`/rest/v1/questions?id=eq.${encodeURIComponent(id)}&select=${COLS}`)).json();
    return NextResponse.json({ question: Array.isArray(rows) ? rows[0] ?? null : null });
  }

  const filters: string[] = [];
  const subject = sp.get("subject");
  if (subject) filters.push(`subject=eq.${encodeURIComponent(subject)}`);
  const hidden = sp.get("hidden");
  if (hidden === "1") filters.push("needs_review=is.true");
  if (hidden === "0") filters.push("needs_review=is.false");
  const kw = (sp.get("kw") ?? "").trim().replace(/[(),*]/g, " ");
  if (kw) {
    const v = encodeURIComponent(`*${kw}*`);
    filters.push(`or=(id.ilike.${v},question.ilike.${v},topic.ilike.${v},curriculum_code.ilike.${v})`);
  }
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const r = await adminFetch(
    `/rest/v1/questions?select=${COLS}&${filters.join("&")}&order=id&limit=${PAGE}&offset=${offset}`,
    { headers: { Prefer: "count=exact" } }
  );
  const rows = await r.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "查詢失敗" }, { status: 500 });
  const total = Number(r.headers.get("content-range")?.split("/")[1] ?? rows.length);
  return NextResponse.json({ questions: rows, total, offset, pageSize: PAGE });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id, fields } = await req.json();
  if (!id || !fields || typeof fields !== "object") return NextResponse.json({ error: "參數錯誤" }, { status: 400 });

  const body: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in fields) body[k] = fields[k];
  if ("options" in body && body.options !== null && !(Array.isArray(body.options) && body.options.every((o) => typeof o === "string")))
    return NextResponse.json({ error: "選項格式錯誤" }, { status: 400 });
  if ("answer" in body && body.answer !== null && !Number.isInteger(body.answer))
    return NextResponse.json({ error: "答案格式錯誤" }, { status: 400 });
  if (!Object.keys(body).length) return NextResponse.json({ error: "沒有要修改的欄位" }, { status: 400 });

  const r = await adminFetch(`/rest/v1/questions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation", "x-actor": auth.user.id },
    body: JSON.stringify(body),
  });
  if (!r.ok) return NextResponse.json({ error: `儲存失敗:${await r.text()}` }, { status: 500 });
  const [saved] = await r.json();
  // 題目修好(或決定隱藏)後,這題所有待處理的回報自動結案,不用再到「題目回報」手動處理
  await adminFetch(`/rest/v1/question_reports?question_id=eq.${encodeURIComponent(id)}&status=eq.open`, {
    method: "PATCH",
    headers: { "x-actor": auth.user.id, Prefer: "return=minimal" },
    body: JSON.stringify({ status: saved?.needs_review ? "hidden" : "fixed", resolved_at: new Date().toISOString(), resolved_by: auth.user.id }),
  });
  return NextResponse.json({ ok: true, question: saved });
}
