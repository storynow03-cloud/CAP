import { NextResponse } from "next/server";
import { requireUser, adminFetch } from "@/lib/supabase/admin";
import { predictCap, type PredictAttempt } from "@/lib/cap-predict";

/**
 * 兩個「積分」榜單(登入即可看,所有學生一起排):
 *   🎯 會考積分:依做過的題目預估會考等級,換算 A++=7…C=1,五科滿分 35(lib/cap-predict.ts)
 *   💪 練習積點:近 30 天「認真答對」(作答 ≥ 5 秒、同題同日只算一次)的題目難度加總
 *      ——國一、國二還沒學完全部範圍也能靠平常練習上榜;會考積分則鼓勵大家去寫會考真題。
 * 學生的作答紀錄受 RLS 保護,只能由後端用服務金鑰彙整,回傳的只有統計數字。
 */

const GRADE_POINT: Record<string, number> = { "A++": 7, "A+": 6, A: 5, "B++": 4, "B+": 3, B: 2, C: 1 };

interface Att extends PredictAttempt { time_spent_ms: number | null }

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const students: { id: string; nickname: string; avatar_url: string | null }[] =
    await (await adminFetch("/rest/v1/profiles?role=eq.student&select=id,nickname,avatar_url&order=nickname")).json();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const rows = await Promise.all(students.map(async (s) => {
    const atts: Att[] = [];
    for (let off = 0; off < 3000; off += 1000) {
      const page = await (await adminFetch(
        `/rest/v1/attempts?user_id=eq.${s.id}&select=question_id,is_correct,created_at,time_spent_ms,questions(subject,difficulty,volume,type)&order=created_at.desc&limit=1000&offset=${off}`
      )).json();
      if (!Array.isArray(page)) break;
      atts.push(...page);
      if (page.length < 1000) break;
    }
    const preds = predictCap(atts);
    const capPoints = preds.reduce((sum, p) => sum + (GRADE_POINT[p.grade] ?? 0), 0);
    const volumes = [...new Set(preds.flatMap((p) => p.volumes))].sort();

    const seen = new Set<string>();
    let practicePoints = 0, practiceCorrect = 0;
    for (const a of atts) {
      if (a.created_at < since || !a.is_correct || (a.time_spent_ms ?? 0) < 5000 || !a.questions) continue;
      const k = `${a.question_id}|${a.created_at.slice(0, 10)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      practicePoints += a.questions.difficulty ?? 3;
      practiceCorrect++;
    }
    return {
      user_id: s.id, nickname: s.nickname, avatar_url: s.avatar_url, is_me: s.id === auth.user.id,
      capPoints, capGrades: preds.map((p) => ({ subject: p.subject, grade: p.grade, questions: p.questions })),
      volumes, practicePoints, practiceCorrect,
    };
  }));
  return NextResponse.json({ rows });
}
