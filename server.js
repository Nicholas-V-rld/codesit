/*
 * CodeSit — server entry point
 * ============================
 * Sit a coding exam in the browser: write, run and submit code, with
 * department- and level-based access control for lecturers.
 *
 * This file wires everything together: middleware, the API routes (kept in
 * src/routes), and the HTML pages (in /views). Business logic lives in the
 * src/ modules so this file stays a clean, readable overview of the app.
 */

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");

const config = require("./src/config");
require("./src/db");          // opens DB + creates/migrates tables
const seed = require("./src/seed");
const { requireAuth } = require("./src/middleware/auth");

const authRoutes = require("./src/routes/auth.routes");
const executeRoutes = require("./src/routes/execute.routes");
const submissionRoutes = require("./src/routes/submission.routes");

seed(); // create demo accounts on first run

const app = express();

const LANDING_DIST = path.join(__dirname, "landing", "dist");
const LANDING_INDEX = path.join(LANDING_DIST, "index.html");

// --- Middleware ---
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
// App CSS/JS win over landing assets where paths collide.
app.use(express.static(path.join(__dirname, "public")));
// index: false so GET / hits our handler (session redirect + landing).
app.use(express.static(LANDING_DIST, { index: false }));
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 day
}));

// --- API routes ---
app.use("/api", authRoutes);
app.use("/api", executeRoutes);
app.use("/api", submissionRoutes);

// --- Pages ---
const page = (file) => path.join(__dirname, "views", file);

app.get("/", (req, res) => {
  // Logged-in users skip the marketing page.
  if (req.session.userId) {
    return res.redirect(
      req.session.role === config.ROLES.LECTURER ? "/lecturer" : "/student"
    );
  }
  if (fs.existsSync(LANDING_INDEX)) {
    return res.sendFile(LANDING_INDEX);
  }
  return res
    .status(503)
    .type("text")
    .send("Landing page not built. Run: npm run build");
});

app.get("/login", (req, res) => res.sendFile(page("login.html")));
app.get("/register", (req, res) => res.sendFile(page("register.html")));

app.get("/student", requireAuth, (req, res) => {
  if (req.session.role !== config.ROLES.STUDENT) return res.redirect("/lecturer");
  res.sendFile(page("student.html"));
});
app.get("/lecturer", requireAuth, (req, res) => {
  if (req.session.role !== config.ROLES.LECTURER) return res.redirect("/student");
  res.sendFile(page("lecturer.html"));
});

// --- Start ---
app.listen(config.PORT, () => {
  console.log(`
  CodeSit is running  ->  http://localhost:${config.PORT}
  Execution engine: ${config.EXECUTOR}

  Demo accounts (password: codesit123)
    Students : chioma, tunde, amaka, khalid, adeola
    Lecturers: mr_aluko, mrs_okoro, engr_musa
  `);
});
