import { NextRequest, NextResponse } from "next/server";
import { requireUser, adminFetch } from "@/lib/supabase/admin";
import { geminiJson, geminiConfigured, type GeminiImage } from "@/lib/gemini";
import { SUBJECTS, subjectLabel } from "@/lib/types";
import { requiredHard } from "@/lib/remediation";
import { hardAvailable, topicCodes } from "@/lib/remediation-server";

/**
 * 考卷診斷。
 * POST:上傳考卷照片 → Gemini 找出錯題與對應單元 → 存診斷紀錄 → 為每個答錯的單元建立補強目標
 * GET ?userId=:該學生的診斷紀錄與補強目標(本人或管理者)
 *
 * 照片只送去分析、不落地保存(可能有姓名、學校)。資料庫只存 AI 讀出的文字與判斷。
 */

export const maxDuration = 60; // Gemini 讀多頁考卷可能要數十秒

const MAX_IMAGES = 4;
const MAX_IMAGE_B64 = 2_800_000; // 單張 base64 上限(約 2MB 圖檔);前端已先壓縮
const DAILY_LIMIT = 10; // 每位上傳者每 24 小時上限,控制 API 用量
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

interface TopicRow { topic: string; volume: string | null; subtopic: string | null }

export interface DiagnosedItem {
  number: string;
  question: string;
  student_answer: string;
  correct_answer: string;
  is_wrong: boolean;
  topic: string; // AI 選的單元(原文)
  matched_topic: string | null; // 對應到題庫的單元;null = 對不上,無法出補強題
  error_type: "concept" | "calculation" | "reading" | "careless" | "unknown";
  explanation: string;
  confidence: number;
}

const VOLUME = ["", "七上", "七下", "八上", "八下", "九上", "九下"];
const norm = (s: string) => s.replace(/[\s、，,。．.()（）「」:：\-—]/g, "");

/** AI 回的單元名稱對應回題庫的單元(完全相同 → 去標點後相同 → 唯一包含關係) */
function matchTopic(name: string, topics: string[]): string | null {
  if (!name) return null;
  if (topics.includes(name)) return name;
  const n = norm(name);
  const exact = topics.find((t) => norm(t) === n);
  if (exact) return exact;
  const contains = topics.filter((t) => norm(t).includes(n) || n.includes(norm(t)));
  return contains.length === 1 ? contains[0] : null;
}

function buildPrompt(subject: string, scope: "full" | "wrong_only", topics: TopicRow[]) {
  const list = topics
    .map((t) => {
      const v = Number(String(t.volume ?? "").match(/\d+/)?.[0] ?? 0);
      return `- ${t.topic}${VOLUME[v] ? `(${VOLUME[v]})` : ""}`;
    })
    .join("\n");

  return `你是台灣國中會考的資深${subjectLabel(subject)}老師。附圖是一位國中生的${subjectLabel(subject)}考卷照片${scope === "wrong_only" ? "(只拍了答錯的題目)" : ""}。

請逐題辨識,找出學生答錯的題目,並判斷每一題錯在哪個單元、為什麼錯。

判斷對錯的方式:
${scope === "wrong_only"
    ? "- 這些照片裡的題目都是學生答錯的,每一題 is_wrong 都填 true。"
    : "- 優先依考卷上的批改痕跡(紅筆打叉、圈起、扣分)判斷。\n- 看不到批改痕跡時,自己解題比對學生的答案;不確定時 confidence 請給低一點。\n- 答對的題目也要列出,is_wrong 填 false(可以不寫 explanation)。"}

「topic」必須從下面這份單元清單中**原封不動**選一個最符合的(括號裡是年級,不要寫進 topic):
${list}

如果題目明顯不屬於清單中任何單元,topic 填空字串。

error_type 只能是:concept(觀念錯誤)、calculation(計算錯誤)、reading(審題錯誤,沒看清題意)、careless(粗心)、unknown(無法判斷)。

explanation 用繁體中文、寫給國中生看:具體指出錯在哪個觀念、正確的想法是什麼,2~4 句,不要只說「要多練習」。

只回傳 JSON,格式如下,不要有其他文字:
{
  "questions": [
    {
      "number": "題號(例如 5)",
      "question": "題目重點摘要(50 字內)",
      "student_answer": "學生的答案",
      "correct_answer": "正確答案",
      "is_wrong": true,
      "topic": "單元名稱(必須來自上面清單)",
      "error_type": "concept",
      "explanation": "給學生看的說明",
      "confidence": 0.9
    }
  ],
  "summary": "整體弱點總結(給家長看,2~3 句)"
}`;
}

