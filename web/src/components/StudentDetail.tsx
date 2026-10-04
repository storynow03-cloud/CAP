"use client";

import { useEffect, useMemo, useState } from "react";
import { LEVEL_NAMES, subjectLabel } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import ChapterTag from "@/components/ChapterTag";
import { SUBJECT_GROUPS, chapterText, fetchTopicChapters, subjectGroup, unitKey, type ChapterFields } from "@/lib/chapter";
import type { SubjectPrediction } from "@/lib/cap-predict";
import { stripHtml } from "@/lib/html";

/** 管理後台「學習狀況」展開後的學生詳細:會考等級預估、作答量、弱點單元、最近作答(可篩選) */

export interface Detail {
  profile: { nickname: string; xp: number; coins: number; login_streak: number } | null;
  daily: { day: string; total: number; correct: number; minutes: number }[];
  subjects: { subject: string; level: number; score: number; topics: number }[];
  weakTopics: { subject: string; topic: string; level: number; score: number; attempts_count: number }[];
  recent: {
    question_id: string;
    is_correct: boolean;
    mode: string;
    time_spent_ms: number | null;
    created_at: string;
    questions: (ChapterFields & { subject: string; topic: string; question: string }) | null;
  }[];
  wrongCount: number;
  predictions: SubjectPrediction[];
}

const GRADE_COLOR: Record<string, string> = {
  "A++": "bg-emerald-600 text-white", "A+": "bg-emerald-500 text-white", A: "bg-emerald-400 text-white",
  "B++": "bg-amber-500 text-white", "B+": "bg-amber-400 text-white", B: "bg-amber-300 text-amber-900", C: "bg-rose-500 text-white",
};
const GRADE_LABEL = ["", "七上", "七下", "八上", "八下", "九上", "九下"];

export const MODE_LABEL: Record<string, string> = {
  practice: "練習", challenge: "挑戰", exam: "模考", review: "複習",
};


