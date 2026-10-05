// hide-qa-failures.mjs 額外的「可見題」檢查(question-checks 沒有的):放回題目前也要過這些
// 無法顯示的符號(私用區字元)、選項夾帶選項標記、殘留 [[ ]] 佔位符、圖片檔不是圖片
import fs from "node:fs";
import path from "node:path";
import { plain } from "./question-checks.mjs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const MAGIC = ["89504e47", "47494638", "ffd8ff", "52494646"];
const isImage = (src) => {
  const f = path.join(ROOT, "web", "public", src);
  if (!fs.existsSync(f)) return false;
  const h = fs.readFileSync(f).subarray(0, 4).toString("hex");
  return MAGIC.some((m) => h.startsWith(m));
};
export function visibleProblems(q) {
  const qo = [q.question, ...(q.options ?? [])].join("\n");
  const r = [];
  if (/[-]/.test(qo)) r.push("無法顯示的符號");
  if ((q.options ?? []).some((o) => /[（(]\s*[A-EＡ-Ｅ]\s*[）)]/.test(plain(o)))) r.push("選項夾帶選項標記");
  if (/\[\[|\]\]/.test([qo, q.answer_text ?? ""].join("\n"))) r.push("殘留佔位符");
  const srcs = [...[qo, q.answer_text ?? ""].join("\n").matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  if (srcs.some((src) => src.startsWith("/") && !isImage(src))) r.push("圖片檔不是圖片(破圖)");
  return r;
}
