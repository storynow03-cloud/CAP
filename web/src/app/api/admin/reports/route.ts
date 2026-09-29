import { NextRequest, NextResponse } from "next/server";
import { requireStaff, adminFetch } from "@/lib/supabase/admin";

/**
 * 題目回報處理(管理者)。
 * GET   → 待處理的回報,依題目彙整(同一題多人回報只列一次),附完整題目內容供判斷
 * PATCH { questionId, action } → 處理某題的所有待處理回報
 *   hide    隱藏這題(needs_review = true),孩子不會再抽到
 *   fixed   已修正題目內容(題目保持可用)
 *   dismiss 題目沒問題,結案
 */

interface Report {
  id: number; question_id: string; user_id: string; reason: string; note: string | null; created_at: string;
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const reports: Report[] = await (
    await adminFetch("/rest/v1/question_reports?status=eq.open&select=*&order=created_at.desc&limit=500")
  ).json();
  if (!Array.isArray(reports)) return NextResponse.json({ error: "讀取回報失敗(資料表是否已建立?)" }, { status: 500 });
  if (!reports.length) return NextResponse.json({ items: [] });

  const qids = [...new Set(reports.map((r) => r.question_id))];
  const uids = [...new Set(reports.map((r) => r.user_id))];
  const questions = await (
    await adminFetch(`/rest/v1/questions?id=in.(${qids.map(encodeURIComponent).join(",")})&select=id,subject,topic,question,options,answer,answer_text,explanation,needs_review`)
  ).json();
  const profiles = await (
    await adminFetch(`/rest/v1/profiles?id=in.(${uids.join(",")})&select=id,nickname`)
  ).json();
  const nick = new Map((profiles as { id: string; nickname: string }[]).map((p) => [p.id, p.nickname]));
  const qmap = new Map((questions as { id: string }[]).map((q) => [q.id, q]));

  const items = qids.map((qid) => ({
    question: qmap.get(qid) ?? null,
    reports: reports
      .filter((r) => r.question_id === qid)
      .map((r) => ({ reason: r.reason, note: r.note, created_at: r.created_at, by: nick.get(r.user_id) ?? "?" })),
  }));
  return NextResponse.json({ items });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { questionId, action } = await req.json();
  const status = ({ hide: "hidden", fixed: "fixed", dismiss: "dismissed" } as Record<string, string>)[action];
  if (!questionId || !status) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });

  if (action === "hide") {
    const r = await adminFetch(`/rest/v1/questions?id=eq.${encodeURIComponent(questionId)}`, {
      method: "PATCH", body: JSON.stringify({ needs_review: true }),
    });
    if (!r.ok) return NextResponse.json({ error: "隱藏題目失敗" }, { status: 500 });
  }

  const r = await adminFetch(
    `/rest/v1/question_reports?question_id=eq.${encodeURIComponent(questionId)}&status=eq.open`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, resolved_at: new Date().toISOString(), resolved_by: auth.user.id }),
    }
  );
  if (!r.ok) return NextResponse.json({ error: "更新回報失敗" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
