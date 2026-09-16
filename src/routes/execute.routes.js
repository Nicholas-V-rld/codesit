/*
 * CodeSit — run code
 * ------------------
 *  POST /api/execute   { code, language, stdin? } -> { ok, output, stderr, note }
 *
 * Used by students to test their code, and by lecturers to re-run a student's
 * submission and verify it works. Both go through the same sandboxed engine.
 */

const { asyncRouter } = require("../lib/router");
const { requireAuth } = require("../middleware/auth");
const { runCode } = require("../services/executor");

const router = asyncRouter();

router.post("/execute", requireAuth, async (req, res) => {
  const { code, language, stdin } = req.body || {};
  const result = await runCode(code, language, typeof stdin === "string" ? stdin : "");
  res.json(result);
});

module.exports = router;
