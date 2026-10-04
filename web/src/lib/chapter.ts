// 題目的「年級・冊・單元・知識點」標籤,所有模組共用(練習、錯題本、歷程、我的、管理後台…)。
// 家長要一眼看出孩子錯的題目是哪個年級、哪一冊、哪個單元、哪個知識點,才能找資源補強。
//
// 資料來源(題庫欄位):
//   volume          「第 1 冊」→ 第 1~6 冊 = 七上、七下、八上、八下、九上、九下
//   subtopic        單元編號:數學「2-3」、自然/社會「02-02」
//   topic           單元名稱(國文/英文是課名)
//   curriculum_code 課綱學習內容代碼(知識點),例:N-7-3、地Aa-IV-3
//   knowledge_code  康軒知識點代碼:社會 JSG=地理、JSH=歷史、JSC=公民
//   source          來源路徑,國文課次在檔名前兩碼(「07兒時記趣」)

export interface ChapterFields {
  subject: string;
  volume?: string | null;
  subtopic?: string | null;
  topic?: string | null;
  curriculum_code?: string | null;
  knowledge_code?: string | null;
  source?: string | null;
}

/** 需要一起查出來的欄位(放進 supabase select) */
export const CHAPTER_COLUMNS = "subject,volume,subtopic,topic,curriculum_code,knowledge_code,source";

const GRADES = ["", "七上", "七下", "八上", "八下", "九上", "九下"];

export const SOCIAL_BRANCHES = [
  { key: "history", label: "歷史", prefix: "JSH", sub: "02" },
  { key: "geography", label: "地理", prefix: "JSG", sub: "01" },
  { key: "civics", label: "公民", prefix: "JSC", sub: "03" },
] as const;
export type SocialBranch = (typeof SOCIAL_BRANCHES)[number]["key"];

/** 社會的分科(歷史/地理/公民);其他科回傳 null */
export function socialBranch(q: ChapterFields): SocialBranch | null {
  if (q.subject !== "social") return null;
  const kc = (q.knowledge_code ?? "").toUpperCase();
  const byCode = SOCIAL_BRANCHES.find((b) => kc.startsWith(b.prefix));
  if (byCode) return byCode.key;
  const sub = (q.subtopic ?? q.source?.split("/")[1] ?? "").slice(0, 2);
  return SOCIAL_BRANCHES.find((b) => b.sub === sub)?.key ?? null;
}

export const socialBranchLabel = (k: string | null) => SOCIAL_BRANCHES.find((b) => b.key === k)?.label ?? "";

export function volumeNumber(volume?: string | null): number | null {
  const m = volume?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface ChapterInfo {
  /** 七上…九下(沒有冊別資料時 null) */
  grade: string | null;
  /** 「第 1 冊」 */
  volume: string | null;
  /** 社會分科 */
  branch: string | null;
  /** 單元:「2-3 分數的四則運算」「第 7 課 兒時記趣」 */
  unit: string;
  /** 知識點(課綱學習內容代碼),例「N-7-3」 */
  point: string | null;
}

export function chapterInfo(q: ChapterFields): ChapterInfo {
  const n = volumeNumber(q.volume);
  const topic = (q.topic ?? "").trim();
  let unit = topic;
  if (q.subtopic) unit = `${q.subtopic} ${topic}`;
  else if (q.subject === "chinese") {
    const m = q.source?.split("/").pop()?.match(/^(\d{1,2})\D/);
    if (m) unit = `第 ${Number(m[1])} 課 ${topic}`;
  } else if (q.subject === "english") {
    const m = topic.match(/^L(\d+)_(.*)$/);
    if (m) unit = `Lesson ${m[1]} ${m[2]}`;
  }
  const point = (q.curriculum_code ?? "").split(",")[0].trim() || null;
  return {
    grade: n ? GRADES[n] ?? null : null,
    volume: n ? `第 ${n} 冊` : null,
    branch: socialBranchLabel(socialBranch(q)) || null,
    unit,
    point,
  };
}

/** 一行文字版:「七上・第 1 冊|2-3 分數的四則運算|知識點 N-7-3」 */
export function chapterText(q: ChapterFields): string {
  const c = chapterInfo(q);
  const head = [c.branch, c.grade, c.volume].filter(Boolean).join("・");
  return [head, c.unit, c.point ? `知識點 ${c.point}` : null].filter(Boolean).join("|");
}

// ── 科目分組:社會拆成歷史/地理/公民(列表篩選、統計共用) ──
export const SUBJECT_GROUPS = [
  { key: "chinese", label: "國文" },
  { key: "english", label: "英語" },
  { key: "math", label: "數學" },
  { key: "science", label: "自然" },
  { key: "history", label: "歷史" },
  { key: "geography", label: "地理" },
  { key: "civics", label: "公民" },
] as const;

/** 題目所屬分組:社會回傳 history/geography/civics(分不出來時 social),其他科回傳科目 */
export function subjectGroup(q: ChapterFields): string {
  return q.subject === "social" ? socialBranch(q) ?? "social" : q.subject;
}

export const subjectGroupLabel = (k: string) =>
  SUBJECT_GROUPS.find((g) => g.key === k)?.label ?? (k === "social" ? "社會" : k);

/** 單元彙總用的 key:同一冊同一單元算一組 */
export const unitKey = (q: ChapterFields) => `${q.subject}|${q.volume ?? ""}|${q.subtopic ?? ""}|${q.topic ?? ""}`;

/**
 * 掌握度等只記「科目+單元名稱」的資料,用 get_topics RPC(每科一次)取得單元的冊別與單元編號。
 * 回傳 Map<`${subject}|${topic}`, ChapterFields>。單元層級沒有單一知識點,所以不含 curriculum_code。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchTopicChapters(supabase: any, subjects: string[]) {
  const out = new Map<string, ChapterFields>();
  await Promise.all([...new Set(subjects)].map(async (subject) => {
    const { data } = await supabase.rpc("get_topics", { subj: subject });
    for (const t of (data ?? []) as { topic: string; volume: string | null; subtopic: string | null; source: string | null }[]) {
      out.set(`${subject}|${t.topic}`, { subject, topic: t.topic, volume: t.volume, subtopic: t.subtopic, source: t.source });
    }
  }));
  return out;
}
