"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SUBJECTS } from "@/lib/types";

export default function NewContestPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("math");
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [dMin, setDMin] = useState(1);
  const [dMax, setDMax] = useState(5);
  const [count, setCount] = useState(10);
  const [days, setDays] = useState(7);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // 該科單元清單
  useEffect(() => {
    setSelectedTopics([]);
    createClient()
      .rpc("get_topics", { subj: subject })
      .then(({ data }) => setTopics((data ?? []).map((r: { topic: string }) => r.topic)));
  }, [subject]);

  // 預覽符合條件的題數
  useEffect(() => {
    let q = createClient()
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("subject", subject)
      .eq("needs_review", false)
      .eq("type", "single_choice")
      .gte("difficulty", dMin)
      .lte("difficulty", dMax);
    if (selectedTopics.length) q = q.in("topic", selectedTopics);
    q.then(({ count: c }) => setPoolCount(c ?? 0));
  }, [subject, selectedTopics, dMin, dMax]);

  async function create() {
    setSaving(true);
    setMsg("");
    try {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("未登入");

      // 抽出固定題目(全員同卷)
      let q = supabase
        .from("questions")
        .select("id")
        .eq("subject", subject)
        .eq("needs_review", false)
        .eq("type", "single_choice")
        .gte("difficulty", dMin)
        .lte("difficulty", dMax)
        .limit(1000);
      if (selectedTopics.length) q = q.in("topic", selectedTopics);
      const { data: pool, error: poolErr } = await q;
      if (poolErr) throw poolErr;
      if (!pool || pool.length < count) throw new Error(`符合條件的題目只有 ${pool?.length ?? 0} 題,不足 ${count} 題`);
      const ids = pool
        .map((r) => r.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, count);

      const { error } = await supabase.from("contests").insert({
        title: title || `${new Date().toLocaleDateString("zh-TW")} 大會考`,
        description: description || null,
        created_by: u.user.id,
        subject,
        question_ids: ids,
        duration_minutes: 30,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + days * 86400 * 1000).toISOString(),
      });
      if (error) throw error;
      router.push("/contest");
    } catch (e) {
      setMsg(`建立失敗:${e instanceof Error ? e.message : e}`);
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📋 建立大會考</h1>
      <div className="space-y-5 rounded-2xl bg-white p-6 shadow">
        <div>
          <label className="mb-1 block text-sm font-semibold">標題</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="例:第一次段考複習賽"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">說明(選填)</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="例:範圍是第三冊 1~3 章"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">科目</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSubject(s.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  subject === s.key ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">
            範圍單元(不選 = 全部;已選 {selectedTopics.length} 個)
          </label>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {topics.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTopics.includes(t)}
                  onChange={(e) =>
                    setSelectedTopics((prev) =>
                      e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                    )
                  }
                />
                {t}
              </label>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <div>
            <label className="mb-1 block text-sm font-semibold">難度範圍</label>
            <div className="flex items-center gap-2 text-sm">
              <select value={dMin} onChange={(e) => setDMin(+e.target.value)} className="rounded border border-slate-300 px-2 py-1">
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>★{d}</option>)}
              </select>
              ~
              <select value={dMax} onChange={(e) => setDMax(+e.target.value)} className="rounded border border-slate-300 px-2 py-1">
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>★{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">題數</label>
            <select value={count} onChange={(e) => setCount(+e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
              {[5, 10, 15, 20, 25, 30].map((c) => <option key={c} value={c}>{c} 題</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">開放天數</label>
            <select value={days} onChange={(e) => setDays(+e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
              {[1, 3, 7, 14].map((d) => <option key={d} value={d}>{d} 天</option>)}
            </select>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          符合條件的題庫:{poolCount === null ? "計算中…" : `${poolCount} 題`}
          (建立時隨機抽 {count} 題固定下來,所有人考同一卷)
        </p>
        {msg && <p className="text-sm text-rose-600">{msg}</p>}
        <button
          onClick={create}
          disabled={saving || (poolCount !== null && poolCount < count)}
          className="w-full rounded-full bg-rose-600 py-3 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {saving ? "建立中…" : "建立大會考"}
        </button>
      </div>
    </div>
  );
}
