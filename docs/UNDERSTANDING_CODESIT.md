# Understanding CodeSit — the plain-English guide

This note is for **you** (and anyone you explain the project to). No code — just
what CodeSit is, why each piece exists, and how it all fits. Read this once and
you'll be able to defend the whole platform in a viva.

---

## 1. What is CodeSit, in one line?

**CodeSit is an online examination platform: a lecturer sets a timed, auto-graded
coding exam for their own department and level, and their students sit it in a
real browser editor — write, run against samples, hand in, get marked instantly.**

The name is a play on words: in Nigerian student slang you "sit" an exam, and the
platform is where you sit a *coding* exam. Tagline: *"Write code. Run it. Sit the
exam."*

---

## 2. The problem it solves

Traditional programming exams are done on paper or on a lecturer's single laptop.
That's slow, hard to mark, and students can't actually run what they write. And in
a polytechnic with many departments and levels (ND1, ND2, HND1, HND2), a lecturer
should only see *their own* students' work — not everyone's, and should only be
able to set exams for levels they actually teach.

CodeSit fixes all of this:
- Lecturers set real exams — timed, with questions and an automatic marking
  scheme — instead of a paper script.
- Students get a real editor, a real countdown, and an instant, defensible mark.
- The system automatically shows each lecturer only the exams, students and
  submissions they are allowed to see. That rule is the academic heart of the
  project: **department-based (and level-based) access control**, applied
  consistently everywhere, including to the exam engine itself.

---

## 3. The three kinds of users

**Students** — see the exams set for their own department and level on their
dashboard. Opening one starts a server-timed countdown; they write an answer per
question (optionally running it against the visible sample cases first, which
never affects the mark), then hand the paper in. Marking happens immediately and
automatically. They can also use a separate practice workspace to write and run
any code outside of an exam, and can edit their own name and matric number.

**Lecturers** — sign in to a dashboard. They pick which levels they teach when
registering (e.g. "ND1 and ND2"). From there they can **set an exam**: a title, a
level they teach, a duration, and one or more questions, each with a marking
scheme of test cases (an input, the expected output, marks, and whether it's
hidden from students). Publishing an exam makes it visible to every student in
the lecturer's department at that level. The results screen shows every score,
lets the lecturer open any paper to see the code and the per-test breakdown, and
export the whole class's results as a CSV. A lecturer who registers themselves
cannot sign in until an administrator approves the account — otherwise anyone
could claim to teach any department and read its students' work.

**Administrators** — sign in to `/admin`. They approve (or reject) new
lecturers, create, edit, suspend or delete accounts, reset passwords, see
system-wide numbers per department, and can take any exam offline. An account
with exam records cannot be deleted, only suspended, so no results are ever
lost by accident; and an administrator cannot suspend or delete themselves.

---

## 4. How the whole thing is wired (the big picture)

Think of three layers:

1. **The browser (what the user sees)** — the marketing landing page (React, built
   from `landing/`), plus the product pages: login, register, the two dashboards,
   the exam builder, sitting an exam, a marked result, and the lecturer's results
   view. The product UI is plain HTML/CSS/JavaScript. The code editor is
   **Monaco** (the same editor that powers VS Code), loaded from a CDN.

2. **The CodeSit server (the brain)** — a **Node.js + Express** app. It handles
   logins, stores accounts, exams and attempts, runs the marking, and enforces
   every rule. Crucially, *all the security and marking decisions happen here*,
   not in the browser — so a student can't cheat by editing the page, and can't
   forge a score by editing a network request.

3. **The code runner (the muscle)** — a separate, swappable engine that actually
   executes the student's code and hands back only the output. It is never run
   inside the web server's own process, and it is always time-limited. Which
   engine you use is a configuration choice with a real trade-off (see
   section 7).

A typical action — "student hands in an exam" — flows like this:
browser → CodeSit server (looks up every test case for every question) → code
runner (once per test case) → CodeSit server (compares output, computes the
score) → stored in the database → back to the browser as a marked result.

---

## 5. Where everything lives (the file map)

