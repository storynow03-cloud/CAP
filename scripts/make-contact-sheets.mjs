// 把題目圖片拼成「拼圖頁」(每頁 12 張、3×4,每張標編號),給 Claude 子代理逐頁看圖篩檢(2026-10-04)
// 小圖會放大到最多 2 倍,讓糊掉/擠在一起的字母看得出來;不是圖片的檔案(.html)略過(另由檔頭檢查標記)。
// 用法:node scripts/make-contact-sheets.mjs <圖片清單.json> <輸出資料夾>
//   輸出:sheet-0001.png …、manifest.json({ "sheet-0001": [{ n: 1, p: "/qimg/..." }, …] })
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/rest.mjs";

const sharp = createRequire(path.join(ROOT, "web", "package.json"))("sharp");
const [listFile, outDir] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(listFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const COLS = 3, ROWS = 4, PER = COLS * ROWS;
const TW = 380, TH = 260, LABEL = 22, GAP = 8;
const W = COLS * TW + (COLS + 1) * GAP, H = ROWS * (TH + LABEL) + (ROWS + 1) * GAP;
const MAGIC = ["89504e47", "47494638", "ffd8ff", "52494646"];

const imgs = list.filter((x) => {
  const f = path.join(ROOT, "web", "public", x.p);
  return fs.existsSync(f) && MAGIC.some((m) => fs.readFileSync(f).subarray(0, 4).toString("hex").startsWith(m));
});
const manifest = {};
let n = 0;
for (let s = 0; s < imgs.length; s += PER) {
  const name = `sheet-${String(s / PER + 1).padStart(4, "0")}`;
  const tiles = imgs.slice(s, s + PER);
  const comps = [];
  manifest[name] = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = GAP + (i % COLS) * (TW + GAP), y = GAP + Math.floor(i / COLS) * (TH + LABEL + GAP);
    const file = path.join(ROOT, "web", "public", tiles[i].p);
    let buf;
    try {
      const meta = await sharp(file, { animated: false }).metadata();
      const scale = Math.min(2, TW / (meta.width || TW), TH / (meta.height || TH));
      buf = await sharp(file, { animated: false })
        .resize(Math.max(1, Math.round((meta.width || TW) * scale)), Math.max(1, Math.round((meta.height || TH) * scale)))
        .flatten({ background: "#ffffff" }).png().toBuffer();
    } catch {
      buf = await sharp({ create: { width: 200, height: 60, channels: 3, background: "#fecaca" } }).png().toBuffer();
    }
    const label = `<svg width="${TW}" height="${LABEL}"><rect width="100%" height="100%" fill="#1e293b"/><text x="6" y="16" font-size="15" font-family="Arial" font-weight="bold" fill="#fde047">#${i + 1}</text></svg>`;
    comps.push({ input: Buffer.from(label), left: x, top: y });
    comps.push({ input: buf, left: x, top: y + LABEL });
    manifest[name].push({ n: i + 1, p: tiles[i].p });
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: "#e2e8f0" } })
    .composite(comps).png({ compressionLevel: 6 }).toFile(path.join(outDir, `${name}.png`));
  n += tiles.length;
  if ((s / PER) % 100 === 0) console.log(`${name} … ${n}/${imgs.length}`);
}
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest), "utf8");
console.log(`完成:${Object.keys(manifest).length} 頁、${n} 張圖(略過非圖片 ${list.length - imgs.length} 個)`);
