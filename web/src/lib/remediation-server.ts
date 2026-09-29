/**
 * 補強練習的出題(伺服器端,走 service key)。
 *
 * 題目來源依使用者要求:**會考真題優先,用完才用題庫**。
 *   - 真題是依「年份」分類的(topic = 「104年會考」),不是依章節,所以不能用單元名稱找。
 *     改用課綱學習內容代碼(curriculum_code)對應:先查出這個單元的題目用了哪些課綱代碼,
 *     再找「帶有同樣代碼的會考真題」。
 *   - 題庫:同單元(topic)的題目。
 * 只出單選題:補強要能客觀判定對錯,非選題是自評制,不適合當過關依據。
 */
import { adminFetch } from "@/lib/supabase/admin";
import { RULES, type TargetState } from "@/lib/remediation";
import type { Question } from "@/lib/types";

const BASE = "needs_review=eq.false&type=eq.single_choice";
const REAL_EXAM = `or=${encodeURIComponent("(topic.ilike.*會考*,source.ilike.*會考*)")}`;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function rows<T>(path: string): Promise<T[]> {
  const d = await (await adminFetch(`/rest/v1/${path}`)).json();
  return Array.isArray(d) ? d : [];
}

async function count(path: string): Promise<number> {
  const r = await adminFetch(`/rest/v1/${path}&select=id&limit=1`, { headers: { Prefer: "count=exact" } });
  return Number(r.headers.get("content-range")?.split("/")[1] ?? 0);
}

const inList = (vals: string[]) => `in.(${vals.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;
const eq = (v: string) => `eq.${encodeURIComponent(v)}`;

/** 這個單元的題目用到的課綱代碼(用來找同知識點的會考真題) */
export async function topicCodes(subject: string, topic: string): Promise<string[]> {
  const r = await rows<{ curriculum_code: string | null }>(
    `questions?subject=${eq(subject)}&topic=${eq(topic)}&${BASE}&curriculum_code=not.is.null&select=curriculum_code&limit=2000`
  );
  return [...new Set(r.map((x) => x.curriculum_code!).filter(Boolean))];
}

/** 真題池 + 題庫池中難題(★★★以上)總數,用來決定難題門檻是否放寬 */
export async function hardAvailable(subject: string, topic: string, codes: string[]): Promise<number> {
  const hard = `difficulty=gte.${RULES.HARD_DIFFICULTY}`;
  const bank = await count(`questions?subject=${eq(subject)}&topic=${eq(topic)}&${BASE}&${hard}`);
  const real = codes.length
    ? await count(`questions?subject=${eq(subject)}&${BASE}&${REAL_EXAM}&curriculum_code=${inList(codes)}&${hard}`)
    : 0;
  return bank + real;
}

/**
 * 挑下一批題目。
 * 回傳 exhausted = true 代表這個單元的題目都出過了(極少見),呼叫端應清空 seen_ids 重新輪一次。
 */
export async function pickRemediationQuestions(
  subject: string,
  topic: string,
  target: Pick<TargetState, "status" | "seen_ids" | "recheck_correct">
): Promise<{ questions: Question[]; realCount: number; exhausted: boolean }> {
  const codes = await topicCodes(subject, topic);
  const seen = new Set(target.seen_ids);

  const [realPool, bankPool] = await Promise.all([
    codes.length
      ? rows<Question>(`questions?subject=${eq(subject)}&${BASE}&${REAL_EXAM}&curriculum_code=${inList(codes)}&select=*&limit=300`)
      : Promise.resolve([] as Question[]),
    rows<Question>(`questions?subject=${eq(subject)}&topic=${eq(topic)}&${BASE}&select=*&limit=600`),
  ]);

  const real = shuffle(realPool.filter((q) => !seen.has(q.id)));
  const realIds = new Set(real.map((q) => q.id));
  const bank = shuffle(bankPool.filter((q) => !seen.has(q.id) && !realIds.has(q.id)));

  const want = target.status === "recheck" ? RULES.RECHECK_COUNT - target.recheck_correct : RULES.BATCH;
  let exhausted = false;
  let pool = [...real, ...bank];
  if (!pool.length) {
    // 全部都出過了:重新輪一次(仍是真題優先)
    exhausted = true;
    pool = [...shuffle(realPool), ...shuffle(bankPool.filter((q) => !realPool.some((r) => r.id === q.id)))];
  }

  const picked = pool.slice(0, Math.max(1, want));

  // 練習中:確保這批至少有 PASS_HARD 題難題,否則孩子不可能在這批過關
  if (target.status === "practicing") {
    const isHard = (q: Question) => q.difficulty >= RULES.HARD_DIFFICULTY;
    let hardIn = picked.filter(isHard).length;
    const spare = pool.slice(picked.length).filter(isHard);
    for (let i = picked.length - 1; i >= 0 && hardIn < RULES.PASS_HARD && spare.length; i--) {
      if (!isHard(picked[i])) {
        picked[i] = spare.shift()!;
        hardIn++;
      }
    }
  }

  const pickedReal = picked.filter((q) => realPool.some((r) => r.id === q.id)).length;
  return { questions: shuffle(picked), realCount: pickedReal, exhausted };
}
