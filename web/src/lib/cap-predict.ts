// 依孩子做過的題目,預估目前會考各科的等級(家長看學習狀況用)。
//
// 估法(盡量貼近「真的上考場會錯幾題」):
//   1. 每題只算「第一次作答」——錯題複習會重複做同一題,算進去會讓正確率虛高。
//   2. 依難度分三段(易 1-2★、中 3★、難 4-5★)各算正確率,用貝氏平滑往整體正確率拉,
//      避免某段只做 2 題就 100%/0%。
//   3. 依會考題目難度分布(易 30%、中 45%、難 25%)加權成「預估答對率」。
//   4. 乘上該科會考選擇題題數 → 預估錯幾題 → 等級。A++ 用 FULL_EXAM_SPEC 的容錯數
//      (與全真模考一致),其餘依答對率(與模擬考 gradeOf 一致)。
//   5. 可信度看題數;同時列出還沒練到的冊別(只練七上的孩子,估出來的等級只代表七上範圍)。
//   6. 每科至少 MIN_QUESTIONS 題才給等級(太少題數估出 A+ 沒有意義),不足的科目不算進積分。
//
// 兩種積分(2026-10-04 使用者要求):
//   練習會考積分 —— 平常練習的題目(不含會考真題),代表「練過的範圍」程度
//   真題會考積分 —— 只算歷屆會考真題(來源分類含「國中教育會考」),範圍 = 整個會考,最接近真實成績

import { FULL_EXAM_SPEC } from "@/lib/types";

export interface PredictAttempt {
  question_id: string;
  is_correct: boolean;
  created_at: string;
  questions: { subject: string; difficulty: number | null; volume?: string | null; type?: string | null; source?: string | null } | null;
}

export const MIN_QUESTIONS = 20;
// 歷屆會考真題:來源分類含「國中教育會考」(英文「會考特色題」是類題,不算)
export const isRealExam = (source?: string | null) => (source ?? "").split("/")[0].includes("國中教育會考");
// 會考等級 → 積分(常見換算 A++=7…C=1,五科滿分 35;實際依各區免試入學簡章)
export const GRADE_POINT: Record<string, number> = { "A++": 7, "A+": 6, A: 5, "B++": 4, "B+": 3, B: 2, C: 1 };

export interface SubjectPrediction {
  subject: string;
  /** 題數未達 MIN_QUESTIONS 時為 null(不給等級、不算積分) */
  grade: string | null;
  /** 預估在真實會考答對率(0~1) */
  rate: number;
  /** 預估錯幾題 / 全卷題數 */
  wrong: number;
  examCount: number;
  /** 依據:不重複題數與各難度表現 */
  questions: number;
  buckets: { label: string; n: number; correct: number }[];
  confidence: "資料不足" | "低" | "中" | "高";
  /** 已練過的冊別(1~6) */
  volumes: number[];
}

const MIX = [
  { label: "易", test: (d: number) => d <= 2, weight: 0.3 },
  { label: "中", test: (d: number) => d === 3, weight: 0.45 },
  { label: "難", test: (d: number) => d >= 4, weight: 0.25 },
];

export function gradeFromRate(rate: number, wrong: number, aPlusMaxWrong: number): string {
  if (wrong <= aPlusMaxWrong) return "A++";
  if (rate >= 0.85) return "A+";
  if (rate >= 0.75) return "A";
  if (rate >= 0.6) return "B++";
  if (rate >= 0.45) return "B+";
  if (rate >= 0.3) return "B";
  return "C";
}

export function predictCap(attempts: PredictAttempt[], scope: "all" | "practice" | "real" = "all"): SubjectPrediction[] {
  // 每題第一次作答
  const first = new Map<string, PredictAttempt>();
  for (const a of [...attempts].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    if (!a.questions || (a.questions.type && a.questions.type !== "single_choice")) continue;
    if (scope === "real" && !isRealExam(a.questions.source)) continue;
    if (scope === "practice" && isRealExam(a.questions.source)) continue;
    if (!first.has(a.question_id)) first.set(a.question_id, a);
  }
  const bySubject = new Map<string, PredictAttempt[]>();
  for (const a of first.values()) {
    const s = a.questions!.subject;
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s)!.push(a);
  }

  const out: SubjectPrediction[] = [];
  for (const [subject, list] of bySubject) {
    const spec = FULL_EXAM_SPEC[subject];
    if (!spec) continue;
    const n = list.length;
    const overall = (list.filter((a) => a.is_correct).length + 1) / (n + 2);
    const K = 5; // 平滑強度:每段等於多看 5 題「整體水準」
    const buckets = MIX.map((m) => {
      const rows = list.filter((a) => m.test(a.questions!.difficulty ?? 3));
      const correct = rows.filter((a) => a.is_correct).length;
      return { label: m.label, n: rows.length, correct, smoothed: (correct + K * overall) / (rows.length + K), weight: m.weight };
    });
    const rate = buckets.reduce((s, b) => s + b.smoothed * b.weight, 0);
    const wrong = Math.round((1 - rate) * spec.count);
    const volumes = [...new Set(list.map((a) => Number(a.questions!.volume?.match(/\d+/)?.[0])).filter((v) => v >= 1 && v <= 6))].sort();
    out.push({
      subject,
      grade: n >= MIN_QUESTIONS ? gradeFromRate(rate, wrong, spec.aPlusMaxWrong) : null,
      rate,
      wrong,
      examCount: spec.count,
      questions: n,
      buckets: buckets.map(({ label, n, correct }) => ({ label, n, correct })),
      confidence: n < 20 ? "資料不足" : n < 60 ? "低" : n < 150 ? "中" : "高",
      volumes,
    });
  }
  const order = ["chinese", "english", "math", "science", "social"];
  return out.sort((a, b) => order.indexOf(a.subject) - order.indexOf(b.subject));
}

/** 積分加總:只算有等級的科目 */
export function capScore(list: SubjectPrediction[]) {
  const graded = list.filter((p) => p.grade);
  return { points: graded.reduce((s, p) => s + (GRADE_POINT[p.grade!] ?? 0), 0), graded: graded.length };
}
