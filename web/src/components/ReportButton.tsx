"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const REASONS = [
  { key: "missing_image", label: "缺圖/圖看不到" },
  { key: "wrong_answer", label: "答案好像錯了" },
  { key: "unreadable", label: "題目看不懂/有亂碼" },
  { key: "bad_options", label: "選項有問題" },
  { key: "other", label: "其他" },
] as const;

/**
 * 做題時的「這題有問題」回報。
 * 孩子是最好的題目品質檢查員(缺圖、答案錯這類問題自動掃描抓不全),
 * 回報進管理後台由家長處理(隱藏 / 已修正 / 沒問題)。
 */
export default function ReportButton({ questionId, userId }: { questionId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function submit() {
    if (!reason) return;
    setState("saving");
    const { error } = await createClient().from("question_reports").insert({
      question_id: questionId,
      user_id: userId,
      reason,
      note: note.trim() || null,
    });
    setState(error ? "error" : "done");
  }

  if (state === "done")
    return <p className="mt-3 text-xs text-emerald-600">✅ 已回報,謝謝你幫忙把題目變得更好!</p>;

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-3 text-xs text-slate-400 hover:text-rose-500">
        🚩 這題有問題?
      </button>
    );

  return (
    <div className="mt-3 rounded-xl bg-rose-50 p-3">
      <p className="text-xs font-semibold text-rose-700">這題哪裡有問題?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r.key}
            onClick={() => setReason(r.key)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              reason === r.key ? "bg-rose-600 text-white" : "bg-white text-rose-700 ring-1 ring-rose-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="想補充的話(可不填)"
        maxLength={200}
        className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!reason || state === "saving"}
          className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {state === "saving" ? "送出中…" : "送出回報"}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500">取消</button>
        {state === "error" && <span className="text-xs text-rose-600">送出失敗,請稍後再試</span>}
      </div>
    </div>
  );
}
