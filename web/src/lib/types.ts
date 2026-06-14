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

export const LEVEL_NAMES = ["", "入門", "基礎", "進階", "精熟", "挑戰"];

// 各等級出題難度範圍
export const LEVEL_DIFFICULTY: Record<number, [number, number]> = {
  1: [1, 2],
  2: [1, 3],
  3: [2, 3],
  4: [3, 4],
  5: [4, 5],
};
