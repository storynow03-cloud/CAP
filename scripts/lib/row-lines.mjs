// 從表格「預覽圖」數出實際露出幾列(render-ole-tables.mjs 用來驗證轉出的表格沒有多出被裁掉的列)。
// 原理:預覽圖字很糊,但表格框線還清楚。數「貫穿 85% 以上寬度」的水平線;若最外框被裁掉
// (第一條線上方 / 最後一條線下方還留著半列以上高度),補算一列。數不出兩條線(無框表格)回傳 rows=null。
import { createRequire } from "node:module";
const sharp = createRequire(new URL("../../web/package.json", import.meta.url))("sharp");
export async function countRowLines(file) {
  const { data, info } = await sharp(file).flatten({ background: "#fff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const dark = [];
  for (let y = 0; y < h; y++) {
    // 允許框線有 1~2px 斷點:找這一列「最長的連續暗段」
    let run = 0, best = 0, gap = 0;
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] < 140) { run += 1 + gap; gap = 0; best = Math.max(best, run); }
      else if (run && gap < 2) gap++;
      else { run = 0; gap = 0; }
    }
    dark.push(best / w >= 0.85);
  }
  const ys = [];
  for (let y = 0; y < h; y++) if (dark[y] && !dark[y - 1]) ys.push(y);
  if (ys.length < 2) return { lines: ys.length, rows: null };
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  // 外框被裁掉:第一條線上方 / 最後一條線下方還留著接近一整列的高度 → 那裡其實還有一列
  const top = ys[0] > med * 0.5 ? 1 : 0;
  const bottom = h - 1 - ys[ys.length - 1] > med * 0.5 ? 1 : 0;
  return { lines: ys.length, rows: ys.length - 1 + top + bottom, top, bottom };
}
