# Database Schema & RLS

Apply `assets/schema.sql` as the first migration. This file explains each table and the rules that matter.

## Tables

| Table | Holds | Notes |
|-------|-------|-------|
| `profiles` | nickname, role(student/parent/teacher), grade, exam_date, daily_goal | 1:1 with `auth.users`; auto-created by trigger on signup |
| `questions` | the bank | `subject, topic, difficulty(1–5), type, question(html), options(jsonb), answer(int idx), answer_text, explanation, source, needs_review` |
| `attempts` | every answer | `user_id, question_id, selected, is_correct, time_spent_ms, mode(practice/challenge/exam/review)` |
| `mastery` | per user×subject×topic | `level, score, recent(jsonb), attempts_count, correct_count` |
| `wrong_book` | spaced-repetition queue | `due_at, interval_days, streak, status(active/overcome)` |
| `exam_sessions` | mock-exam results | `subject, total, correct, grade` |
| `daily_stats` | per user per day | `total, correct, minutes` → streak + progress curve |
| `contests` | teacher-built papers | `created_by, subject, question_ids(text[]), starts_at, ends_at` |
| `contest_entries` | one row per learner per contest | `score, total, time_spent_ms` |

## Indexes that matter
- `attempts (user_id, created_at desc)` and `attempts (user_id, question_id)` — the engine queries recent
  correct answers per user constantly.
- `wrong_book (user_id, due_at) where status='active'` — "due today" lookups.
- `questions (subject, topic, difficulty) where not needs_review` — item selection.

## Auto-create profile
A `security definer` trigger on `auth.users` inserts a `profiles` row on signup (nickname from metadata or the
email local-part). Without it, every new user hits a missing-profile null.

## Row Level Security — non-negotiable for multi-user
Enable RLS on every table. Policies:
- `profiles`: a user can read/write only their own row (`auth.uid() = id`).
- `questions`: any authenticated user can `select` (no per-user writes from the client).
- `attempts / mastery / wrong_book / exam_sessions / daily_stats`: full access only to own rows
  (`auth.uid() = user_id`).
- `contests`: any authenticated user can read; **insert only if the caller's profile role is teacher/parent**;
  delete only by the creator.
- `contest_entries`: own rows only.

Test the deny path, not just the happy path — e.g. confirm a *student* token gets HTTP 403 trying to create a
contest. (A quick REST script with two logged-in tokens does this well.)

## RPCs (security definer, granted to authenticated)
- `get_topics(subj)` → distinct topics with counts for a subject. Needed because a normal client `select` is
  capped at 1000 rows and a big bank would truncate the topic list.
- `get_contest_leaderboard(cid)` → joins `contest_entries` to `profiles` to expose **other** users' nicknames +
  scores (ordered by score desc, time asc) without opening up the whole profiles table. Mark each row `is_me`.

## Re-import safety
To replace a subject's questions without breaking `attempts` foreign keys: never delete — instead `PATCH` the
subject to `needs_review=true` (hide all), then upsert the clean set (un-hides the good ones). Excluded/degraded
questions simply stay hidden.