function validate(raw: unknown): { questions: Omit<DiagnosedItem, "matched_topic">[]; summary: string } {
  const r = raw as { questions?: unknown; summary?: unknown };
  if (!r || !Array.isArray(r.questions)) throw new Error("格式錯誤:缺少 questions 陣列");
  if (!r.questions.length) throw new Error("沒有辨識出任何題目");
  const types = ["concept", "calculation", "reading", "careless", "unknown"];
  const questions = r.questions.map((q: Record<string, unknown>) => ({
    number: String(q.number ?? ""),
    question: String(q.question ?? "").slice(0, 200),
    student_answer: String(q.student_answer ?? ""),
    correct_answer: String(q.correct_answer ?? ""),
    is_wrong: q.is_wrong !== false,
    topic: String(q.topic ?? ""),
    error_type: (types.includes(String(q.error_type)) ? q.error_type : "unknown") as DiagnosedItem["error_type"],
    explanation: String(q.explanation ?? "").slice(0, 600),
    confidence: Math.min(1, Math.max(0, Number(q.confidence ?? 0.5) || 0.5)),
  }));
  return { questions, summary: String(r.summary ?? "").slice(0, 600) };
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!geminiConfigured()) return NextResponse.json({ error: "系統尚未設定 AI 金鑰,請通知家長" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const subject = String(body?.subject ?? "");
  const scope = body?.scope === "wrong_only" ? "wrong_only" : "full";
  const title = String(body?.title ?? "").slice(0, 60) || null;
  const targetUserId = String(body?.targetUserId || auth.user.id);
  const images: GeminiImage[] = Array.isArray(body?.images) ? body.images : [];

  if (!SUBJECTS.some((s) => s.key === subject)) return NextResponse.json({ error: "請選擇科目" }, { status: 400 });
  if (targetUserId !== auth.user.id && !auth.isStaff)
    return NextResponse.json({ error: "只有家長可以替別人上傳考卷" }, { status: 403 });
  if (!images.length || images.length > MAX_IMAGES)
    return NextResponse.json({ error: `請上傳 1~${MAX_IMAGES} 張照片` }, { status: 400 });
  for (const img of images) {
    if (!ALLOWED_MIME.includes(img?.mimeType) || typeof img?.data !== "string" || img.data.length > MAX_IMAGE_B64)
      return NextResponse.json({ error: "照片格式或大小不符(請用 JPG/PNG)" }, { status: 400 });
  }

  // 用量上限
  const since = new Date(Date.now() - 86400_000).toISOString();
  const used = await adminFetch(
    `/rest/v1/diagnoses?uploaded_by=eq.${auth.user.id}&created_at=gte.${since}&select=id&limit=1`,
    { headers: { Prefer: "count=exact" } }
  );
  if (Number(used.headers.get("content-range")?.split("/")[1] ?? 0) >= DAILY_LIMIT)
    return NextResponse.json({ error: `今天已上傳 ${DAILY_LIMIT} 次,明天再來` }, { status: 429 });

  // 單元清單(讓 AI 只能從題庫既有單元挑,結果才能直接拿來出題)
  const topicsRes = await adminFetch("/rest/v1/rpc/get_topics", { method: "POST", body: JSON.stringify({ subj: subject }) });
  const topicRows: TopicRow[] = await topicsRes.json();
  if (!Array.isArray(topicRows) || !topicRows.length) return NextResponse.json({ error: "讀取單元清單失敗" }, { status: 500 });
  const topicNames = topicRows.map((t) => t.topic);

  let ai;
  try {
    ai = await geminiJson(buildPrompt(subject, scope, topicRows), images, validate);
  } catch (e) {
    console.error("[diagnose] Gemini 失敗:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "AI 分析失敗,請確認照片清楚後再試一次" }, { status: 502 });
  }

  const items: DiagnosedItem[] = ai.data.questions.map((q) => ({
    ...q,
    is_wrong: scope === "wrong_only" ? true : q.is_wrong,
    matched_topic: matchTopic(q.topic, topicNames),
  }));
  const wrong = items.filter((q) => q.is_wrong);

  const insert = await adminFetch("/rest/v1/diagnoses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: targetUserId,
      uploaded_by: auth.user.id,
      subject,
      scope,
      title,
      model: ai.model,
      result: { items, summary: ai.data.summary },
    }),
  });
  const [diagnosis] = await insert.json();
  if (!diagnosis?.id) return NextResponse.json({ error: "儲存診斷結果失敗" }, { status: 500 });

  // 每個答錯的單元一筆補強目標;同單元之前練過(甚至畢業)也重置回練習中
  const byTopic = new Map<string, string[]>();
  for (const q of wrong) {
    if (!q.matched_topic) continue;
    byTopic.set(q.matched_topic, [...(byTopic.get(q.matched_topic) ?? []), q.explanation]);
  }
  if (byTopic.size) {
    const now = new Date().toISOString();
    const upsert = await adminFetch("/rest/v1/remediation_targets?on_conflict=user_id,subject,topic", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(
        [...byTopic].map(([topic, reasons]) => ({
          user_id: targetUserId,
          subject,
          topic,
          diagnosis_id: diagnosis.id,
          reason: reasons.filter(Boolean).join("\n").slice(0, 1000),
          status: "practicing",
          streak: 0,
          hard_in_streak: 0,
          seen_ids: [],
          recheck_correct: 0,
          passed_at: null,
          recheck_due_at: null,
          graduated_at: null,
          updated_at: now,
        }))
      ),
    });
    if (!upsert.ok) console.error("[diagnose] 建立補強目標失敗:", await upsert.text());
  }

  return NextResponse.json({
    diagnosis,
    wrongCount: wrong.length,
    unmatched: wrong.filter((q) => !q.matched_topic).length,
    targets: byTopic.size,
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const userId = req.nextUrl.searchParams.get("userId") || auth.user.id;
  if (userId !== auth.user.id && !auth.isStaff) return NextResponse.json({ error: "沒有權限" }, { status: 403 });

  const [diagnoses, targets] = await Promise.all([
    adminFetch(`/rest/v1/diagnoses?user_id=eq.${userId}&select=*&order=created_at.desc&limit=20`).then((r) => r.json()),
    adminFetch(`/rest/v1/remediation_targets?user_id=eq.${userId}&select=*&order=updated_at.desc`).then((r) => r.json()),
  ]);
  // 每個未畢業目標附上實際的難題門檻(該單元難題不足時會放寬),畫面才能顯示正確進度
  const list = Array.isArray(targets) ? targets : [];
  const withHard = await Promise.all(
    list.map(async (t: { subject: string; topic: string; status: string }) => {
      if (t.status === "graduated") return { ...t, requiredHard: 0 };
      const hard = await hardAvailable(t.subject, t.topic, await topicCodes(t.subject, t.topic));
      return { ...t, requiredHard: requiredHard(hard) };
    })
  );
  return NextResponse.json({
    diagnoses: Array.isArray(diagnoses) ? diagnoses : [],
    targets: withHard,
    aiReady: geminiConfigured(),
  });
}
