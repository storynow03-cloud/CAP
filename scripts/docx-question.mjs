// 從數學原檔(.doc 其實是 docx)依題號抽出一題:題幹 / 選項 (A)~(D) / 答案 / 詳解,
// 公式直接轉 HTML:Word EQ 功能變數 → lib/eq-field.mjs;OMML → scripts/lib/omml.py(批次呼叫)。
// 圖片(r:embed)依出現順序對回 lo-html 的 img 序號 → /qimg/math/<slug>/<NNN>.<ext>(與既有網站圖同一份)。
// 這裡只匯出函式,給 rebuild-math-hidden.mjs 用。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/rest.mjs";
import { eqToHtml } from "./lib/eq-field.mjs";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** 讀 docx 的 document.xml + rels(用 PowerShell 的 .NET zip,免安裝套件) */
const zipCache = new Map();
export function readDocx(file) {
  if (zipCache.has(file)) return zipCache.get(file);
  const ps = `Add-Type -AssemblyName System.IO.Compression.FileSystem;$z=[IO.Compression.ZipFile]::OpenRead('${file.replace(/'/g, "''")}');` +
    `foreach($n in 'word/document.xml','word/_rels/document.xml.rels'){$e=$z.GetEntry($n);$r=New-Object IO.StreamReader($e.Open());` +
    `[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($r.ReadToEnd())));[Console]::Out.Write('|');$r.Close()};$z.Dispose()`;
  const out = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", maxBuffer: 1 << 28 });
  const [doc, rels] = out.split("|").map((b) => Buffer.from(b, "base64").toString("utf8"));
  const relMap = new Map([...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  const r = { doc, relMap };
  zipCache.set(file, r);
  return r;
}

/**
 * docx → token 串流:{t:"text",v} | {t:"eq",code,sup:[...]} | {t:"omml",xml} | {t:"img",n} | {t:"br"}
 * img 的 n 是第幾張圖(與 rerender-metafiles 的 docx_seq 相同順序 = lo-html img 順序的子序列)
 */
export function tokens(doc, relMap) {
  const out = [];
  let picN = 0;
  const stack = []; // 欄位:{code, marked, res}
  const re = /<m:oMath>[\s\S]*?<\/m:oMath>|<w:p[ >]|<\/w:p>|<w:br\/>|<w:tab\/>|<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  for (let m; (m = re.exec(doc)); ) {
    const s = m[0];
    if (s.startsWith("<m:oMath>")) { if (!stack.length || stack.at(-1).res) out.push({ t: "omml", xml: s }); continue; }
    if (s === "</w:p>" || s === "<w:br/>") { out.push({ t: "br" }); continue; }
    if (s === "<w:tab/>") { out.push({ t: "text", v: " " }); continue; }
    if (s.startsWith("<w:p")) continue;
    const run = m[1] ?? "";
    const fld = run.match(/<w:fldChar w:fldCharType="(begin|separate|end)"/);
    if (fld?.[1] === "begin") { stack.push({ code: "", marked: "", res: false }); continue; }
    if (fld?.[1] === "separate") { if (stack.length) stack.at(-1).res = true; continue; }
    if (fld?.[1] === "end") {
      const f = stack.pop();
      if (!f) continue;
      const isEq = /^\s*\\?eq\b/i.test(f.code); // 代碼可能被拆成「 \e」「q」→「\eq」
      if (isEq && stack.length && !stack.at(-1).res) { // 巢狀 EQ:併入外層代碼
        stack.at(-1).code += " " + f.code.replace(/^\s*\\?eq\s*/i, "");
        stack.at(-1).marked += " " + f.marked.replace(/^\s*\\?eq\s*/i, "");
      } else if (isEq && (!stack.length || stack.at(-1).res)) out.push({ t: "eq", code: f.code, marked: f.marked });
      continue;
    }
    const instr = [...run.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((x) => unxml(x[1])).join("");
    if (instr && stack.length && !stack.at(-1).res) {
      const sup = /w:vertAlign w:val="superscript"/.test(run) && instr.trim();
      stack.at(-1).code += instr;
      stack.at(-1).marked += sup ? `${instr}` : instr;
      continue;
    }
    if (stack.length && !stack.at(-1).res) continue; // 欄位代碼區裡的其他東西
    // 只算指到 media/ 的關聯(與 rerender-metafiles 的 docx_seq 同序;OLE 物件/超連結的 r:id 不算)
    for (const e of run.matchAll(/(?:r:embed|r:id)="(rId\d+)"/g)) if ((relMap?.get(e[1]) ?? "").startsWith("media/")) out.push({ t: "img", rid: e[1], n: picN++ });
    const t = [...run.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => unxml(x[1])).join("");
    if (t) {
      const va = run.match(/w:vertAlign w:val="(superscript|subscript)"/)?.[1];
      out.push({ t: "text", v: t, va });
    }
    if (/<w:sym /.test(run)) out.push({ t: "sym", raw: run.match(/<w:sym [^>]*>/)[0] });
  }
  return out;
}

/** 把 token 陣列轉成 HTML;OMML 需要先用 ommlMap 轉好(xml → html) */
export function toHtml(toks, { imgUrl, ommlMap }) {
  let h = "";
  for (const k of toks) {
    if (k.t === "text") h += k.va === "superscript" ? `<sup>${esc(k.v)}</sup>` : k.va === "subscript" ? `<sub>${esc(k.v)}</sub>` : esc(k.v);
    else if (k.t === "br") h += "<br />";
    else if (k.t === "eq") {
      const code = (k.marked || k.code).replace(/^\s*\\?eq\s*/i, "");
      h += eqToHtml(code).replace(/([^]*)/g, "<sup>$1</sup>");
    } else if (k.t === "omml") {
      const x = ommlMap.get(k.xml);
      if (x == null) throw new Error("OMML 轉不了");
      h += x;
    } else if (k.t === "img") {
      const u = imgUrl(k.n);
      if (!u) throw new Error(`圖 #${k.n} 對不到網站圖`);
      h += `<img src="${u}" alt="式" />`;
    } else if (k.t === "sym") throw new Error("Symbol 字元");
  }
  return h.replace(/(<br \/>\s*)+$/g, "").replace(/^(\s|<br \/>)+/, "").trim();
}

/** 批次把 OMML 轉成 HTML(呼叫 python scripts/lib/omml.py) */
export function convertOmml(xmls) {
  const tmp = path.join(ROOT, "data", "rerender", "omml-batch.json");
  fs.writeFileSync(tmp, JSON.stringify([...new Set(xmls)]));
  const py = `import json,sys;sys.path.insert(0,r'${path.join(ROOT, "scripts", "lib")}')\nfrom omml import omml_to_html,Unsupported\n` +
    `xs=json.load(open(r'${tmp}',encoding='utf-8'));o={}\nfor x in xs:\n  try: o[x]=omml_to_html(x)\n  except Exception: o[x]=None\n` +
    `json.dump(o,open(r'${tmp}.out','w',encoding='utf-8'),ensure_ascii=False)`;
  execFileSync("python", ["-c", py], { stdio: "inherit" });
  return new Map(Object.entries(JSON.parse(fs.readFileSync(tmp + ".out", "utf8"))));
}

export const slugOf = (rel) => crypto.createHash("md5").update(rel).digest("hex").slice(0, 10);
