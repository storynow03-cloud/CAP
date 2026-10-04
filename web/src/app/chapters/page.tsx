"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ChapterTag from "@/components/ChapterTag";
import { chapterInfo, fetchTopicChapters, socialBranch, volumeNumber, type ChapterFields } from "@/lib/chapter";

// 科目按鈕:社會拆成歷史/地理/公民(資料仍是 social,依分科篩選)
const TABS = [
  { key: "chinese", subject: "chinese", label: "國文", color: "#e11d48" },
  { key: "english", subject: "english", label: "英語", color: "#2563eb" },
  { key: "math", subject: "math", label: "數學", color: "#7c3aed" },
  { key: "science", subject: "science", label: "自然", color: "#059669" },
  { key: "history", subject: "social", label: "歷史", color: "#b45309" },
  { key: "geography", subject: "social", label: "地理", color: "#d97706" },
  { key: "civics", subject: "social", label: "公民", color: "#ca8a04" },
];
const GRADES = ["", "七上", "七下", "八上", "八下", "九上", "九下"];
// 單元自然排序:「2-10」排在「2-9」後面
const natural = (a: string, b: string) => a.localeCompare(b, "zh-Hant", { numeric: true });

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
  const [tab, setTab] = useState("math");
  const subject = TABS.find((t) => t.key === tab)!.subject;
  const [chapters, setChapters] = useState<Map<string, ChapterFields>>(new Map());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (subj: string) => {
    setLoading(true);
    const supabase = createClient();
    const [{ data }, ch] = await Promise.all([
      supabase.rpc("get_chapter_overview", { subj }),
      fetchTopicChapters(supabase, [subj]),
    ]);
    setRows((data as Row[]) ?? []);
    setChapters(ch);
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
  const chapterOf = (topic: string): ChapterFields => chapters.get(`${subject}|${topic}`) ?? { subject, topic };
  // 社會:只留目前分科的章節
  const shown = rows.filter((r) => subject !== "social" || socialBranch(chapterOf(r.topic)) === tab);
  // 依冊別分組(七上…九下),組內依單元編號排序;沒有冊別的(會考綜合卷等)放最後
  const groups = [...shown.reduce((m, r) => {
    const v = volumeNumber(chapterOf(r.topic).volume) ?? 99;
    if (!m.has(v)) m.set(v, []);
    m.get(v)!.push(r);
    return m;
  }, new Map<number, Row[]>())]
    .sort(([a], [b]) => a - b)
    .map(([v, list]) => ({
      v,
      list: list.sort((a, b) => natural(chapterInfo(chapterOf(a.topic)).unit, chapterInfo(chapterOf(b.topic)).unit)),
    }));
  const rated = shown.filter((r) => r.self_rating != null);
  const gap = shown.filter(
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
        {TABS.map((s) => (
          <button key={s.key} onClick={() => setTab(s.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === s.key ? "text-white" : "bg-white text-slate-600 shadow-sm"}`}
            style={tab === s.key ? { backgroundColor: s.color } : {}}>
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
          <p className="text-xs text-slate-400">共 {shown.length} 章節|已自評 {rated.length} 個|依年級・冊別排列</p>
          {groups.map(({ v, list }) => (
          <div key={v} className="space-y-2">
            <h2 className="sticky top-0 z-10 -mx-1 bg-slate-50/90 px-1 py-1 text-sm font-bold text-slate-600 backdrop-blur">
              {v === 99 ? "其他(會考綜合、未標冊別)" : `${GRADES[v]}・第 ${v} 冊`}
              <span className="ml-2 text-xs font-normal text-slate-400">{list.length} 個單元</span>
            </h2>
            {list.map((r) => {
              const practiced = !!r.sys_attempts;
              return (
                <div key={r.topic} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{chapterInfo(chapterOf(r.topic)).unit || r.topic}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-400">
                        <ChapterTag q={{ ...chapterOf(r.topic), topic: "", subtopic: null, source: null }} compact />
                        {r.q_count} 題
                      </p>
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
          ))}
        </>
      )}
    </div>
  );
}
