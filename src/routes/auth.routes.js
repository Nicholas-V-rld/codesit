/*
 * CodeSit — authentication & account routes
 * -----------------------------------------
 *  POST /api/register   create a student or lecturer account
 *  POST /api/login      sign in, start a session
 *  POST /api/logout     sign out
 *  GET  /api/me         who am I (used by dashboards on load)
 *  PUT  /api/profile    student updates editable profile fields
 *  GET  /api/meta       departments / levels / languages for the forms
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { DEPARTMENTS, LEVELS, LANGUAGES, ROLES } = require("../config");

const router = express.Router();

const validLevels = LEVELS.map((l) => l.value);
const validDepts = DEPARTMENTS;

// Metadata for the registration and profile forms.
router.get("/meta", (req, res) => {
  res.json({
    departments: DEPARTMENTS,
    levels: LEVELS,
    languages: LANGUAGES.map(({ id, label, monaco }) => ({ id, label, monaco })),
  });
});

// ---- Register ----
router.post("/register", (req, res) => {
  const b = req.body || {};
  const role = b.role;
  const username = (b.username || "").trim().toLowerCase();
  const password = b.password || "";

  if (![ROLES.STUDENT, ROLES.LECTURER].includes(role))
    return res.status(400).json({ error: "Choose whether you are a student or a lecturer." });
  if (username.length < 3)
    return res.status(400).json({ error: "Username must be at least 3 characters." });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!(b.full_name || "").trim())
    return res.status(400).json({ error: "Enter your full name." });
  if (!validDepts.includes(b.department))
    return res.status(400).json({ error: "Select a valid department." });

  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return res.status(409).json({ error: "That username is already taken." });

  if (role === ROLES.STUDENT) {
    if (!validLevels.includes(b.level))
      return res.status(400).json({ error: "Select your level." });
  } else {
    const levels = Array.isArray(b.teaching_levels) ? b.teaching_levels : [];
    const clean = levels.filter((l) => validLevels.includes(l));
    if (clean.length === 0)
      return res.status(400).json({ error: "Select at least one level you teach." });
    b._levels = clean;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const tx = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO users (username, password, role, full_name, matric_number, staff_id, department, level)
        VALUES (@username, @password, @role, @full_name, @matric_number, @staff_id, @department, @level)
      `).run({
        username,
        password: passwordHash,
        role,
        full_name: (b.full_name || "").trim(),
        matric_number: role === ROLES.STUDENT ? (b.matric_number || "").trim() : "",
        staff_id: role === ROLES.LECTURER ? (b.staff_id || "").trim() : "",
        department: b.department,
        level: role === ROLES.STUDENT ? b.level : "",
      });
      if (role === ROLES.LECTURER) {
        const insLevel = db.prepare("INSERT OR IGNORE INTO lecturer_levels (lecturer_id, level) VALUES (?, ?)");
        for (const lvl of b._levels) insLevel.run(info.lastInsertRowid, lvl);
      }
      return info.lastInsertRowid;
    });
    tx();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Could not create the account. Please try again." });
  }
});

// ---- Login ----
router.post("/login", (req, res) => {
  const username = (req.body.username || "").trim().toLowerCase();
  const password = req.body.password || "";
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Wrong username or password." });

  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true, role: user.role });
});

// ---- Logout ----
router.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ---- Current user ----
router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, username, role, full_name, matric_number, staff_id, department, level
    FROM users WHERE id = ?
  `).get(req.session.userId);
  if (!user) return res.status(404).json({ error: "Account not found." });

  if (user.role === ROLES.LECTURER) {
    user.levels = db.prepare("SELECT level FROM lecturer_levels WHERE lecturer_id = ?")
      .all(user.id).map((r) => r.level);
  }
  res.json(user);
});

// ---- Update profile (student: full name + matric only) ----
router.put("/profile", requireAuth, (req, res) => {
  const user = db.prepare("SELECT role FROM users WHERE id = ?").get(req.session.userId);
  if (!user) return res.status(404).json({ error: "Account not found." });

  const full_name = (req.body.full_name || "").trim();
  if (!full_name) return res.status(400).json({ error: "Name cannot be empty." });

  if (user.role === ROLES.STUDENT) {
    db.prepare("UPDATE users SET full_name = ?, matric_number = ? WHERE id = ?")
      .run(full_name, (req.body.matric_number || "").trim(), req.session.userId);
  } else {
    db.prepare("UPDATE users SET full_name = ? WHERE id = ?").run(full_name, req.session.userId);
  }
  res.json({ ok: true });
});

module.exports = router;
