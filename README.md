# CodeSit

**Write code. Run it. Sit the exam.**

An online coding examination platform. Lecturers set timed exams with
auto-graded questions, scoped to their own department and level; students sit
them in a real browser editor, submit, and get marked immediately. Built with
Node.js and Express, on SQLite locally and PostgreSQL when deployed.

New here? Read **`docs/UNDERSTANDING_CODESIT.md`** first — it explains the whole
platform in plain English.

---

## Quick start

```bash
npm install
npm run build
npm start
```

Then open **http://localhost:3000** — the marketing landing page at `/`, or
sign in with a demo account below. The database and demo accounts are created
automatically on first run.

`npm run build` compiles the Vite React app in `landing/` into `landing/dist/`.
Express serves that build at `/`. The product routes (`/login`, `/register`,
`/student`, `/lecturer`, `/exam`, `/exam-builder`, …) stay as Express HTML pages.

For landing-only development with hot reload:

```bash
cd landing && npm run dev
```

Vite proxies `/login`, `/register`, `/student`, `/lecturer` and `/api` to the
Express server on port 3000, so keep `npm run dev` (root) running too if you
need those routes.

## Tests

```bash
npm test
```

Runs on Node's built-in test runner against a real, throwaway SQLite database
(or PostgreSQL: set `TEST_DATABASE_URL` and each test file uses its own schema)
— no mocking of the access-control logic itself. It proves the same claim the
walkthrough below demonstrates by hand: a CS ND1/ND2 lecturer sees only their
two matching students, a Computer Engineering lecturer sees only their own
department, and a student hitting a lecturer-only route is refused outright —
plus the exam engine's equivalent guarantees (a lecturer can only set an exam
for a level they teach, a student only ever sees exams for their own
department + level, a handed-in paper can't be edited, hidden test cases never
reach the browser, and the countdown is enforced by the server's own clock,
not the client's).

## Demo accounts

Password for all: **`codesit123`**

| Role     | Username     | Scope                                   |
|----------|--------------|-----------------------------------------|
| Student  | `chioma`     | Computer Science · ND1                  |
| Student  | `tunde`      | Computer Science · ND2                  |
| Student  | `amaka`      | Computer Science · HND1                 |
| Student  | `khalid`     | Computer Science · HND2                 |
| Student  | `adeola`     | Computer Engineering · ND2              |
| Lecturer | `mr_aluko`   | CS — teaches ND1 & ND2 → sees Chioma, Tunde |
| Lecturer | `mrs_okoro`  | CS — teaches HND1 & HND2 → sees Amaka, Khalid |
| Lecturer | `engr_musa`  | Comp Eng — ND1 & ND2 → sees only Adeola |

Log in as `mr_aluko`, then as `mrs_okoro`: same department, different levels,
different students. That's the access control at work.

## Setting and sitting an exam

1. Sign in as a lecturer (e.g. `mr_aluko`) → **Set an exam** → give it a title,
   level, duration, and one or more questions. Each question needs at least
   one test case: an input, the expected output, and how many marks it's
   worth. Mark a test case **hidden** to keep it out of the student's view —
   they still see whether it passed, never its input or answer.
2. **Publish** the exam. It now appears for every student in that lecturer's
   department at that level.
3. Sign in as a matching student (e.g. `chioma` for a CS/ND1 exam) → the exam
   appears on the dashboard → **Start**. A countdown begins, timed by the
   server, not the browser.
4. Write an answer, optionally **Run against samples** to sanity-check it
   (practice only — it never affects the mark), then **Hand in paper**. The
   server runs the code itself against every test case, including the hidden
   ones, and marks it on the spot.
5. Back as the lecturer, open **Results** on that exam to see every score, drill
   into any paper (the code, per-test pass/fail, and an override field for
   marking by hand), and export the whole sheet as CSV.

## Running code — the execution engine

Student code never runs inside the CodeSit process itself. It always goes to a
separate runner, and there are four to choose from with `EXECUTOR`:

- **`local` (the default)** — runs the code on this machine as a short-lived
  separate process in a temp directory, killed after 8 seconds, with its output
  capped. Nothing to install, no account, no internet: **Run and automatic
  marking work the moment you `npm start`.** It is *not* a security sandbox —
  it is meant for development and for a lecturer's own lab machine, where the
  code is your own students' work on hardware you control.
- **`sandbox`** (the default on Vercel) — [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox):
  the same runner, executed inside a Firecracker microVM with its network
  switched off, apart from the web server, the database and the app's secrets.
  Each job runs as its own throwaway Linux user with process and file-size
  limits, so students' programs cannot see each other. `npm run sandbox:setup`
  creates the machine, installs the compilers and runs a program in every
  language (it needs `vercel link` and `vercel env pull .env.local` first).
