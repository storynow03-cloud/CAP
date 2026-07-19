import type { SupabaseClient } from "@supabase/supabase-js";
import { LEVEL_DIFFICULTY, type Question } from "./types";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 自由練習選題 */
export async function pickPracticeQuestions(
  supabase: SupabaseClient,
  opts: { subject: string; topic?: string; difficulty?: number; count: number }
): Promise<Question[]> {
  let q = supabase
    .from("questions")
    .select("*")
    .eq("subject", opts.subject)
    .eq("needs_review", false)
    .eq("type", "single_choice")
    .limit(500);
  if (opts.topic) q = q.eq("topic", opts.topic);
  if (opts.difficulty) q = q.eq("difficulty", opts.difficulty);
  const { data, error } = await q;
  if (error) throw error;
  return shuffle(data ?? []).slice(0, opts.count);
}

/** 非選題(紙上作答 → 看詳解 → 自評)選題 */
export async function pickWrittenQuestions(
  supabase: SupabaseClient,
  opts: { subject: string; topic?: string; difficulty?: number; count: number }
): Promise<Question[]> {
  // 非選題沒有選項,必須至少有參考答案才能自評對錯
  let q = supabase
    .from("questions")
    .select("*")
    .eq("subject", opts.subject)
    .eq("needs_review", false)
    .neq("type", "single_choice")
    .not("answer_text", "is", null)
    .neq("answer_text", "")
    .limit(500);
  if (opts.topic) q = q.eq("topic", opts.topic);
  if (opts.difficulty) q = q.eq("difficulty", opts.difficulty);
  const { data, error } = await q;
  if (error) throw error;
  return shuffle(data ?? []).slice(0, opts.count);
}

/** 全真模擬考單科選題:依真實規格題數,從該科可用單選題隨機組卷 */
export async function pickFullExam(
  supabase: SupabaseClient,
  subject: string,
  count: number
): Promise<Question[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("subject", subject)
    .eq("needs_review", false)
    .eq("type", "single_choice")
    .limit(1500);
  if (error) throw error;
  return shuffle(data ?? []).slice(0, count);
}

/**
 * 分階挑戰選題(核心):
 * 1. 錯題複習最多 3 題(到期的)
 * 2. 弱點單元約 4 題(精熟度最低)
 * 3. 推進題:當前等級難度,排除 30 天內答對 2 次以上的題目
 */
export async function pickChallengeQuestions(
  supabase: SupabaseClient,
  userId: string,
  subject: string,
  count = 10
): Promise<{ questions: Question[]; reviewIds: Set<string>; level: number }> {
  // 取精熟度
  const { data: masteryRows } = await supabase
    .from("mastery")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", subject);
  const topicLevel = new Map<string, number>();
  for (const m of masteryRows ?? []) topicLevel.set(m.topic, m.level);
  const overallLevel = masteryRows?.length
    ? Math.max(1, Math.round(masteryRows.reduce((s, m) => s + m.level, 0) / masteryRows.length))
    : 1;
  const [dMin, dMax] = LEVEL_DIFFICULTY[overallLevel];

  const picked: Question[] = [];
  const usedIds = new Set<string>();
  const reviewIds = new Set<string>();

  // 1) 到期錯題
  const { data: due } = await supabase
    .from("wrong_book")
    .select("question_id, questions(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(3);
  for (const row of due ?? []) {
    const q = row.questions as unknown as Question;
    if (q && q.subject === subject) {
      picked.push(q);
      usedIds.add(q.id);
      reviewIds.add(q.id);
    }
  }

  // 30 天內已答對 2 次以上的題目 → 排除(不重複做會的題)
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: recentCorrect } = await supabase
    .from("attempts")
    .select("question_id")
    .eq("user_id", userId)
    .eq("is_correct", true)
    .gte("created_at", since)
    .limit(2000);
  const correctCount = new Map<string, number>();
  for (const a of recentCorrect ?? [])
    correctCount.set(a.question_id, (correctCount.get(a.question_id) ?? 0) + 1);
  const mastered = new Set(
    [...correctCount.entries()].filter(([, c]) => c >= 2).map(([id]) => id)
  );

  // 候選題(當前等級難度)
  const { data: candidates } = await supabase
    .from("questions")
    .select("*")
    .eq("subject", subject)
    .eq("needs_review", false)
    .eq("type", "single_choice")
    .gte("difficulty", dMin)
    .lte("difficulty", dMax)
    .limit(1000);
  const pool = shuffle(
    (candidates ?? []).filter((q) => !usedIds.has(q.id) && !mastered.has(q.id))
  );

  // 2) 弱點單元優先(精熟度最低的 2 個單元)
  const weakTopics = (masteryRows ?? [])
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((m) => m.topic);
  const weakPool = pool.filter((q) => weakTopics.includes(q.topic));
  for (const q of weakPool.slice(0, 4)) {
    if (picked.length >= count) break;
    picked.push(q);
    usedIds.add(q.id);
  }

  // 3) 其餘隨機推進
  for (const q of pool) {
    if (picked.length >= count) break;
    if (!usedIds.has(q.id)) {
      picked.push(q);
      usedIds.add(q.id);
    }
  }

  return { questions: shuffle(picked), reviewIds, level: overallLevel };
}

