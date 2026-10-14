"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

interface Sib {
  id: string;
  question: string;
  options: string[] | null;
  answer: number | null;
  answer_text: string | null;
}

/** 題組小題題幹只留「（第 k 小題）」之後(前面是整組共同題幹,畫面上已經有了) */
function subPart(html: string) {
  const i = html.indexOf("（第 ");
  return i >= 0 ? html.slice(i) : html;
}

/**
 * 「承上題」小題被單獨抽出來時,孩子看不到前面小題(2026-10-14 回報:science-0811652-g2「哪來的abcd」)。
 * 題號 -gN(N>1)且題幹有「承上」→ 附上同題組前面各小題的題目與答案(預設展開,可收合)。
 */
export default function PrevSubQuestions({ id, question }: { id: string; question: string }) {
  const m = id.match(/^(.*)-g(\d+)$/);
  const k = m ? Number(m[2]) : 0;
  const need = k > 1 && /承上/.test(question);
  // 記住是哪一題抓的,換題時舊資料自然不顯示(不在 effect 裡同步 setState)
  const [got, setGot] = useState<{ for: string; sibs: Sib[] }>({ for: "", sibs: [] });

  useEffect(() => {
    if (!need || !m) return;
    const ids = Array.from({ length: k - 1 }, (_, i) => `${m[1]}-g${i + 1}`);
    createClient()
      .from("questions")
      .select("id,question,options,answer,answer_text")
      .in("id", ids)
      .then(({ data }) => setGot({ for: id, sibs: ((data ?? []) as Sib[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sibs = got.for === id ? got.sibs : [];
  if (!need || !sibs.length) return null;
  return (
    <details className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm" open>
      <summary className="cursor-pointer font-semibold text-sky-700">📎 這題「承上題」,先看前面的小題</summary>
      <div className="mt-2 space-y-3">
        {sibs.map((s) => (
          <div key={s.id} className="rounded-lg bg-white p-3">
            <div className="qhtml whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: subPart(s.question) }} />
            {s.options?.length ? (
              <ul className="mt-1 space-y-0.5">
                {s.options.map((o, i) => (
                  <li key={i} className={i === s.answer ? "font-semibold text-emerald-700" : "text-slate-600"}>
                    ({LETTERS[i]}) <span className="qhtml" dangerouslySetInnerHTML={{ __html: o }} />
                    {i === s.answer && " ✔"}
                  </li>
                ))}
              </ul>
            ) : s.answer_text ? (
              <div className="mt-1 text-emerald-700">
                答:<span className="qhtml" dangerouslySetInnerHTML={{ __html: s.answer_text }} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}
