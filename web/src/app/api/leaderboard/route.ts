import { NextResponse } from "next/server";
import { requireUser, adminFetch } from "@/lib/supabase/admin";
import { capScore, predictCap, type PredictAttempt } from "@/lib/cap-predict";

/**
 * 兩個「會考積分」榜單(登入即可看,所有學生一起排;都換算成 A++=7…C=1、五科滿分 35):
 *   📘 練習會考積分:平常練習的題目換算(練過的範圍)——國一、國二也能靠平常練習上榜
 *   🎯 真題會考積分:只算歷屆會考真題——鼓勵大家去寫會考真題
 * 每科至少 20 題才給等級(lib/cap-predict.ts)。
 * 學生的作答紀錄受 RLS 保護,只能由後端用服務金鑰彙整,回傳的只有統計數字。
 */

type Att = PredictAttempt;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const students: { id: string; nickname: string; avatar_url: string | null }[] =
    await (await adminFetch("/rest/v1/profiles?role=eq.student&select=id,nickname,avatar_url&order=nickname")).json();

  const rows = await Promise.all(students.map(async (s) => {
    const atts: Att[] = [];
    for (let off = 0; off < 3000; off += 1000) {
      const page = await (await adminFetch(
        `/rest/v1/attempts?user_id=eq.${s.id}&select=question_id,is_correct,created_at,time_spent_ms,questions(subject,difficulty,volume,type,source)&order=created_at.desc&limit=1000&offset=${off}`
      )).json();
      if (!Array.isArray(page)) break;
      atts.push(...page);
      if (page.length < 1000) break;
    }
    const practice = predictCap(atts, "practice"), real = predictCap(atts, "real");
    const grades = (list: typeof practice) => list.map((p) => ({ subject: p.subject, grade: p.grade, questions: p.questions }));
    return {
      user_id: s.id, nickname: s.nickname, avatar_url: s.avatar_url, is_me: s.id === auth.user.id,
      practice: { ...capScore(practice), grades: grades(practice), volumes: [...new Set(practice.flatMap((p) => p.volumes))].sort() },
      real: { ...capScore(real), grades: grades(real) },
    };
  }));
  return NextResponse.json({ rows });
}
