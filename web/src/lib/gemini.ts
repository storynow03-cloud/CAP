/**
 * Gemini 呼叫層(只能在伺服器端使用,金鑰絕不可送到瀏覽器)。
 *
 * 備援順序(使用者指定):先用第 1 組金鑰依序嘗試所有模型,全部不行才換下一組金鑰。
 *   金鑰1×模型A → 金鑰1×模型B → … → 金鑰2×模型A → 金鑰2×模型B → …
 * 任何一組回非 200(額度用完 429、模型忙 503、模型不存在 404、金鑰問題 400/403)
 * 或回傳內容解析不了,就換下一組。失敗的呼叫不計費,多試幾次的成本可以忽略。
 *
 * 環境變數(都用逗號分隔,想加金鑰或模型直接往後加,不用改程式):
 *   GEMINI_API_KEYS   金鑰清單,例:key1,key2
 *   GEMINI_MODELS     模型清單,依序嘗試,例:gemini-3.8-flash,gemini-3.7-flash
 * 也相容舊的 GEMINI_API_KEY / GEMINI_API_KEY_1 / GEMINI_API_KEY_2(會合併、去重)。
 */

// 免費方案每個 Flash 模型每天只有約 20 次,Flash Lite 約 500 次,
// 所以新模型排前面、額度大的 Lite 放最後保底。
const DEFAULT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
// 時間預算:Vercel 函式上限 60 秒,AI 最多用 48 秒,留時間給資料庫寫入。
// 實測同一個模型延遲可從 2 秒飄到 70 秒(Google 端排隊),所以單一模型最多等 25 秒,
// 而且每次都替後面的模型保留時間——否則一個卡住的模型會把預算吃光,
// 排在後面、通常 1~2 秒就回的 Flash Lite 根本輪不到。
const TOTAL_BUDGET_MS = 48_000;
const PER_CALL_CAP_MS = 25_000;
const RESERVE_FOR_NEXT_MS = 8_000;

export interface GeminiImage {
  mimeType: string;
  data: string; // base64(不含 data: 前綴)
}

export interface GeminiResult<T> {
  data: T;
  model: string;
  keyIndex: number; // 用第幾組金鑰成功(1 或 2);只記編號,不記金鑰
}

const splitList = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function keys(): string[] {
  const all = [
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
  ].flatMap(splitList);
  return [...new Set(all)];
}

function models(): string[] {
  const fromEnv = splitList(process.env.GEMINI_MODELS);
  return fromEnv.length ? fromEnv : DEFAULT_MODELS;
}

export function geminiConfigured(): boolean {
  return keys().length > 0;
}

/** 從模型回覆中取出 JSON(容許被 ```json 包起來或前後有多餘文字) */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("回覆中找不到 JSON");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * 送出「文字指示 + 圖片」,要求模型回傳 JSON。
 * validate 由呼叫端提供:內容不合格就丟錯,會自動換下一組模型重試。
 */
export async function geminiJson<T>(
  prompt: string,
  images: GeminiImage[],
  validate: (raw: unknown) => T
): Promise<GeminiResult<T>> {
  const ks = keys();
  if (!ks.length) throw new Error("尚未設定 Gemini 金鑰(GEMINI_API_KEYS)");

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });

  const errors: string[] = [];
  const ms = models();
  const attempts = ks.flatMap((_, ki) => ms.map((model) => ({ ki, model })));
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (let ai = 0; ai < attempts.length; ai++) {
    const { ki, model } = attempts[ai];
    const remaining = deadline - Date.now();
    const isLast = ai === attempts.length - 1;
    const timeout = Math.min(PER_CALL_CAP_MS, remaining - (isLast ? 0 : RESERVE_FOR_NEXT_MS));
    if (timeout < 3_000) {
      errors.push(`時間預算用完,未嘗試:金鑰${ki + 1}/${model} 之後的 ${attempts.length - ai} 組`);
      break;
    }
    {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const r = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": ks[ki] },
          body,
          signal: ctrl.signal,
        });
        if (!r.ok) {
          const detail = (await r.text()).slice(0, 160).replace(/\s+/g, " ");
          errors.push(`金鑰${ki + 1}/${model}: HTTP ${r.status} ${detail}`);
          continue;
        }
        const json = await r.json();
        const text: string = (json?.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: string }) => p.text ?? "")
          .join("");
        if (!text) {
          errors.push(`金鑰${ki + 1}/${model}: 空回覆(${json?.candidates?.[0]?.finishReason ?? "未知原因"})`);
          continue;
        }
        const data = validate(extractJson(text));
        if (errors.length) console.warn(`[gemini] 前 ${errors.length} 組失敗後由 金鑰${ki + 1}/${model} 成功:\n${errors.join("\n")}`);
        return { data, model, keyIndex: ki + 1 };
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        errors.push(`金鑰${ki + 1}/${model}: ${aborted ? `逾時(${Math.round(timeout / 1000)} 秒)` : e instanceof Error ? e.message : String(e)}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new Error(`所有金鑰與模型都失敗:\n${errors.join("\n")}`);
}