```
codesit/
├─ server.js              loads config, builds the app (src/app.js), starts listening
├─ landing/               Vite + React marketing site; `npm run build` → landing/dist
│                         Express serves that build at /
├─ src/
│  ├─ app.js              builds the whole Express app — middleware, routes, pages
│  ├─ config.js           all the settings: departments, levels, languages, engine
│  ├─ db.js               opens SQLite, creates the tables (users … through answers)
│  ├─ seed.js             creates the demo accounts the first time it runs
│  ├─ middleware/auth.js  the guards: "are you logged in?", "are you a lecturer?"
│  ├─ services/
│  │  ├─ executor.js      runs code: local process, or Piston / Wandbox
│  │  └─ grader.js        runs an answer against its test cases, computes a score
│  └─ routes/
│     ├─ auth.routes.js         register, login, logout, profile
│     ├─ submission.routes.js   freeform submit + THE ORIGINAL ACCESS-CONTROL QUERIES
│     ├─ execute.routes.js      the "Run this code" endpoint
│     └─ exam.routes.js         setting, sitting, and marking exams
├─ views/                 login, register, both dashboards, exam builder,
│                         sitting an exam, a marked result, lecturer's results
├─ public/                the CSS and browser JavaScript for the product UI
├─ test/                  a real test suite proving the access-control claims below
└─ database/              the SQLite file appears here on first run
```

The guiding idea: `server.js` and `src/app.js` stay short and readable; each real
job lives in its own small file under `src/`. That's what makes the codebase look
professional.

---

## 6. The data model (what we store)

**Seven tables** in a single SQLite file, in two groups.

The original three:
- **users** — every account, students and lecturers together, told apart by a
  `role` column. Holds name, username, hashed password, department, and (for
  students) their level or (for lecturers) their staff ID.
- **lecturer_levels** — because one lecturer can teach several levels, each level
  a lecturer teaches is its own row here, linked back to that lecturer. This is
  the table that powers "only my levels" everywhere in the app, exams included.
- **submissions** — the freeform practice-workspace history: one row every time a
  student runs-and-saves or submits outside of an exam.

The exam engine adds four more:
- **exams** — one row per exam a lecturer sets: title, instructions, duration,
  and (crucially) the department and level it's scoped to.
- **questions** — one row per question in an exam: the prompt, the language, and
  optional starter code.
- **test_cases** — the marking scheme: for each question, an input, the expected
  output, how many marks it's worth, and whether it's hidden from students.
- **attempts** and **answers** — one `attempts` row per student per exam (when it
  started, when it was handed in, the total score); one `answers` row per
  question inside that attempt (the code, the score, and a JSON report of which
  test cases passed).

Passwords are **never stored as plain text** — they're hashed with bcrypt, so even
someone reading the database can't see them.

---

## 7. The one decision you must be able to explain: how code runs

This is the part examiners love to poke at, so know it cold.

Running arbitrary student code is dangerous — you can't just run it *inside your
web server*, because a bad program could then read your database, your files, or
your secrets. So CodeSit always hands the code to a **separate runner** and only
takes back the output. That is true for every path: a practice "Run", a freeform
submission, and each answer being auto-marked in an exam — all go through the one
`runCode()` function in `src/services/executor.js`.

There are three runners, and **being able to explain the trade-off between them is
the point**:

- **`local` — the default.** The code is written to a throwaway temp directory and
  run as its own short-lived process, killed after 8 seconds, with its output
  capped at 64KB and no shell involved. Nothing to install, no account, no
  internet — so "Run" and automatic marking work the moment the app starts.
  Be honest about its limit: **it is isolation, not a security sandbox.** The
  program runs as your user, so it could touch your own files. That is an
  acceptable trade for development and for a lecturer's own lab machine, where
  the code being run is your own students' work on hardware you control.
- **`sandbox` — what the Vercel deployment uses.** The same runner, executed
  inside a Vercel Sandbox microVM with no network access, separate from the
  web server and the database. Every job runs as its own throwaway Linux user,
  so two students' programs cannot read each other's files.
- **`piston` — the self-hosted answer.** A real, container-based sandbox, for
  running CodeSit on your own server. The
  well-known public endpoint (emkc.org) **stopped being freely available on 15
  February 2026**, so you self-host it with one Docker command.
- **`wandbox`** — a free public sandbox needing no key. Convenient, but it is a
  shared community service and it does go down.

One special case: **HTML**. There is nothing to "execute" — CodeSit renders it in a
sandboxed preview frame in the browser, so it never reaches any runner. For the
same reason it isn't offered as an exam language: there's no output to mark.

The takeaway line for your defence: *"Student code never runs inside the web
server itself — it's always a separate, time-limited process, and the engine is
swappable. We default to a local runner so the system works anywhere with no
setup, and for a real deployment you point it at a self-hosted Piston sandbox,
because the public Piston API stopped being freely available in February 2026."*

## 8. How marking works — and why a student can't fake a result

This is the newest and most exam-worthy part.

When a student hands in a paper, the server does **not** trust anything the
browser says about the output. For every question, it takes the code straight out
of the database, sends it to the execution engine itself — once per test case,
feeding in that case's input — and compares what comes back against the expected
output. Only what the server itself observed is ever scored. This closes the
obvious cheat: editing the page (or the network request) to claim an output your
program never produced gets you nothing, because the client's claimed output is
never read. The same rule was retrofitted onto the original freeform "Submit" too.

