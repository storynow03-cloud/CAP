"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { pickPracticeQuestions, pickWrittenQuestions } from "@/lib/engine";
import Quiz from "@/components/Quiz";
import WrittenQuiz from "@/components/WrittenQuiz";
import { SUBJECTS, type Question } from "@/lib/types";

interface TopicRow {
  topic: string;
  cnt: number;
  volume: string | null;
  subtopic: string | null;
  source: string | null;
}

/**
 * 取得單元在課本裡的章節序號,用來照「課程進度」排序(而不是中文筆畫)。
 * 各科編號位置不同:自然/數學/社會在 subtopic(如 01-02、3-2),
 * 國文在 source 的課次(如 1_題庫題目/03人間好時節),英語在 topic 的 L1_ 前綴。
 * 回傳數字陣列而非字串,是因為數學「3-2」與英語「L10」都沒有補零,
 * 純文字比較會把 10 排在 3 前面。
 */
function chapterSeq(t: TopicRow): number[] {
  const fromSubtopic = t.subtopic?.match(/\d+/g);
  if (fromSubtopic?.length) return fromSubtopic.map(Number);

  const tail = (t.source ?? "").split("/").pop() ?? "";
  const fromSource = tail.match(/^(\d+(?:-\d+)*)/);
  if (fromSource) return fromSource[1].split("-").map(Number);

  const fromLesson = t.topic.match(/^L(\d+)/i);
  if (fromLesson) return [Number(fromLesson[1])];

  return [Number.MAX_SAFE_INTEGER]; // 沒有編號的排最後
}