- **`piston`** — a real sandbox for a self-hosted deployment. The public
  endpoint (emkc.org) stopped being freely available on 15 Feb 2026, so
  self-host it:

  ```bash
  docker run -d -p 2000:2000 --name piston ghcr.io/engineer-man/piston
  EXECUTOR=piston PISTON_URL=http://localhost:2000/api/v2/piston npm start
  ```
- **`wandbox`** — a free public sandbox needing no key. Convenient, but it is a
  shared community service and does have outages.

On startup the banner tells you which languages are actually runnable, e.g.
`Execution engine: local — ready for: python, javascript, c, cpp`. If a
compiler is missing, that language says so clearly instead of failing oddly.

HTML is special: it's rendered in a sandboxed preview frame in the browser and
never sent to any runner (and isn't offered as an exam language — there is no
output to mark).

## Deploying to Vercel

The app deploys to Vercel as a single Express function (`src/app.js`), with
`public/` served from the CDN.

1. `vercel link`, then add a PostgreSQL database from the Marketplace
   (`vercel integration add neon`), which sets `DATABASE_URL`. The tables and
   demo accounts are created on the first request.
2. Set a long random `SESSION_SECRET` for production and preview
   (`vercel env add SESSION_SECRET production`).
3. `npm run sandbox:setup` once, so the first student is not the one waiting
   for the compilers to install.
4. `vercel deploy`, check the preview, then `vercel deploy --prod`.

Before real students use a public deployment, delete or re-password the demo
accounts — their password is published above — and remember that anyone can
register as a lecturer for any department.

## Configuration

Environment variables (all optional — sensible defaults built in). Copy
`.env.example` to `.env` to set any of these; it's loaded automatically.

| Variable        | Default                          | Purpose                          |
|-----------------|-----------------------------------|-----------------------------------|
| `PORT`          | `3000`                           | Server port                      |
| `SESSION_SECRET`| dev secret                       | Session signing key (**set this in prod**) |
| `NODE_ENV`      | *(unset)*                        | Set to `production` to mark session cookies HTTPS-only |
| `DATABASE_URL`  | *(unset → SQLite)*               | PostgreSQL connection string; required on Vercel |
| `DB_PATH`       | `database/codesit.db`            | SQLite file, when `DATABASE_URL` is unset |
| `EXECUTOR`      | `local` (`sandbox` on Vercel)    | `local`, `sandbox`, `piston` or `wandbox` |
| `SANDBOX_NAME`  | `codesit-runner`                 | Name of the Vercel Sandbox machine |
| `PISTON_URL`    | `https://emkc.org/api/v2/piston` | Piston endpoint (self-host this) |
| `PISTON_TOKEN`  | *(empty)*                        | Only for authorised Piston hosts |
| `RUN_TIMEOUT_MS`| `8000`                           | Wall-clock limit for one run     |
| `OUTPUT_CAP_BYTES` | `65536`                       | Max output kept per stream       |

## Languages

Python, JavaScript (Node), Java, C++, C, and HTML (live preview only — not
offered as an exam question language, since there's no output to auto-grade).

## Project structure

```
codesit/
├─ server.js                  loads config and starts listening (locally)
├─ vercel.json, .vercelignore  Vercel build settings
├─ scripts/setup-sandbox.js   prepares and checks the Vercel Sandbox runner
├─ landing/                   Vite + React marketing site (built → landing/dist)
├─ src/
│  ├─ app.js                  builds the Express app (routes, middleware, pages)
│  ├─ config.js                departments, levels, languages, engine settings
│  ├─ db.js                    SQLite / PostgreSQL + schema (users, exams, attempts…)
│  ├─ session-store.js         login sessions kept in the database
│  ├─ seed.js                  demo accounts
│  ├─ lib/router.js            Express router for async handlers
│  ├─ middleware/auth.js       login & role guards
│  ├─ services/
│  │  ├─ executor.js           picks the code runner (local / sandbox / Piston / Wandbox)
│  │  ├─ runner-core.js        compiles and runs a program (local and in the sandbox)
│  │  ├─ vercel-sandbox.js     the Vercel Sandbox runner machine
│  │  └─ grader.js             runs a student's code against a marking scheme
│  └─ routes/
│     ├─ auth.routes.js        register, login, logout, profile
│     ├─ submission.routes.js  freeform submit + THE ACCESS-CONTROL QUERIES
│     ├─ execute.routes.js     the "Run this code" endpoint
│     └─ exam.routes.js        setting, sitting, and marking exams
├─ views/                      login, register, student & lecturer dashboards,
│                              exam builder, sitting an exam, results, a marked paper
├─ public/                     css + browser js
├─ test/                       node:test suite proving the access-control claims
└─ docs/UNDERSTANDING_CODESIT.md   plain-English guide to the whole system
```

## Tech

Node.js · Express · SQLite (better-sqlite3) / PostgreSQL (pg, Neon) ·
express-session (database-backed) · helmet · express-rate-limit · bcryptjs ·
Monaco editor · local / Vercel Sandbox / Piston / Wandbox execution ·
Vite + React (landing) · Vercel.
