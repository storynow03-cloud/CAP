# Importing a Question Bank from Word / PDF (read before you start)

This is where projects lose days. The summary up front:

> **Plain-text extraction silently drops math formulas and figures. Microsoft Word automation hangs in the
> background. Use LibreOffice headless. Expect ~20–30% of formula-heavy questions to still be degraded —
> detect and exclude those automatically.**

## Step 0 — Inspect the source

Open a few files and find the structure. Publisher test banks usually have per-question markers you can parse,
e.g.: `題號:<id>  難易度:<易/中/難>  學習內容:<curriculum code>` then `（ ）<stem> (A).. (B).. (C).. (D)..`
then `《答案》<X>  詳解:<explanation>`. If markers exist, you can auto-extract `id, difficulty, answer,
explanation, curriculum code` — and derive `topic` from the folder/filename. If not, plan a heavier parse.

## Two-track strategy

Most banks have two kinds of questions:
- **Text questions** (word problems, concepts): plain-text extraction works perfectly and is fast.
- **Formula/figure questions** (geometry, algebra with roots/exponents): need image rendering.

Do the fast text pass for everything first to get a working bank, then upgrade the formula/figure ones.

## Track A — fast text extraction (gets you a working bank in minutes)

On Windows you can drive Word COM **for a quick one-shot text dump** (it's the GUI-hang in *background batch*
that's the problem; short foreground calls work). Open each `.doc` read-only, read `Document.Content.Text`,
write UTF-8 `.txt`. Then parse with a script:
- Split on the per-question marker (`題號:` etc.).
- Pull difficulty (map 易/中/難 → 1–5; bump for real past-exam papers), answer letter → index, options, explanation.
- Mark a question `needs_review = true` if: stem too short, option empty, no answer, or it references a figure
  ("如圖/下表") — so figure questions don't ship as broken text.
- Watch for **full-width option letters** `（Ａ）` vs half-width `(A)` — normalize both. Some subjects use one,
  some the other.

This yields a large, immediately-usable bank for the text questions.

## Track B — formula/figure questions via LibreOffice headless (the right way)

### Why NOT Microsoft Word for batch conversion
- Word COM `SaveAs(FilteredHTML)` **hangs indefinitely** when the process has no interactive desktop — which is
  exactly the case for background/detached/agent-spawned processes. You'll see one Word process at ~steady CPU
  and zero output, forever. Killing and retrying just hangs on the next file.
- Word stores math as **EQ field / OLE objects**. Plain-text export drops them entirely (so `3.99²` becomes
  `3.992`, segment overlines vanish: `若AB=10` → `若=10`).

### The LibreOffice recipe
1. Install once: `winget install TheDocumentFoundation.LibreOffice` (or equivalent).
2. Convert: `soffice --headless --convert-to html --outdir <out> <file1> <file2> ...`
   - Runs reliably **in the background** (true headless, no desktop needed) — this is the key win over Word.
   - Renders each formula and figure to a small `.gif/.png/.jpg` next to the HTML, referenced by `<img>`.
   - **Batch multiple files per invocation** to amortize startup (~35s/file batched vs ~100s alone).
   - Process one source sub-folder per invocation so output filenames don't collide and you keep folder→topic
     mapping.
3. **Don't kill `soffice` while a batch runs** — you'll abort the whole conversion. (Easy mistake if you also
   run timing tests.) Make the converter resumable (skip files whose `.html` already exists) so an interruption
   isn't fatal.
4. It's slow: ~35s/file. A few thousand files = several hours. That's fine — it's unattended and reliable.
   Convert the highest-value files first (real past-exam papers), import those, then let the rest run.

### Parsing LibreOffice HTML
- The per-question markers (`題號:`, `《答案》`, `(A)(B)(C)(D)`, `詳解:`) survive — split on them as in Track A.
- Replace `<img src=...>` with placeholders during parsing, copy the referenced image into the web app's
  `public/` under a per-file hashed folder, then restore as `<img src="/qimg/...">` pointing at the copy.
- Keep `<sup>/<sub>`; strip other tags.

### Auto-detect degraded questions (critical for "correct over complete")
Even LibreOffice drops some inline notation (segment overlines, some exponents). Flag a question as degraded —
`needs_review = true`, so it's hidden — when you see the tell-tales of dropped content:
- An operator/relation with a missing left operand: `[，。：若則為]` immediately followed by `＝ ＜ ＞ ／／`.
- A position word with a missing noun: `在、` / `、上` / punctuation adjacent to `、` / `（、`.
- **Duplicate non-empty options** (lost notation made two options identical).
- Leftover parser fragments (`[[` `]]`).
Questions whose **options are themselves images** (pick-the-figure) are *valid* — don't flag those just because
their plain text is empty.

This typically cuts the bad rate from ~27% to ~2%. The remaining loss is inherent to the source format; accept
it and keep the bank correct.

## Importing into Supabase
- Use REST upsert (`Prefer: resolution=merge-duplicates`), batches of ~500.
- When **re-importing** an upgraded subject, first `PATCH` all that subject's rows to `needs_review = true`
  (hide everything), then upsert the clean set (which sets `needs_review=false` for good ones). This way
  excluded/degraded questions stay hidden without deleting rows (deletes would break `attempts` foreign keys).

## Merging text + image versions
Keep the text bank as the base; for each source file that got an image upgrade, replace that file's questions
with the image version (match by `source`). Files that failed conversion keep their text version. Nothing is lost.
