# Architecture & Project Setup

## Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | **Next.js (App Router) + TypeScript** | One repo for UI + API routes, zero-config Vercel deploy |
| Styling | **Tailwind CSS** | Fast, clean dashboards & quiz UI |
| Auth + DB | **Supabase** (free tier) | Built-in email/OAuth auth + Postgres + Row Level Security, integrates with Vercel |
| Charts | **Recharts** | Radar (mastery), line (progress) |
| Hosting | **Vercel** (push-to-deploy from GitHub) | Free, automatic |

Question bank lives as **JSON in the repo** (`data/questions/*.json`), imported into Supabase by a script.
The DB stores only *learner* data (attempts, mastery, etc.). This keeps the bank version-controlled and the
DB small.

## Project layout

```
project/
├─ web/                      ← Next.js app
│  ├─ src/app/               ← pages (login, dashboard, challenge, practice, mock-exam,
│  │                            wrong-book, history, contest, contest/new)
│  ├─ src/components/        ← Nav, Quiz (the shared answering component)
│  ├─ src/lib/
│  │  ├─ supabase/{client,server}.ts
│  │  ├─ engine.ts           ← question-selection + scoring (the brain)
│  │  ├─ types.ts            ← subjects, levels, Question type
│  │  └─ html.ts             ← strip/keep controlled HTML for question rendering
│  ├─ src/proxy.ts           ← auth gate (NOT middleware.ts — see gotcha)
│  └─ .env.local             ← Supabase keys (gitignored)
├─ data/questions/*.json     ← the question bank (version controlled)
└─ scripts/                  ← import + question-bank conversion scripts
```

## Framework gotchas (these will bite you)

1. **Next.js 16 renamed `middleware.ts` → `src/proxy.ts`.** The auth-gate file exports a `proxy` function
   (not `middleware`) plus a `config.matcher`. If you scaffold on an older mental model you'll get a route
   that silently never runs. Always read `node_modules/next/dist/docs/` for the installed version before
   writing framework-level files — Next changes conventions between majors.

2. **Do not use `supabase-js` from Node scripts on Node < 22.** It pulls in `realtime-js`, which throws
   "Node.js detected without native WebSocket support" and crashes. For any server-side script (importing the
   bank, creating test users, batch updates), call the Supabase **REST API directly with `fetch`**:
   - Query/insert: `POST/GET {SUPABASE_URL}/rest/v1/<table>` with headers `apikey`, `Authorization: Bearer <service_key>`.
   - Upsert: add header `Prefer: resolution=merge-duplicates`.
   - Admin create user: `POST {SUPABASE_URL}/auth/v1/admin/users` with `{email,password,email_confirm:true}`.
   In the **browser** (the Next.js app), `supabase-js` is fine — browsers have native WebSocket.

3. **Windows / PowerShell:** save any `.ps1` you generate as **UTF-8 with BOM**, or Chinese (and other
   non-ASCII) text turns to mojibake and the script fails to parse. Also: the agent harness pushes
   long-running commands to the background, and **GUI automation (MS Word COM) has no desktop in the
   background and hangs forever** — see `question-bank-import.md`.

4. **Render question HTML safely-ish.** Imported questions may contain controlled inline HTML (`<img>` for
   formulas/figures, `<sup>/<sub>`). Render with `dangerouslySetInnerHTML` and a CSS rule to size inline
   images. The content is yours (from your own conversion pipeline), not user input, so this is acceptable;
   never do this with learner-submitted content.

## Supabase client files

- `client.ts`: `createBrowserClient(URL, ANON_KEY)` from `@supabase/ssr`.
- `server.ts`: `createServerClient` with cookie adapter (Next `cookies()`), used in Server Components.
- `proxy.ts`: same `createServerClient` wired to the request/response cookies; calls `supabase.auth.getUser()`
  and redirects unauthenticated users to `/login` (and authenticated users away from `/login`).

`.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...     # server/scripts only, never shipped to client
```

## Deploy

1. Local: `npm run dev`, connect a free Supabase project.
2. Push to a **private** GitHub repo (banks are often copyrighted; gate all content behind login).
3. Vercel → Import repo → set the three env vars → deploy. Every push auto-deploys.
4. Check on a real phone — that's where students actually are.
