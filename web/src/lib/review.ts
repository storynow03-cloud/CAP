/**
 * 錯題複習規則(間隔重複)。純函式,不碰資料庫,方便單元測試。
 *
 * 答錯 → 進錯題本,1 天後複習
 * 複習答對 → 間隔拉長:1 天 → 3 天 → 7 天,連續答對 3 次 = 克服
 * 複習答錯 → 從頭來(1 天後)
 *
 * 第 3 次(最後一次)複習改考「變化題」:同單元、另一道沒做過的題目。
 * 原因:同一題看三次,孩子可能只是記住答案是 (C),不是真的會;
 * 換一題還答得對,才算真的把這個觀念學起來。
 */

export const REVIEW_RULES = {
  /** 連續答對幾次算克服 */
  OVERCOME_STREAK: 3,
  /** 第 n 次答對後,隔幾天再複習(index = 答對後的 streak) */
  INTERVAL_AFTER: [1, 3, 7] as const,
  /** 一次複習最多幾題(避免孩子看到 50 題就不想開始) */
  BATCH: 10,
};

export interface ReviewState {
  streak: number;
  interval_days: number;
  due_at: string;
  status: "active" | "overcome";
}

/** 下一次(第 streak+1 次)複習是不是最後一關(要考變化題) */
export function isFinalReview(streak: number): boolean {
  return streak + 1 >= REVIEW_RULES.OVERCOME_STREAK;
}

/** 複習作答後的新狀態 */
export function nextReviewState(streak: number, correct: boolean, now = new Date()): ReviewState {
  const day = 86400 * 1000;
  if (!correct) {
    return { streak: 0, interval_days: 1, due_at: new Date(now.getTime() + day).toISOString(), status: "active" };
  }
  const s = streak + 1;
  if (s >= REVIEW_RULES.OVERCOME_STREAK) {
    return { streak: s, interval_days: 0, due_at: now.toISOString(), status: "overcome" };
  }
  const interval = REVIEW_RULES.INTERVAL_AFTER[s];
  return { streak: s, interval_days: interval, due_at: new Date(now.getTime() + interval * day).toISOString(), status: "active" };
}

/** 給孩子看的進度,例如「●●○ 下次複習:7 天後」 */
export function reviewProgressText(state: ReviewState): string {
  if (state.status === "overcome") return "🎓 這題克服了!從錯題本畢業";
  const dots = "●".repeat(state.streak) + "○".repeat(REVIEW_RULES.OVERCOME_STREAK - state.streak);
  return `錯題進度 ${dots}・${state.interval_days} 天後再複習一次`;
}
