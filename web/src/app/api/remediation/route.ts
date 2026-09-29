import { NextRequest, NextResponse } from "next/server";
import { requireUser, adminFetch } from "@/lib/supabase/admin";
import { applyAnswer, recheckDue, requiredHard, type TargetState } from "@/lib/remediation";
import { pickRemediationQuestions, topicCodes, hardAvailable } from "@/lib/remediation-server";

/**
 * 補強練習。只有目標的主人(孩子本人)能作答。
 * GET  ?targetId=      → 下一批題目(真題優先)
 * POST { targetId, questionId, selected } → 伺服器用題目的正確答案判定對錯,更新過關進度
 *
 * 對錯一定由伺服器判定:若讓前端直接回報「我答對了」,進度就能被竄改。
 */

interface TargetRow extends TargetState {
  id: number;
  user_id: string;
  subject: string;
  topic: string;
}

async function loadOwnTarget(targetId: string, userId: string) {
  const [t] = await (await adminFetch(`/rest/v1/remediation_targets?id=eq.${Number(targetId)}&select=*`)).json();
  if (!t) return { error: "找不到這個補強任務", status: 404 } as const;
  if (t.user_id !== userId) return { error: "這不是你的補強任務", status: 403 } as const;
  return { target: t as TargetRow } as const;
}

function canPractice(t: TargetRow) {
  if (t.status === "graduated") return "這個單元已經畢業了 🎓";
  if (t.status === "recheck" && !recheckDue(t)) return "已過關,等複測日再來";
  return null;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const r = await loadOwnTarget(req.nextUrl.searchParams.get("targetId") ?? "", auth.user.id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const t = r.target;
  const blocked = canPractice(t);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const { questions, realCount, exhausted } = await pickRemediationQuestions(t.subject, t.topic, t);
  if (exhausted) {
    // 題目都出過一輪了,清空紀錄重新輪
    await adminFetch(`/rest/v1/remediation_targets?id=eq.${t.id}`, {
      method: "PATCH", body: JSON.stringify({ seen_ids: [] }),
    });
  }
  return NextResponse.json({ questions, realCount, exhausted });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  const r = await loadOwnTarget(String(body?.targetId ?? ""), auth.user.id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const t = r.target;
  const blocked = canPractice(t);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });

  const questionId = String(body?.questionId ?? "");
  const [q] = await (
    await adminFetch(`/rest/v1/questions?id=eq.${encodeURIComponent(questionId)}&select=id,subject,answer,difficulty`)
  ).json();
  if (!q || q.subject !== t.subject) return NextResponse.json({ error: "題目不屬於這個補強任務" }, { status: 400 });

  const correct = Number(body?.selected) === q.answer;
  const codes = await topicCodes(t.subject, t.topic);
  const hard = await hardAvailable(t.subject, t.topic, codes);
  const next = applyAnswer(t, { questionId, correct, difficulty: q.difficulty, hardAvailable: hard });

  const upd = await adminFetch(`/rest/v1/remediation_targets?id=eq.${t.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: next.status,
      streak: next.streak,
      hard_in_streak: next.hard_in_streak,
      seen_ids: next.seen_ids,
      total_attempts: next.total_attempts,
      total_correct: next.total_correct,
      passed_at: next.passed_at,
      recheck_due_at: next.recheck_due_at,
      recheck_correct: next.recheck_correct,
      graduated_at: next.graduated_at,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!upd.ok) return NextResponse.json({ error: "更新進度失敗" }, { status: 500 });

  return NextResponse.json({
    correct,
    state: next,
    requiredHard: requiredHard(hard),
    justPassed: t.status === "practicing" && next.status === "recheck",
    justGraduated: t.status !== "graduated" && next.status === "graduated",
    backToPractice: t.status === "recheck" && next.status === "practicing",
  });
}
