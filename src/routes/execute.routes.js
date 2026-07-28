/*
 * CodeSit — run code
 * ------------------
 *  POST /api/execute   { code, language } -> { ok, output, stderr, note }
 *
 * Used by students to test their code, and by lecturers to re-run a student's
 * submission and verify it works. Both go through the same sandboxed engine.
 */

const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { runCode } = require("../services/executor");

const router = express.Router();

router.post("/execute", requireAuth, async (req, res) => {
  const { code, language } = req.body || {};
  const result = await runCode(code, language);
  res.json(result);
});

module.exports = router;