/** 依章節序號排序,序號相同或都沒有時退回名稱排序 */
function byChapter(a: TopicRow, b: TopicRow): number {
  const x = chapterSeq(a);
  const y = chapterSeq(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.topic.localeCompare(b.topic, "zh-Hant");
}

/** 康軒六冊對應年級。DB 存的是「第 1 冊」這種格式,取數字來對照。 */
const VOLUME_LABEL = ["", "七上(第1冊)", "七下(第2冊)", "八上(第3冊)", "八下(第4冊)", "九上(第5冊)", "九下(第6冊)"];
const OTHER_LABEL = "會考真題 / 其他";

/** 把單元依冊次分組,讓孩子能直接對上學校進度,而不是在上百個單元裡用筆畫找。 */
function groupByVolume(rows: TopicRow[]): { label: string; topics: TopicRow[] }[] {
  const groups = new Map<string, TopicRow[]>();
  for (const r of rows) {
    const n = Number(String(r.volume ?? "").match(/\d+/)?.[0] ?? 0);
    const label = VOLUME_LABEL[n] || OTHER_LABEL;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  // 依年級順序排,「會考真題 / 其他」固定放最後;各冊內部依課本章節順序
  return [...VOLUME_LABEL.slice(1), OTHER_LABEL]
    .filter((label) => groups.has(label))
    .map((label) => ({ label, topics: groups.get(label)!.sort(byChapter) }));
}

export default function PracticePage() {
  const [subject, setSubject] = useState("math");
  const [format, setFormat] = useState<"choice" | "written">("choice");
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(0);
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [state, setState] = useState<"setup" | "loading" | "quiz">("setup");
  const [error, setError] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // 載入該科的單元清單(換科目時清掉已選單元,避免選到別科的單元)
  useEffect(() => {
    setSelectedTopics([]);
    setOpenGroups([]);
    const supabase = createClient();
    supabase.rpc("get_topics", { subj: subject }).then(({ data }) => {
      setTopics((data ?? []) as TopicRow[]);
    });
  }, [subject]);

  async function start() {
    setState("loading");
    setError("");
    try {
      const opts = {
        subject,
        topics: selectedTopics,
        difficulty: difficulty || undefined,
        count,
      };
      const qs =
        format === "written"
          ? await pickWrittenQuestions(createClient(), opts)
          : await pickPracticeQuestions(createClient(), opts);
      if (!qs.length) {
        setError(
          format === "written"
            ? "這個條件下沒有非選題(目前非選題最多的是數學)。換科目或放寬條件試試。"
            : "找不到符合條件的題目,換個條件試試。"
        );
        setState("setup");
        return;
      }
      setQuestions(qs);
      setState("quiz");
    } catch (e) {
      setError(`載入失敗:${e instanceof Error ? e.message : e}`);
      setState("setup");
    }
  }

  if (state === "quiz" && userId) {
    return format === "written" ? (
      <WrittenQuiz
        questions={questions}
        userId={userId}
        onFinish={() => setState("setup")}
      />
    ) : (
      <Quiz
        questions={questions}
        userId={userId}
        mode="practice"
        onFinish={() => setState("setup")}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">📝 自由練習</h1>

      <div className="rounded-2xl bg-white p-6 shadow">
        <label className="mb-2 block text-sm font-semibold">科目</label>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSubject(s.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                subject === s.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <label className="mb-2 mt-5 block text-sm font-semibold">題型</label>
        <div className="flex gap-2">
          <button
            onClick={() => setFormat("choice")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              format === "choice" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            選擇題
          </button>
          <button
            onClick={() => setFormat("written")}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              format === "written" ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            ✍️ 非選題(紙上作答)
          </button>
        </div>
        {format === "written" && (
          <p className="mt-2 text-xs text-slate-500">
            在紙上寫完整過程 → 翻詳解對照 → 自評對錯。非選題以數學最多(約 5,000 題)。
          </p>
        )}

        <div className="mb-2 mt-5 flex items-center justify-between">
          <label className="text-sm font-semibold">
            單元(可複選,不選 = 全部)
          </label>
          {selectedTopics.length > 0 && (
            <button
              onClick={() => setSelectedTopics([])}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              已選 {selectedTopics.length} 個・清除
            </button>
          )}
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
          {groupByVolume(topics).map((g) => {
            const names = g.topics.map((t) => t.topic);
            const chosen = names.filter((n) => selectedTopics.includes(n)).length;
            const open = openGroups.includes(g.label);
            return (
              <div key={g.label}>
                <div className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5">
                  <button
                    onClick={() =>
                      setOpenGroups((prev) =>
                        open ? prev.filter((x) => x !== g.label) : [...prev, g.label]
                      )
                    }
                    className="flex flex-1 items-center gap-1.5 text-left text-sm font-semibold text-slate-700"
                  >
                    <span className="text-xs text-slate-400">{open ? "▾" : "▸"}</span>
                    {g.label}
                    <span className="text-xs font-normal text-slate-400">
                      {g.topics.length} 單元{chosen > 0 && `・已選 ${chosen}`}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setSelectedTopics((prev) =>
                        chosen === names.length
                          ? prev.filter((x) => !names.includes(x))
                          : [...new Set([...prev, ...names])]
                      )
                    }
                    className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-indigo-600 ring-1 ring-slate-200"
                  >
                    {chosen === names.length ? "取消整冊" : "選整冊"}
                  </button>
                </div>
                {open && (
                  <div className="mt-1 mb-2 space-y-0.5 pl-5">
                    {g.topics.map((t) => (
                      <label
                        key={t.topic}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-indigo-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-indigo-600"
                          checked={selectedTopics.includes(t.topic)}
                          onChange={(e) =>
                            setSelectedTopics((prev) =>
                              e.target.checked
                                ? [...prev, t.topic]
                                : prev.filter((x) => x !== t.topic)
                            )
                          }
                        />
                        <span className="flex-1">{t.topic}</span>
                        <span className="shrink-0 text-xs text-slate-400">{t.cnt} 題</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!topics.length && (
            <p className="py-3 text-center text-sm text-slate-400">載入單元中…</p>
          )}
        </div>

        <label className="mb-2 mt-5 block text-sm font-semibold">難度</label>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                difficulty === d ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {d === 0 ? "全部" : "★".repeat(d)}
            </button>
          ))}
        </div>

        <label className="mb-2 mt-5 block text-sm font-semibold">題數</label>
        <div className="flex gap-2">
          {[5, 10, 20, 30].map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`rounded-full px-4 py-1.5 text-sm ${
                count === c ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {c} 題
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

        <button
          onClick={start}
          disabled={state === "loading" || !userId}
          className="mt-6 w-full rounded-full bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {state === "loading" ? "出題中…" : "開始練習"}
        </button>
      </div>
    </div>
  );
}
