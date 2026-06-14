# The Adaptive "Tiered Challenge" Engine

This is what makes the app worth using instead of a stack of worksheets: it stops re-asking what the learner
already knows and keeps them at their productive edge. All of it runs off the `attempts` and `mastery` tables.

## Mastery model

Track mastery **per (user × subject × topic)**, not per subject — otherwise a weak topic hides behind strong
ones and never gets attention. Each cell has:
- `level` 1–5 (入門/基礎/進階/精熟/挑戰), each mapping to a difficulty range:
  `1→[1,2], 2→[1,3], 3→[2,3], 4→[3,4], 5→[4,5]`.
- `score` 0–100 (weighted accuracy, for the radar chart and weakness ranking).
- `recent` = rolling window of the last ~10 outcomes (1/0), used for promotion/demotion.

**Promotion / demotion** (on each answer, after updating `recent`):
- last-10 accuracy ≥ 0.8 and level < 5 → **level up** (show a celebratory toast), reset the window.
- last-10 accuracy < 0.4 and level > 1 → **level down** one (to rebuild confidence), reset the window.

`score = round( (0.7 * overall_accuracy + 0.3 * recent_accuracy) * 100 )`.

## Item selection — a 10-question round

Build each round in priority order; this is the core of "don't repeat what they know":

1. **Due wrong-answers (≤3):** from `wrong_book` where `status='active'` and `due_at ≤ now`, this subject.
2. **Weak topics (~4):** questions in the lowest-`score` topics, at the current level's difficulty range.
3. **Advancing questions (the rest):** current-level difficulty, **excluding questions the learner answered
   correctly ≥2 times in the last 30 days** — this is the mechanism that stops boring repetition.

Compute the overall level for the subject as the rounded mean of its topic levels (default 1 if new). Shuffle
the final set. If the pool runs dry, relax filters and tell the user the bank is thin for that topic.

## Within-round adaptivity

- **3 correct in a row →** swap the *next* question for one a difficulty step harder (probe upward; speeds
  promotion). Reset the streak counter.
- **2 wrong in a row →** step the next question down (steady their confidence).

Keep this lightweight — replace one upcoming item, don't rebuild the round.

## Recording an answer (one transaction's worth of work)

On every answer, write:
1. `attempts` row (user, question, selected, is_correct, time_spent_ms, mode).
2. `daily_stats` upsert (today's total/correct/minutes) — powers streak + progress curve.
3. `mastery` upsert (update `recent`, recompute level/score/counts).
4. `wrong_book`:
   - wrong → upsert active, `due_at = now + 1 day`, `interval_days=1`, `streak=0`.
   - correct **in review mode** → `streak+1`; graduate to `status='overcome'` at streak 3; else
     `interval_days = min(interval*2+1, 14)`, `due_at = now + interval days`.

## Spaced repetition (wrong-answer notebook)

```
miss → due in 1 day
review-correct → next interval ×2 (1 → 3 → 7 → 14 days)
3 correct in a row → graduate (leave the notebook)
review-wrong → reset interval to 1 day
```
On the dashboard surface "N due today" and make review outrank new questions — fixing mistakes is the
highest-leverage practice.

## Mock exam

Pick N (e.g. 5) questions per subject at each subject's current level → one combined paper. Grade per subject
by accuracy band (e.g. A++ ≥0.95, A+ ≥0.85, A ≥0.75, B++ ≥0.6 …). Persist to `exam_sessions`. Label it a
*practice estimate*, not an official grade.

## Why tie everything to mastery
Difficulty alone isn't enough — a learner can be strong in algebra and weak in geometry within the same
subject. Per-topic mastery lets the engine spend the learner's time where it actually moves the needle, which
is the whole point.