function Predictions({ list }: { list: SubjectPrediction[] }) {
  if (!list.length) return <p className="text-sm text-slate-400">還沒有選擇題作答紀錄,無法預估</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {list.map((p) => {
        const missing = [1, 2, 3, 4, 5, 6].filter((v) => !p.volumes.includes(v)).map((v) => GRADE_LABEL[v]);
        return (
          <div key={p.subject} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{subjectLabel(p.subject)}</span>
              <span className={`rounded-lg px-2 py-0.5 text-lg font-black ${GRADE_COLOR[p.grade] ?? "bg-slate-200"}`}>{p.grade}</span>
              <span className="text-xs text-slate-500">
                預估答對 {Math.round(p.rate * 100)}%・{p.examCount} 題約錯 {p.wrong} 題
              </span>
              <span className={`ml-auto rounded px-1.5 py-0.5 text-[11px] ${p.confidence === "高" ? "bg-emerald-100 text-emerald-700" : p.confidence === "中" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                可信度 {p.confidence}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              依據:做過 {p.questions} 題(只算第一次作答)・
              {p.buckets.map((b) => `${b.label} ${b.n} 題${b.n ? ` 對 ${Math.round((b.correct / b.n) * 100)}%` : ""}`).join("、")}
            </p>
            {missing.length > 0 && (
              <p className="mt-0.5 text-[11px] text-amber-600">尚未練到:{missing.join("、")}(這些範圍不在預估內)</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StudentDetail({ d }: { d: Detail }) {
  const max = Math.max(1, ...d.daily.map((x) => x.total));
  const [chapters, setChapters] = useState<Map<string, ChapterFields>>(new Map());
  const [group, setGroup] = useState("all");
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [kw, setKw] = useState("");

  useEffect(() => {
    fetchTopicChapters(createClient(), d.weakTopics.map((t) => t.subject)).then(setChapters);
  }, [d.weakTopics]);

  const recent = useMemo(() => d.recent.filter((a) => {
    if (!a.questions) return false;
    if (group !== "all" && subjectGroup(a.questions) !== group) return false;
    if (onlyWrong && a.is_correct) return false;
    if (kw && !(chapterText(a.questions) + stripHtml(a.questions.question)).includes(kw)) return false;
    return true;
  }), [d.recent, group, onlyWrong, kw]);

  // 最近答錯集中在哪些單元(家長找補強資源用)
  const wrongUnits = useMemo(() => {
    const m = new Map<string, { q: ChapterFields; wrong: number; total: number }>();
    for (const a of d.recent) {
      if (!a.questions) continue;
      const k = unitKey(a.questions);
      const cur = m.get(k) ?? { q: a.questions, wrong: 0, total: 0 };
      cur.total++;
      if (!a.is_correct) cur.wrong++;
      m.set(k, cur);
    }
    return [...m.values()].filter((u) => u.wrong > 0).sort((a, b) => b.wrong - a.wrong).slice(0, 10);
  }, [d.recent]);

  return (
    <div className="space-y-4">
      {/* 會考等級預估 */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">🎯 會考等級預估(依做過的題目估計,題目越多越準)</p>
        <Predictions list={d.predictions ?? []} />
      </div>

      {/* 近 14 天長條 */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">近 14 天作答量</p>
        {d.daily.length === 0 ? (
          <p className="text-sm text-slate-400">這段期間沒有作答紀錄</p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 64 }}>
            {d.daily.map((x) => (
              <div key={x.day} className="flex flex-1 flex-col items-center justify-end" title={`${x.day} ${x.total} 題・對 ${x.correct}`}>
                <div className="w-full rounded-t bg-indigo-400" style={{ height: `${(x.total / max) * 100}%`, minHeight: 2 }} />
                <span className="mt-0.5 text-[9px] text-slate-400">{x.day.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 各科程度 */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">各科程度</p>
        {d.subjects.length === 0 ? (
          <p className="text-sm text-slate-400">尚未開始任何科目</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {d.subjects.map((s) => (
              <span key={s.subject} className="rounded-full bg-white px-3 py-1 text-xs shadow-sm">
                {subjectLabel(s.subject)} <b>Lv{s.level}</b> {LEVEL_NAMES[s.level]}
                <span className="ml-1 text-slate-400">({s.topics} 單元・平均 {s.score} 分)</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 弱點單元 */}
        {d.weakTopics.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">最需要加強的單元</p>
            <div className="space-y-1.5">
              {d.weakTopics.map((t) => (
                <div key={`${t.subject}-${t.topic}`} className="flex items-center gap-2 text-sm">
                  <span className="w-8 shrink-0 text-xs text-slate-500">{subjectLabel(t.subject)}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    <ChapterTag q={chapters.get(`${t.subject}|${t.topic}`) ?? { subject: t.subject, topic: t.topic }} compact />
                  </span>
                  <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-rose-400" style={{ width: `${t.score}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-slate-400">{t.score} 分／{t.attempts_count} 題</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 最近答錯集中的單元 */}
        {wrongUnits.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-500">最近答錯集中在(最新 {d.recent.length} 筆作答)</p>
            <div className="space-y-1.5">
              {wrongUnits.map((u) => (
                <div key={unitKey(u.q)} className="flex items-center gap-2 text-sm">
                  <span className="w-8 shrink-0 text-xs text-slate-500">{subjectLabel(u.q.subject)}</span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1"><ChapterTag q={u.q} compact /></span>
                  <span className="w-16 shrink-0 text-right text-xs font-semibold text-rose-500">錯 {u.wrong}/{u.total}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 最近作答(可篩選) */}
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500">最近作答(最新 {d.recent.length} 筆,可依科目/對錯/關鍵字篩選)</p>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {[{ key: "all", label: "全部" }, ...SUBJECT_GROUPS].map((g) => (
            <button key={g.key} onClick={() => setGroup(g.key)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${group === g.key ? "bg-indigo-600 text-white" : "bg-white text-slate-600 shadow-sm"}`}>
              {g.label}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={onlyWrong} onChange={(e) => setOnlyWrong(e.target.checked)} /> 只看答錯
          </label>
          <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜尋單元、知識點或題目文字"
            className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-0.5 text-xs" />
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">沒有符合的作答紀錄</p>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg bg-white p-2">
            {recent.map((a, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-slate-50 py-1 text-xs last:border-0">
                <span>{a.is_correct ? "✅" : "❌"}</span>
                <span className="w-24 shrink-0 text-slate-400">
                  {new Date(a.created_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="w-8 shrink-0">{a.questions ? subjectLabel(a.questions.subject) : "—"}</span>
                <span className="min-w-0 flex-1">
                  {a.questions && <ChapterTag q={a.questions} compact />}
                  <span className="block truncate text-slate-500">{a.questions ? stripHtml(a.questions.question) : ""}</span>
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 text-slate-500">{MODE_LABEL[a.mode] ?? a.mode}</span>
                <span className="w-10 shrink-0 text-right text-slate-400">
                  {a.time_spent_ms ? `${Math.round(a.time_spent_ms / 1000)}s` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
