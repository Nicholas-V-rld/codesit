# Understanding CodeSit — the plain-English guide

This note is for **you** (and anyone you explain the project to). No code — just
what CodeSit is, why each piece exists, and how it all fits. Read this once and
you'll be able to defend the whole platform in a viva.

---

## 1. What is CodeSit, in one line?

**CodeSit is an online examination platform where students write real code in the
browser, run it to see the output, and submit it — while lecturers only ever see
the students in their own department and level.**

The name is a play on words: in Nigerian student slang you "sit" an exam, and the
platform is where you sit a *coding* exam. Tagline: *"Write code. Run it. Sit the
exam."*

---

## 2. The problem it solves

Traditional programming exams are done on paper or on a lecturer's single laptop.
That's slow, hard to mark, and students can't actually run what they write. And in
a polytechnic with many departments and levels (ND1, ND2, HND1, HND2), a lecturer
should only see *their own* students' work — not everyone's.

CodeSit fixes both:
- Students get a real editor + a real "Run" button.
- The system automatically shows each lecturer only the submissions they are
  allowed to see. That rule is the academic heart of the project:
  **department-based (and level-based) access control.**

---

## 3. The two kinds of users

**Students** — pick a language, write code, click Run to test it, then Submit.
They can edit their own name and matric number. Each student belongs to one
department and one level.

**Lecturers** — sign in to a dashboard. They pick which levels they teach when
registering (e.g. "ND1 and ND2"). The dashboard then shows only the students in
their department at those levels, plus every submission those students made. They
can open any submission, read the code, and re-run it to verify it works.

---

## 4. How the whole thing is wired (the big picture)

Think of three layers:

1. **The browser (what the user sees)** — the marketing landing page (React, built
   from `landing/`), plus the product pages: login, register, the student
   workspace, the lecturer dashboard. The product UI is plain HTML/CSS/JavaScript.
   The code editor is **Monaco** (the same editor that powers VS Code), loaded from a
   CDN.

2. **The CodeSit server (the brain)** — a **Node.js + Express** app. It handles
   logins, stores accounts and submissions, and enforces every rule. Crucially,
   *all the security decisions happen here*, not in the browser — so a student
   can't cheat by editing the page.

3. **The code runner (the muscle)** — an external, sandboxed service that actually
   executes the student's code and hands back the output. CodeSit never runs
   untrusted student code on its own server (see section 7).

A typical action — "student clicks Run" — flows like this:
browser → CodeSit server → code runner → back to CodeSit server → back to browser.

---

## 5. Where everything lives (the file map)

```
codesit/
├─ server.js              the entry point — starts everything, wires routes to pages
├─ landing/               Vite + React marketing site; `npm run build` → landing/dist
│                         Express serves that build at /
├─ src/
│  ├─ config.js           all the settings: departments, levels, languages, engine
│  ├─ db.js               opens the SQLite database and creates the tables
│  ├─ seed.js             creates the demo accounts the first time it runs
│  ├─ middleware/auth.js  the guards: "are you logged in?", "are you a lecturer?"
│  ├─ services/executor.js talks to the code runner (Wandbox / Piston)
│  └─ routes/
│     ├─ auth.routes.js         register, login, logout, profile
│     ├─ submission.routes.js   submit + THE ACCESS-CONTROL QUERIES
│     └─ execute.routes.js      the "Run this code" endpoint
├─ views/                 login, register, student, lecturer HTML pages
├─ public/                the CSS and browser JavaScript for the product UI
└─ database/              the SQLite file appears here on first run
```

The guiding idea: `server.js` stays short and readable; each real job lives in its
own small file under `src/`. That's what makes the codebase look professional.

---

## 6. The data model (what we store)

Just **three tables** in a single SQLite file:

- **users** — every account, students and lecturers together, told apart by a
  `role` column. Holds name, username, hashed password, department, and (for
  students) their level or (for lecturers) their staff ID.