/** 綜合模擬考:依各科目前等級,五科各出 N 題 */
export async function pickMockExam(
  supabase: SupabaseClient,
  userId: string,
  subjects: string[],
  perSubject = 5
): Promise<{ questions: Question[]; levels: Record<string, number> }> {
  const { data: masteryRows } = await supabase
    .from("mastery")
    .select("subject, level")
    .eq("user_id", userId);
  const levels: Record<string, number> = {};
  const all: Question[] = [];
  for (const subject of subjects) {
    const rows = (masteryRows ?? []).filter((m) => m.subject === subject);
    const level = rows.length
      ? Math.max(1, Math.round(rows.reduce((s, m) => s + m.level, 0) / rows.length))
      : 1;
    levels[subject] = level;
    const [dMin, dMax] = LEVEL_DIFFICULTY[level];
    const { data } = await supabase
      .from("questions")
      .select("*")
      .eq("subject", subject)
      .eq("needs_review", false)
      .eq("type", "single_choice")
      .gte("difficulty", dMin)
      .lte("difficulty", dMax)
      .limit(300);
    all.push(...shuffle(data ?? []).slice(0, perSubject));
  }
  return { questions: all, levels };
}

/** 大會考:依固定題目 ID 取題(全員同卷) */
export async function fetchQuestionsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Question[]> {
  const { data, error } = await supabase.from("questions").select("*").in("id", ids);
  if (error) throw error;
  const order = new Map(ids.map((id, i) => [id, i]));
  return (data ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** 記錄作答:attempts + mastery + wrong_book + daily_stats */
export async function recordAnswer(
  supabase: SupabaseClient,
  userId: string,
  q: Question,
  selected: number | null,
  isCorrect: boolean,
  mode: "practice" | "challenge" | "exam" | "review",
  timeSpentMs: number
): Promise<{ levelUp?: number; levelDown?: number }> {
  const { error: attemptErr } = await supabase.from("attempts").insert({
    user_id: userId,
    question_id: q.id,
    selected,
    is_correct: isCorrect,
    time_spent_ms: timeSpentMs,
    mode,
  });
  // 作答沒記錄成功等於整個學習歷程都失真,不要靜默吞掉(這個錯誤曾因為被吞掉而讓
  // 搬遷後「序列沒推進、主鍵衝突」的 bug 潛伏很久沒被發現)。這裡只記錄不 throw,
  // 因為呼叫端(Quiz / WrittenQuiz)沒有 try/catch,throw 會讓畫面卡住。
  if (attemptErr) console.error("[recordAnswer] attempts insert 失敗:", attemptErr.message);

  // 每日統計
  const today = new Date().toISOString().slice(0, 10);
  const { data: ds } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("user_id", userId)
    .eq("day", today)
    .maybeSingle();
  await supabase.from("daily_stats").upsert({
    user_id: userId,
    day: today,
    total: (ds?.total ?? 0) + 1,
    correct: (ds?.correct ?? 0) + (isCorrect ? 1 : 0),
    minutes: (ds?.minutes ?? 0) + Math.round(timeSpentMs / 60000),
  });

  // 精熟度
  const result: { levelUp?: number; levelDown?: number } = {};
  const { data: m } = await supabase
    .from("mastery")
    .select("*")
    .eq("user_id", userId)
    .eq("subject", q.subject)
    .eq("topic", q.topic)
    .maybeSingle();
  let level = m?.level ?? 1;
  let recent: number[] = Array.isArray(m?.recent) ? [...m.recent] : [];
  recent.push(isCorrect ? 1 : 0);
  if (recent.length > 10) recent = recent.slice(-10);
  if (recent.length >= 10) {
    const acc = recent.reduce((s, v) => s + v, 0) / recent.length;
    if (acc >= 0.8 && level < 5) {
      level += 1;
      result.levelUp = level;
      recent = [];
    } else if (acc < 0.4 && level > 1) {
      level -= 1;
      result.levelDown = level;
      recent = [];
    }
  }
  const attempts_count = (m?.attempts_count ?? 0) + 1;
  const correct_count = (m?.correct_count ?? 0) + (isCorrect ? 1 : 0);
  // 加權分數:整體答對率 70% + 近期表現 30%
  const recentAcc = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : correct_count / attempts_count;
  const score = Math.round((0.7 * (correct_count / attempts_count) + 0.3 * recentAcc) * 100);
  await supabase.from("mastery").upsert({
    user_id: userId,
    subject: q.subject,
    topic: q.topic,
    level,
    score,
    recent,
    attempts_count,
    correct_count,
    updated_at: new Date().toISOString(),
  });

  // 錯題本
  if (!isCorrect) {
    await supabase.from("wrong_book").upsert({
      user_id: userId,
      question_id: q.id,
      due_at: new Date(Date.now() + 86400 * 1000).toISOString(),
      interval_days: 1,
      streak: 0,
      status: "active",
    });
  } else if (mode === "review") {
    const { data: wb } = await supabase
      .from("wrong_book")
      .select("*")
      .eq("user_id", userId)
      .eq("question_id", q.id)
      .maybeSingle();
    if (wb) {
      const streak = wb.streak + 1;
      if (streak >= 3) {
        await supabase
          .from("wrong_book")
          .update({ status: "overcome", streak })
          .eq("user_id", userId)
          .eq("question_id", q.id);
      } else {
        const interval = Math.min(wb.interval_days * 2 + 1, 14);
        await supabase
          .from("wrong_book")
          .update({
            streak,
            interval_days: interval,
            due_at: new Date(Date.now() + interval * 86400 * 1000).toISOString(),
          })
          .eq("user_id", userId)
          .eq("question_id", q.id);
      }
    }
  }
  return result;
}
