"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/types";

interface Row {
  topic: string;
  q_count: number;
  sys_score: number | null;
  sys_level: number | null;
  sys_attempts: number | null;
  self_rating: number | null;
}

const SELF_LABEL = ["", "不會", "有點", "普通", "熟", "精通"];

export default function ChaptersPage() {
  const [subject, setSubject] = useState("math");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (subj: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.rpc("get_chapter_overview", { subj });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(subject);
  }, [subject, load]);

  async function rate(topic: string, rating: number) {
    // 樂觀更新
    setRows((prev) => prev.map((r) => (r.topic === topic ? { ...r, self_rating: rating } : r)));
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("self_assessment").upsert({
      user_id: u.user!.id, subject, topic, rating, updated_at: new Date().toISOString(),
    });
  }

  // 統計:需注意的章節(自評低 或 系統低 或 自評高但系統低)
  const rated = rows.filter((r) => r.self_rating != null);
  const gap = rows.filter(
    (r) => r.self_rating != null && r.self_rating >= 4 && r.sys_attempts && r.sys_score != null && r.sys_score < 60
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/history" className="text-sm accent-text">← 學習歷程</Link>
      </div>
      <h1 className="text-xl font-bold">📋 章節掌握度總檢查</h1>
      <p className="text-sm text-slate-500">
        自己點選對每個章節的掌握程度,系統也會依你的練習表現顯示客觀掌握度,兩者對照找出盲點。
      </p>

      {/* 科目選擇 */}
      <div className="flex flex-wrap gap-2">
        {SUBJECTS.map((s) => (
          <button key={s.key} onClick={() => setSubject(s.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${subject === s.key ? "text-white" : "bg-white text-slate-600 shadow-sm"}`}
            style={subject === s.key ? { backgroundColor: s.color } : {}}>
            {s.label}
          </button>
        ))}
      </div>

      {/* 提醒:自評與系統有落差 */}
      {gap.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          ⚠️ 有 {gap.length} 個章節你自評「熟/精通」,但系統顯示練習表現偏弱,建議再確認:
          <span className="font-semibold">{gap.slice(0, 3).map((g) => g.topic).join("、")}{gap.length > 3 ? "…" : ""}</span>
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-slate-500">載入中…</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">共 {rows.length} 章節|已自評 {rated.length} 個</p>
          <div className="space-y-2">
            {rows.map((r) => {
              const practiced = !!r.sys_attempts;
              return (
                <div key={r.topic} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.topic}</p>
                      <p className="text-xs text-slate-400">{r.q_count} 題</p>
                    </div>
                    {/* 系統掌握度 */}
                    <div className="w-28 shrink-0 text-right">
                      {practiced ? (
                        <>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full"
                              style={{ width: `${r.sys_score ?? 0}%`, backgroundColor: (r.sys_score ?? 0) < 60 ? "#e11d48" : (r.sys_score ?? 0) < 80 ? "#d97706" : "#059669" }} />
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">
                            系統 {Math.round(r.sys_score ?? 0)}分・Lv{r.sys_level}
                          </p>
                        </>
                      ) : (
                        <Link href={`/practice`} className="text-xs accent-text underline">尚未練習,去做題</Link>
                      )}
                    </div>
                  </div>
                  {/* 自評 */}
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="mr-1 text-xs text-slate-400">我覺得:</span>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => rate(r.topic, n)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                          r.self_rating === n ? "accent-bg text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}>
                        {SELF_LABEL[n]}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
