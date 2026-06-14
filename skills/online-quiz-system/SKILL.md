---
name: online-quiz-system
description: >-
  Build a full online quiz / exam-practice / test-bank web app from scratch — student accounts,
  an adaptive "tiered challenge" question engine that stops re-asking mastered material, a wrong-answer
  notebook with spaced repetition, learning-history dashboards, mock exams, and a teacher-run contest
  leaderboard. Use this skill whenever the user wants to build any kind of online testing, quiz,
  flashcard-drill, exam-prep, question-bank, or self-study practice platform — even if they only say
  "我想做一個線上測驗/考試/刷題系統", "練習系統", "題庫網站", "exam prep app", "adaptive learning app",
  or describe the features (分階挑戰, 錯題本, 模擬考, 排行榜) without naming it. Also use it when importing
  a question bank from Word/PDF/Excel files, especially when math formulas or figures are involved
  (the LibreOffice pitfalls here are hard-won). Deploys to Vercel + Supabase.
---

# Online Quiz / Exam-Practice System Builder

This skill packages a proven recipe for building an adaptive online practice system, distilled from a
real project (a Taiwanese 國中會考 prep app). It saves you from re-deriving the architecture, the
adaptive-question algorithm, and — most importantly — the question-bank import pitfalls that eat days.

## When to use this

Reach for this skill the moment a user wants learners to **practice questions and track progress** online:
exam prep, quiz drills, flashcards, certification practice, a school test bank, language drills, etc.
The hard parts it solves are the same every time: *not boring the learner with questions they've mastered*,
*recording a real learning history*, and *getting a messy question bank out of Word/PDF into clean data*.

## The build, in phases

Work through these in order. Each phase has a reference file with the details — read the reference when
you start that phase, not all upfront.

### Phase 0 — Shape the system
Pin down: subjects/topics taxonomy, question types (single-choice / multi / cloze / non-choice),
single-user vs multi-user (almost always multi → you need accounts), and where the question bank comes from.
Difficulty must be a **per-question 1–5 scale** and every question needs a **topic tag** — the adaptive
engine and weakness analysis are useless without them. If the source data lacks these, plan to derive them.

### Phase 1 — Architecture & project setup
Read `references/architecture.md`. Stand up **Next.js (App Router, TypeScript) + Tailwind + Supabase**,
deployable to **Vercel**. Supabase gives you auth + Postgres in one. Critical gotchas live in that file
(Next 16 renamed `middleware.ts` → `proxy.ts`; Node-side scripts must use Supabase **REST**, not
`supabase-js`, because older Node has no native WebSocket; on Windows save PowerShell scripts as UTF-8 BOM).

### Phase 2 — Database & auth
Read `references/database-schema.md` and apply `assets/schema.sql` as your first migration. It defines
`profiles, questions, attempts, mastery, wrong_book, exam_sessions, daily_stats, contests, contest_entries`,
the auto-create-profile trigger, Row Level Security, and the leaderboard/topic RPCs. RLS is non-negotiable
for multi-user — every learner must only see their own rows.

### Phase 3 — The question bank (usually the hardest part)
Read `references/question-bank-import.md` **before touching any Word/PDF files** — it will save you a day.
The headline lesson: **do not automate Microsoft Word for batch conversion** (its COM/HTML export hangs
in any non-interactive/background context, and math formulas are special objects that plain-text extraction
silently drops). Use **LibreOffice headless** (`soffice --headless --convert-to html`) instead — it runs
reliably in the background and renders formulas/figures to images. Expect ~20–30% of formula-heavy questions
to still lose inline notation; detect and exclude those automatically so the bank stays *correct, if smaller*.

### Phase 4 — The adaptive "tiered challenge" engine (the heart)
Read `references/adaptive-engine.md`. This is what makes the app not-boring: per-(user × subject × topic)
**mastery levels**, an item-selection algorithm that **excludes recently-mastered questions**, prioritizes
weak topics and due wrong-answers, and adjusts difficulty within a round based on streaks. Includes the
spaced-repetition schedule for the wrong-answer notebook (1→3→7→14 days, graduate after 3 correct).

### Phase 5 — Surfaces students actually use
Build the pages: dashboard (exam countdown, daily goal, streak, per-subject levels), tiered challenge,
free practice (pick subject/topic/difficulty/count), mock exam (N questions per subject → grade), wrong-answer
notebook, learning history (radar chart of mastery, daily progress curve, weakness ranking, per-attempt log),
and a teacher/parent-run **contest with a leaderboard** for peer competition. Render question HTML with
`dangerouslySetInnerHTML` so imported formula/figure images show inline.

### Phase 6 — Motivation / gamification (optional but high-impact)
Read `references/gamification.md`. Plain "answer questions, see score" gets boring fast. Layer a Duolingo-style
loop on top of the data you already collect: XP + player level, daily quests, coins + a cosmetic shop,
achievement badges, then social features (friends, 1v1 quiz duels, weekly XP leaderboard, seasons). Tie rewards
to *quality* learning (hard questions, wrong-answer review, weak topics) so kids don't just farm easy questions.

### Phase 7 — Ship
Local-test first, then push to a **private** GitHub repo (question banks are often copyrighted), import to
Vercel, set the Supabase env vars, and verify on mobile (students mostly use phones).

## Guiding principles

- **Reward learning the right thing.** Every incentive — levels, XP, "don't repeat mastered questions" — should
  push the learner toward their weak edge, never toward farming easy wins.
- **Correct beats complete.** A smaller bank of clean questions beats a big bank with broken ones. Auto-detect
  and hide degraded imports rather than showing a learner a garbled question.
- **Phones first.** Most practice happens on a phone in spare minutes. Design for a narrow viewport.
- **Verify, don't assume.** Actually run the app, log in as a test user, answer questions, and confirm rows land
  in the database before declaring a feature done.

## Reference map

| File | Read when |
|------|-----------|
| `references/architecture.md` | Phase 1 — stack, project layout, env, framework gotchas |
| `references/database-schema.md` | Phase 2 — table-by-table design, RLS, RPCs |
| `assets/schema.sql` | Phase 2 — runnable first migration |
| `references/question-bank-import.md` | Phase 3 — Word/PDF → clean JSON, the LibreOffice recipe |
| `references/adaptive-engine.md` | Phase 4 — mastery, selection algorithm, spaced repetition |
| `references/gamification.md` | Phase 6 — engagement design, phased rollout |
