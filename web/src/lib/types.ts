export const SUBJECTS = [
  { key: "chinese", label: "國文", color: "#e11d48" },
  { key: "english", label: "英語", color: "#2563eb" },
  { key: "math", label: "數學", color: "#7c3aed" },
  { key: "science", label: "自然", color: "#059669" },
  { key: "social", label: "社會", color: "#d97706" },
] as const;

export type SubjectKey = (typeof SUBJECTS)[number]["key"];

export const subjectLabel = (key: string) =>
  SUBJECTS.find((s) => s.key === key)?.label ?? key;

export interface Question {
  id: string;
  subject: string;
  volume: string | null;
  topic: string;
  subtopic: string | null;
  difficulty: number;
  type: string;
  question: string;
  options: string[] | null;
  answer: number | null;
  answer_text: string | null;
  explanation: string | null;
  source: string | null;
}

export interface Mastery {
  user_id: string;
  subject: string;
  topic: string;
  level: number;
  score: number;
  recent: number[];
  attempts_count: number;
  correct_count: number;
}

// 全真模擬考規格(依近年 111~114 會考,選擇題部分)。
// count=該科選擇題題數;minutes=官方作答時間;aPlusMaxWrong=A++(精熟前段)實務容錯上限。
// 註:數學另有 2 題非選(見非選練習模式)、英語另有 21 題聽力(尚未實作),此處為選擇題全真卷。
export const FULL_EXAM_SPEC: Record<
  string,
  { count: number; minutes: number; aPlusMaxWrong: number; note?: string }
> = {
  chinese: { count: 42, minutes: 70, aPlusMaxWrong: 3 },
  english: { count: 41, minutes: 60, aPlusMaxWrong: 2, note: "另有 21 題聽力(占成績 20%),尚未納入" },
  math: { count: 25, minutes: 80, aPlusMaxWrong: 2, note: "另有 2 題非選,可到自由練習的非選題模式" },
  science: { count: 54, minutes: 70, aPlusMaxWrong: 4 },
  social: { count: 63, minutes: 70, aPlusMaxWrong: 5 },
};

export const LEVEL_NAMES = ["", "入門", "基礎", "進階", "精熟", "挑戰"];

// 各等級出題難度範圍
export const LEVEL_DIFFICULTY: Record<number, [number, number]> = {
  1: [1, 2],
  2: [1, 3],
  3: [2, 3],
  4: [3, 4],
  5: [4, 5],
};
