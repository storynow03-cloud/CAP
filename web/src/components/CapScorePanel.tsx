import { capScore, MIN_QUESTIONS, type SubjectPrediction } from "@/lib/cap-predict";
import { subjectLabel } from "@/lib/types";

/**
 * 兩種會考積分(診斷頁、管理後台共用):
 *   📘 練習會考積分:平常練習換算,代表「練過的範圍」程度(國一、國二也能有分數)
 *   🎯 真題會考積分:只算歷屆會考真題,範圍 = 整個會考,最接近真實成績
 * 每科至少 MIN_QUESTIONS 題才給等級,不足的科目顯示「還差幾題」、不算進積分。
 */

const SUBJECTS = ["chinese", "english", "math", "science", "social"];
const GRADE_NAME = ["", "七上", "七下", "八上", "八下", "九上", "九下"];
const GRADE_COLOR: Record<string, string> = {
  "A++": "bg-emerald-600", "A+": "bg-emerald-500", A: "bg-emerald-400",
  "B++": "bg-amber-500", "B+": "bg-amber-400", B: "bg-amber-300", C: "bg-rose-500",
};

function Cell({ p }: { p?: SubjectPrediction }) {
  if (!p) return <span className="text-[11px] text-slate-300">沒做過</span>;
  if (!p.grade) return <span className="text-[11px] text-slate-400">還差 {MIN_QUESTIONS - p.questions} 題</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded px-1.5 py-0.5 text-sm font-black text-white ${GRADE_COLOR[p.grade] ?? "bg-slate-400"}`}>{p.grade}</span>
      <span className="text-[10px] text-slate-400">{p.questions} 題</span>
    </span>
  );
}

export default function CapScorePanel({ practice, real, detailed = false }: { practice: SubjectPrediction[]; real: SubjectPrediction[]; detailed?: boolean }) {
  const ps = capScore(practice), rs = capScore(real);
  const volumes = [...new Set(practice.flatMap((p) => p.volumes))].sort();
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-4 text-white shadow">
          <p className="text-sm opacity-90">📘 練習會考積分</p>
          <p className="text-4xl font-black">{ps.points}<span className="text-base font-normal opacity-80"> / 35</span></p>
          <p className="mt-1 text-[11px] opacity-85">
            平常練習換算,已評 {ps.graded} 科。{volumes.length > 0 ? `練過的範圍:${volumes.map((n) => GRADE_NAME[n]).join("、")}。` : ""}
            代表「學過的部分」掌握得如何。
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 text-white shadow">
          <p className="text-sm opacity-90">🎯 真題會考積分</p>
          <p className="text-4xl font-black">{rs.points}<span className="text-base font-normal opacity-80"> / 35</span></p>
          <p className="mt-1 text-[11px] opacity-85">
            只算歷屆會考真題,已評 {rs.graded} 科。範圍是整個會考,最接近真正考會考的成績;多寫真題才會有分數。
          </p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">科目</th>
              <th className="px-3 py-2">📘 練習</th>
              <th className="px-3 py-2">🎯 真題</th>
              {detailed && <th className="px-3 py-2">練習依據</th>}
            </tr>
          </thead>
          <tbody>
            {SUBJECTS.map((k) => {
              const p = practice.find((x) => x.subject === k), r = real.find((x) => x.subject === k);
              return (
                <tr key={k} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold">{subjectLabel(k)}</td>
                  <td className="px-3 py-2"><Cell p={p} /></td>
                  <td className="px-3 py-2"><Cell p={r} /></td>
                  {detailed && (
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {p ? `預估答對 ${Math.round(p.rate * 100)}%・${p.buckets.map((b) => `${b.label}${b.n}題${b.n ? `對${Math.round((b.correct / b.n) * 100)}%` : ""}`).join(" ")}` : ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        換算 A++=7、A+=6、A=5、B++=4、B+=3、B=2、C=1(常見規則,實際依各區免試入學簡章)。每科至少 {MIN_QUESTIONS} 題才給等級;只算每題第一次作答,依難度加權。
      </p>
    </div>
  );
}