- **lecturer_levels** — because one lecturer can teach several levels, each level
  a lecturer teaches is its own row here, linked back to that lecturer. This is
  the table that powers "only my levels."
- **submissions** — one row every time a student submits: who, the language, the
  code itself, the output, and a timestamp.

Passwords are **never stored as plain text** — they're hashed with bcrypt, so even
someone reading the database can't see them.

---

## 7. The one decision you must be able to explain: how code runs

This is the part examiners love to poke at, so know it cold.

Running arbitrary student code is dangerous — you can't just run it on your own
server, or a student could delete your files. The standard safe answer is to send
the code to a **sandboxed execution engine** that runs it in isolation and returns
only the output.

The best-known engine is **Piston**. Here's the catch, and it's the real-world
detail that makes this project current: **the free public Piston API (emkc.org)
stopped being open to the public on 15 February 2026** — it now needs an
authorisation token you can't get for a student project.

So CodeSit is built to be **engine-flexible**, and ships pointing at **Wandbox** by
default:

- **Wandbox** (the default) — a long-running, genuinely free public service that
  needs no key. This is why "Run" works the moment you start the app, with nothing
  to set up.
- **Piston** (optional) — still fully supported. For a real deployment you'd run
  your *own* Piston in Docker (one command) and point CodeSit at it. That's the
  most robust, production-grade setup.

One special case: **HTML**. When a student picks HTML, there's nothing to
"execute" — CodeSit just renders it live in a safe, sandboxed preview frame right
in the browser. It never touches the engine.

The takeaway line for your defence: *"Student code runs on an isolated external
sandbox, never on the CodeSit server. We default to the free Wandbox engine and
also support self-hosted Piston, because the public Piston API stopped being free
in early 2026."*

---

## 8. How access control actually works (the exam-worthy part)

When a lecturer asks for submissions, CodeSit does **not** fetch everything and
filter in the browser. It builds the restriction directly into the database query
on the server:

> "Give me submissions from students **whose department = this lecturer's
> department** AND **whose level is one of the levels this lecturer teaches**."

Because the filter is in the SQL on the server, there is simply no way for a
lecturer to receive a student they're not entitled to — even if they tampered with
the page. If they add a `?level=` filter for a level they *don't* teach, the server
ignores it and falls back to their allowed set. That "can't widen, only narrow"
behaviour is a deliberate security property.

We proved this with tests: a CS ND1/ND2 lecturer sees only the two matching
students; a Computer Engineering lecturer in the same system sees only their own
department; a student hitting the lecturer endpoint is refused outright.

---

## 9. The demo accounts (for showing it off)

The first time CodeSit runs, it seeds these. Password for all: **codesit123**.

Students: `chioma` (CS ND1), `tunde` (CS ND2), `amaka` (CS HND1),
`khalid` (CS HND2), `adeola` (Computer Engineering ND2).

Lecturers:
- `mr_aluko` — CS, teaches ND1 & ND2 → sees Chioma & Tunde
- `mrs_okoro` — CS, teaches HND1 & HND2 → sees Amaka & Khalid
- `engr_musa` — Computer Engineering, ND1 & ND2 → sees only Adeola

The neat demo: log in as `mr_aluko`, note who you see; log in as `mrs_okoro`, and
you see a completely different set — same department, different levels. Then
`engr_musa` shows department isolation. That single walkthrough demonstrates the
whole access-control idea.

---

## 10. What to say this project demonstrates

- A real full-stack web app: front end, server, database, and an external service.
- Authentication and password hashing done properly.
- Role-based access control with a genuine, testable security guarantee.
- A pragmatic engineering decision made in response to a real 2026 change in the
  tooling landscape (Piston going paid → defaulting to Wandbox).
- Clean, modular code organised so each file has one job.

That's CodeSit. If you can retell sections 7 and 8 in your own words, you can defend
the whole thing.
