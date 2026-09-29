/**
 * 補強練習的「過關標準」與狀態轉移。純函式,前後端共用、可單獨測試。
 *
 * 一個「補強目標」= 某孩子在某科某單元答錯了,要練到真的會。
 *
 * 狀態:practicing(練習中)→ recheck(已過關,等複測)→ graduated(畢業)
 *
 * 為什麼這樣定:
 *   - 連續答對而不是累計:累計會被「猜對」灌水,連續才代表穩定會。
 *   - 連對中要有難題:只刷簡單題就過關,等於沒練到會考的鑑別度。
 *     但若該單元題庫本身難題不足,門檻就降到題庫能提供的數量,避免永遠過不了。
 *   - 不同的題目才算:同一題重做答對是記憶答案,不是理解(由出題端保證不重複)。
 *   - 過關後隔幾天再複測:防止「剛練完當下會、過兩天就忘」的短期記憶。
 *     這跟錯題本的間隔複習是同一個道理。複測錯任何一題就退回練習中。
 */

export const RULES = {
  PASS_STREAK: 5, // 連續答對題數
  PASS_HARD: 2, // 這串連對中至少要有幾題難題
  HARD_DIFFICULTY: 3, // 難度 ★★★ 以上算難題
  RECHECK_AFTER_DAYS: 2, // 過關後幾天複測
  RECHECK_COUNT: 3, // 複測題數(全對才畢業)
  BATCH: 8, // 練習中一次出幾題
} as const;

export type TargetStatus = "practicing" | "recheck" | "graduated";

export interface TargetState {
  status: TargetStatus;
  streak: number;
  hard_in_streak: number;
  seen_ids: string[];
  total_attempts: number;
  total_correct: number;
  passed_at: string | null;
  recheck_due_at: string | null;
  recheck_correct: number;
  graduated_at: string | null;
}

export interface AnswerInput {
  questionId: string;
  correct: boolean;
  difficulty: number;
  /** 這個單元題庫裡難題的總數,用來決定難題門檻是否要放寬 */
  hardAvailable: number;
  now?: Date;
}

/** 難題門檻:題庫難題不足 2 題時,降到題庫實際有的數量 */
export function requiredHard(hardAvailable: number): number {
  return Math.min(RULES.PASS_HARD, Math.max(0, hardAvailable));
}

/** 複測是否已到期 */
export function recheckDue(t: Pick<TargetState, "status" | "recheck_due_at">, now = new Date()): boolean {
  return t.status === "recheck" && !!t.recheck_due_at && new Date(t.recheck_due_at) <= now;
}

/** 回答一題後的新狀態 */
export function applyAnswer(t: TargetState, a: AnswerInput): TargetState {
  const now = a.now ?? new Date();
  const next: TargetState = {
    ...t,
    total_attempts: t.total_attempts + 1,
    total_correct: t.total_correct + (a.correct ? 1 : 0),
    seen_ids: t.seen_ids.includes(a.questionId) ? t.seen_ids : [...t.seen_ids, a.questionId],
  };

  if (t.status === "graduated") return next;

  if (t.status === "recheck") {
    if (!a.correct) {
      // 複測失手 → 退回練習中,一切重來
      return { ...next, status: "practicing", streak: 0, hard_in_streak: 0, recheck_correct: 0, recheck_due_at: null, passed_at: null };
    }
    const rc = t.recheck_correct + 1;
    if (rc >= RULES.RECHECK_COUNT) {
      return { ...next, recheck_correct: rc, status: "graduated", graduated_at: now.toISOString() };
    }
    return { ...next, recheck_correct: rc };
  }

  // practicing
  if (!a.correct) return { ...next, streak: 0, hard_in_streak: 0 };

  const streak = t.streak + 1;
  const hard = t.hard_in_streak + (a.difficulty >= RULES.HARD_DIFFICULTY ? 1 : 0);
  if (streak >= RULES.PASS_STREAK && hard >= requiredHard(a.hardAvailable)) {
    const due = new Date(now.getTime() + RULES.RECHECK_AFTER_DAYS * 86400_000);
    return {
      ...next, streak, hard_in_streak: hard, status: "recheck",
      passed_at: now.toISOString(), recheck_due_at: due.toISOString(), recheck_correct: 0,
    };
  }
  return { ...next, streak, hard_in_streak: hard };
}

/** 給畫面顯示的進度描述 */
export function progressText(t: TargetState, hardAvailable: number, now = new Date()): string {
  if (t.status === "graduated") return "🎓 已畢業";
  if (t.status === "recheck") {
    if (!recheckDue(t, now)) {
      const d = Math.max(1, Math.ceil((new Date(t.recheck_due_at!).getTime() - now.getTime()) / 86400_000));
      return `✅ 已過關・${d} 天後複測`;
    }
    return `🔔 複測中 ${t.recheck_correct}/${RULES.RECHECK_COUNT}`;
  }
  const need = requiredHard(hardAvailable);
  return `連續答對 ${t.streak}/${RULES.PASS_STREAK}` + (need > 0 ? `・難題 ${Math.min(t.hard_in_streak, need)}/${need}` : "");
}
