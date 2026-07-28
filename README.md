# CodeSit

**Write code. Run it. Sit the exam.**

An online coding examination platform. Students write, run and submit code in a
real browser editor; lecturers see only the students in their own department and
level. Built with Node.js, Express and SQLite.

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
`/student`, `/lecturer`) stay as Express HTML pages.

For landing-only development with hot reload:

```bash
cd landing && npm run dev
```

Vite proxies `/login`, `/register`, `/student`, `/lecturer` and `/api` to the
Express server on port 3000, so keep `npm run dev` (root) running too if you
need those routes.

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

## Running code — the execution engine

Student code runs on an external, sandboxed engine, never on the CodeSit server.

- **Default: Wandbox** — a free public service, no API key. Run works out of the box.
- **Optional: Piston** — the public Piston API (emkc.org) stopped being free on
  15 Feb 2026, so for production run your own Piston in Docker:

  ```bash
  docker run -d -p 2000:2000 --name piston ghcr.io/engineer-man/piston
  # then start CodeSit pointed at it:
  EXECUTOR=piston PISTON_URL=http://localhost:2000/api/v2/piston npm start
  ```

HTML is special: it's rendered in a sandboxed preview frame in the browser and
never sent to any engine.

## Configuration

Environment variables (all optional — sensible defaults built in):

| Variable        | Default                          | Purpose                          |
|-----------------|----------------------------------|----------------------------------|
| `PORT`          | `3000`                           | Server port                      |
| `SESSION_SECRET`| dev secret                       | Session signing key (set in prod)|
| `EXECUTOR`      | `wandbox`                        | `wandbox` or `piston`            |
| `PISTON_URL`    | `https://emkc.org/api/v2/piston` | Piston endpoint (self-host this) |
| `PISTON_TOKEN`  | *(empty)*                        | Only for authorised Piston hosts |

## Languages

Python, JavaScript (Node), Java, C++, C, and HTML (live preview).

## Project structure

```
codesit/
├─ server.js                  app entry point
├─ landing/                   Vite + React marketing site (built → landing/dist)
├─ src/
│  ├─ config.js               departments, levels, languages, engine settings
│  ├─ db.js                   SQLite connection + schema
│  ├─ seed.js                 demo accounts
│  ├─ middleware/auth.js      login & role guards
│  ├─ services/executor.js    Wandbox / Piston execution
│  └─ routes/                 auth, submissions (+access control), execute
├─ views/                     login, register, student, lecturer pages
├─ public/                    css + browser js
└─ docs/UNDERSTANDING_CODESIT.md   plain-English guide to the whole system
```

## Tech

Node.js · Express · SQLite (better-sqlite3) · express-session · bcryptjs ·
Monaco editor · Wandbox/Piston execution · Vite + React (landing).