Marking degrades **honestly**, not silently. If the execution engine is
unreachable when a paper is handed in, that answer is not scored zero — it's
stored as "needs manual review," and the lecturer sees exactly that in the
results view, with an override field to enter a mark by hand once they've read
the code themselves. A real outage should never look like a student's fault.

Two more integrity details worth knowing:

- **The clock is the server's, not the browser's.** An attempt's deadline is
  computed once, on the server, from when it started. The countdown a student
  sees is just a display of that same deadline — every save and the hand-in
  itself are re-checked against the real clock, so tampering with the on-screen
  timer buys nothing. If time runs out while nobody is looking, the next request
  touching that attempt closes and marks it automatically.
- **Hidden test cases never reach the browser.** A question's marking scheme can
  include cases the student never sees — not the input, not the expected output,
  only (after marking) whether it passed. That's what stops "write code that
  prints the sample answer" from working as a strategy.

---

## 9. How access control works (the exam-worthy part — now extended to exams)

The original rule, still true for the freeform practice workspace: when a
lecturer asks for submissions, CodeSit does **not** fetch everything and filter in
the browser. It builds the restriction directly into the database query on the
server:

> "Give me submissions from students **whose department = this lecturer's
> department** AND **whose level is one of the levels this lecturer teaches**."

Because the filter is in the SQL on the server, there is simply no way for a
lecturer to receive a student they're not entitled to — even if they tampered with
the page. If they add a `?level=` filter for a level they *don't* teach, the
server ignores it and falls back to their allowed set. That "can't widen, only
narrow" behaviour is a deliberate security property.

**The exam engine inherits this rule exactly.** When a lecturer sets an exam, its
department is always read from the lecturer's own account — never from the
request — and its level must be one already in that lecturer's `lecturer_levels`
rows, or the server refuses. When a student asks for their exams, the query is
"published exams where department = my department AND level = my level" — the
same shape as the submissions query above. A student cannot start, view, or
answer an exam outside that pair, even by guessing its numeric id directly.
Ownership is checked the same way on every lecturer-only exam route, so one
lecturer can never see or touch another's exam, even within the same department.

We proved all of this with a real test suite (`npm test`, in `test/`) rather than
just asserting it in prose: a CS ND1/ND2 lecturer sees only the two matching
students; a Computer Engineering lecturer sees only their own department; a
student hitting a lecturer-only route is refused outright; a lecturer can only set
an exam for a level they teach; a student never sees an exam outside their own
department + level; and a handed-in paper can't be edited or resubmitted.

---

## 10. The demo accounts (for showing it off)

The first time CodeSit runs, it seeds these. Password for all: **codesit123**.

Students: `chioma` (CS ND1), `tunde` (CS ND2), `amaka` (CS HND1),
`khalid` (CS HND2), `adeola` (Computer Engineering ND2).

Lecturers:
- `mr_aluko` — CS, teaches ND1 & ND2 → sees Chioma & Tunde
- `mrs_okoro` — CS, teaches HND1 & HND2 → sees Amaka & Khalid
- `engr_musa` — Computer Engineering, ND1 & ND2 → sees only Adeola

The full walkthrough: log in as `mr_aluko`, set and publish a short exam for ND1.
Log in as `chioma` (CS/ND1) — the exam appears; sit it, hand it in, see the
instant marked result. Log in as `tunde` (CS/ND2, same department, wrong level) —
it does not appear for him at all. Back as `mr_aluko`, open **Results** and see
Chioma's score and paper. Then log in as `mrs_okoro` and note she cannot see
Aluko's exam at all, even though she teaches the same department. That single
walkthrough demonstrates the whole access-control idea, now end to end through a
real exam rather than just a submissions list.

---

## 11. What to say this project demonstrates

- A real full-stack web app: front end, server, database, and an external service.
- Authentication and password hashing done properly.
- Role-based access control with a genuine, testable security guarantee — applied
  consistently across both the original submissions model and the exam engine.
- An automatic marking pipeline where the server, never the client, is the source
  of truth for what a program actually output — including a server-authoritative
  exam clock and hidden test cases that never leave the server.
- Honest degradation: a third-party outage produces "needs manual review," never
  a silently wrong score.
- A pragmatic engineering decision made in response to a real 2026 change in the
  tooling landscape (the public Piston API closing), answered with a swappable
  runner: a zero-setup local one for development, self-hosted Piston for
  production — and an honest account of what each does and does not protect.
- A real automated test suite proving the access-control claims, not just prose.
- Clean, modular code organised so each file has one job.

That's CodeSit. If you can retell sections 8 and 9 in your own words, you can
defend the whole thing.
