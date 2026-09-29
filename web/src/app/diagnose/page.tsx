"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Quiz from "@/components/Quiz";
import { SUBJECTS, subjectLabel, type Question } from "@/lib/types";
import { RULES } from "@/lib/remediation";

interface Target {
  id: number; user_id: string; subject: string; topic: string; reason: string | null;
  status: "practicing" | "recheck" | "graduated";
  streak: number; hard_in_streak: number; recheck_correct: number;
  recheck_due_at: string | null; total_attempts: number; total_correct: number;
  requiredHard: number; updated_at: string;
}
interface Item {
  number: string; question: string; student_answer: string; correct_answer: string;
  is_wrong: boolean; topic: string; matched_topic: string | null;
  error_type: string; explanation: string; confidence: number;
}
interface Diagnosis {
  id: number; subject: string; scope: string; title: string | null; created_at: string;
  result: { items?: Item[]; summary?: string };
}
interface Student { id: string; nickname: string; role: string }

const ERROR_LABEL: Record<string, string> = {
  concept: "觀念錯誤", calculation: "計算錯誤", reading: "審題錯誤", careless: "粗心", unknown: "無法判斷",
};
const MAX_PHOTOS = 4;

/** 在瀏覽器先把照片縮小壓縮:手機原圖動輒 3~5MB,直接傳會超過伺服器的請求大小上限 */
async function compress(file: File): Promise<{ mimeType: string; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("無法讀取照片"));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.82);
    return { mimeType: "image/jpeg", data: dataUrl.split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isDue(t: Target) {
  return t.status === "recheck" && !!t.recheck_due_at && new Date(t.recheck_due_at) <= new Date();
}
function progress(t: Target) {
  if (t.status === "graduated") return "🎓 已畢業";
  if (t.status === "recheck") {
    if (!isDue(t)) {
      const d = Math.max(1, Math.ceil((new Date(t.recheck_due_at!).getTime() - Date.now()) / 86400_000));
      return `✅ 已過關・${d} 天後複測`;
    }
    return `🔔 複測 ${t.recheck_correct}/${RULES.RECHECK_COUNT}`;
  }
  return `連續答對 ${t.streak}/${RULES.PASS_STREAK}` +
    (t.requiredHard > 0 ? `・難題 ${Math.min(t.hard_in_streak, t.requiredHard)}/${t.requiredHard}` : "");
}

export default function DiagnosePage() {
  const [me, setMe] = useState<{ id: string; isStaff: boolean } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [viewUserId, setViewUserId] = useState<string>("");
  const [data, setData] = useState<{ diagnoses: Diagnosis[]; targets: Target[]; aiReady: boolean } | null>(null);

  // 上傳表單
  const [subject, setSubject] = useState("math");
  const [scope, setScope] = useState<"full" | "wrong_only">("wrong_only");
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  // 補強練習
  const [practice, setPractice] = useState<{ target: Target; questions: Question[] } | null>(null);
  const [banner, setBanner] = useState("");
  const [openDiag, setOpenDiag] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
      const isStaff = !!p && ["teacher", "parent"].includes(p.role);
      setMe({ id: u.user.id, isStaff });
      const qs = new URLSearchParams(window.location.search).get("userId");
      if (isStaff) {
        const r = await fetch("/api/admin/progress");
        const d = await r.json();
        const list: Student[] = (d.students ?? []).filter((s: Student) => s.role === "student");
        setStudents(list);
        setViewUserId(qs || list[0]?.id || u.user.id);
      } else {
        setViewUserId(u.user.id);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!viewUserId) return;
    const r = await fetch(`/api/diagnose?userId=${viewUserId}`);
    if (r.ok) setData(await r.json());
  }, [viewUserId]);
  useEffect(() => { load(); }, [load]);

  const isOwner = !!me && me.id === viewUserId;

  async function upload() {
    if (!files.length) { setMsg("請先選照片"); return; }
    setUploading(true);
    setMsg("");
    try {
      const images = await Promise.all(files.map(compress));
      const total = images.reduce((a, i) => a + i.data.length, 0);
      if (total > 3_800_000) throw new Error("照片太大了,請少選幾張或拍近一點");
      const r = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, scope, title, images, targetUserId: viewUserId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "上傳失敗");
      setMsg(
        `✅ 分析完成:找到 ${d.wrongCount} 題錯題,建立 ${d.targets} 個補強單元` +
          (d.unmatched ? `(有 ${d.unmatched} 題對不上題庫單元,只列在報告中)` : "")
      );
      setFiles([]);
      setTitle("");
      await load();
      setOpenDiag(d.diagnosis?.id ?? null);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : e}`);
    } finally {
      setUploading(false);
    }
  }

  async function startPractice(t: Target) {
    setBanner("");
    const r = await fetch(`/api/remediation?targetId=${t.id}`);
    const d = await r.json();
    if (!r.ok) { setBanner(`❌ ${d.error}`); return; }
    if (!d.questions?.length) { setBanner("這個單元目前沒有可出的題目"); return; }
    setPractice({ target: t, questions: d.questions });
  }

  function onAnswer(q: Question, selected: number) {
    if (!practice) return;
    fetch("/api/remediation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: practice.target.id, questionId: q.id, selected }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.justGraduated) setBanner("🎓 複測全對,這個單元畢業了!太厲害了!");
        else if (d.justPassed) setBanner(`🎉 過關了!${RULES.RECHECK_AFTER_DAYS} 天後會再考你 ${RULES.RECHECK_COUNT} 題確認真的學會`);
        else if (d.backToPractice) setBanner("💪 複測錯了一題,回到練習,再加油!");
        if (d.state) {
          setPractice((p) => p && { ...p, target: { ...p.target, ...d.state, requiredHard: d.requiredHard ?? p.target.requiredHard } });
        }
      })
      .catch(() => {});
  }

  if (!me) return <p className="py-12 text-center text-slate-400">載入中…</p>;

  // ── 補強練習畫面 ──
  if (practice && isOwner) {
    const t = practice.target;
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-800">
          🎯 補強:{subjectLabel(t.subject)}|{t.topic}
          <span className="ml-2 font-semibold">{progress(t)}</span>
        </div>
        {banner && <div className="rounded-xl bg-indigo-600 p-3 text-center font-semibold text-white">{banner}</div>}
        <Quiz
          questions={practice.questions}
          userId={me.id}
          mode="practice"
          disableHints
          onAnswer={onAnswer}
          onFinish={() => { setPractice(null); load(); }}
        />
      </div>
    );
  }

  const targets = data?.targets ?? [];
  const active = targets.filter((t) => t.status !== "graduated");
  const graduated = targets.filter((t) => t.status === "graduated");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">🎯 考卷診斷</h1>
      <p className="text-sm text-slate-500">
        上傳學校的考卷照片,AI 找出錯在哪個單元、為什麼錯,再針對那些單元練到真的會(會考真題優先)。
      </p>

      {me.isStaff && students.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">查看/上傳給:</span>
          {students.map((s) => (
            <button key={s.id} onClick={() => setViewUserId(s.id)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${viewUserId === s.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {s.nickname}
            </button>
          ))}
        </div>
      )}

      {/* 上傳 */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="font-bold">📷 上傳考卷</p>
        {data && !data.aiReady && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">系統尚未設定 AI 金鑰,暫時無法分析。</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button key={s.key} onClick={() => setSubject(s.key)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${subject === s.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {([["wrong_only", "只拍錯題"], ["full", "整張考卷"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${scope === k ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {label}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60}
          placeholder="考卷名稱(可不填,例:九上第一次段考)"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 hover:bg-slate-50">
          {files.length ? `已選 ${files.length} 張照片(點此重選)` : `點此拍照或選照片(最多 ${MAX_PHOTOS} 張)`}
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS))} />
        </label>
        {files.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {files.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={URL.createObjectURL(f)} alt="" className="h-20 w-auto rounded-lg border" />
            ))}
          </div>
        )}
        <button onClick={upload} disabled={uploading || !files.length || (data !== null && !data.aiReady)}
          className="mt-4 w-full rounded-full bg-emerald-600 py-3 font-semibold text-white disabled:opacity-40">
          {uploading ? "AI 分析中…(約 20~40 秒,請勿關閉)" : "開始分析"}
        </button>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
        <p className="mt-2 text-xs text-slate-400">照片只用來分析、不會保存。拍照時請盡量拍正、拍清楚,可先把姓名遮住。</p>
      </div>

      {/* 補強任務 */}
      <div className="space-y-2">
        <p className="font-bold">📌 補強任務 {active.length > 0 && <span className="text-sm font-normal text-slate-500">({active.length} 個單元)</span>}</p>
        {banner && !practice && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{banner}</p>}
        {active.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-400 shadow-sm">目前沒有待補強的單元</p>}
        {active.map((t) => {
          const canGo = t.status === "practicing" || isDue(t);
          return (
            <div key={t.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">{subjectLabel(t.subject)}</span>
                <span className="font-semibold">{t.topic}</span>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{progress(t)}</span>
              </div>
              {t.status === "practicing" && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(Math.min(t.streak, RULES.PASS_STREAK) / RULES.PASS_STREAK) * 100}%` }} />
                </div>
              )}
              {t.reason && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">💡 {t.reason.split("\n")[0]}</p>}
              {isOwner && canGo && (
                <button onClick={() => startPractice(t)}
                  className="mt-3 rounded-full bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white">
                  {t.status === "recheck" ? "開始複測" : "開始補強"}
                </button>
              )}
            </div>
          );
        })}
        {graduated.length > 0 && (
          <p className="text-xs text-slate-400">🎓 已畢業:{graduated.map((t) => t.topic).join("、")}</p>
        )}
        <p className="text-xs text-slate-400">
          過關標準:連續答對 {RULES.PASS_STREAK} 題(其中 {RULES.PASS_HARD} 題難度 ★★★ 以上),
          {RULES.RECHECK_AFTER_DAYS} 天後複測 {RULES.RECHECK_COUNT} 題全對才畢業。
        </p>
      </div>

      {/* 診斷紀錄 */}
      <div className="space-y-2">
        <p className="font-bold">📋 診斷紀錄</p>
        {(data?.diagnoses ?? []).length === 0 && <p className="text-sm text-slate-400">還沒有上傳過考卷</p>}
        {(data?.diagnoses ?? []).map((d) => {
          const items = d.result.items ?? [];
          const wrong = items.filter((i) => i.is_wrong);
          return (
            <div key={d.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <button onClick={() => setOpenDiag(openDiag === d.id ? null : d.id)} className="w-full p-4 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.title || `${subjectLabel(d.subject)}考卷`}</span>
                  <span className="text-xs text-slate-400">{new Date(d.created_at).toLocaleDateString("zh-TW")}</span>
                  <span className="ml-auto text-xs text-rose-600">錯 {wrong.length} 題</span>
                </div>
              </button>
              {openDiag === d.id && (
                <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4">
                  {d.result.summary && <p className="rounded-lg bg-white p-3 text-sm">📝 {d.result.summary}</p>}
                  {wrong.map((i, k) => (
                    <div key={k} className="rounded-lg bg-white p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">第 {i.number} 題</span>
                        <span className="rounded bg-rose-100 px-1.5 text-xs text-rose-700">{ERROR_LABEL[i.error_type] ?? i.error_type}</span>
                        <span className="rounded bg-indigo-50 px-1.5 text-xs text-indigo-700">
                          {i.matched_topic ?? `${i.topic || "?"}(對不上題庫單元)`}
                        </span>
                        {i.confidence < 0.6 && <span className="text-xs text-amber-600">⚠️ AI 不太確定</span>}
                      </div>
                      <p className="mt-1 text-slate-600">{i.question}</p>
                      <p className="mt-1 text-xs text-slate-500">作答:{i.student_answer || "—"}・正解:{i.correct_answer || "—"}</p>
                      <p className="mt-1">💡 {i.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
