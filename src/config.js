/*
 * CodeSit — central configuration
 * -------------------------------
 * Everything that might change lives here so the rest of the code can stay
 * clean. Values can be overridden with environment variables at launch, e.g.
 *   PORT=4000 EXECUTOR=piston npm start
 */

const path = require("path");

module.exports = {
  // --- Server ---
  PORT: process.env.PORT || 3000,
  SESSION_SECRET: process.env.SESSION_SECRET || "codesit-dev-secret-change-me",

  // --- Database ---
  DB_PATH: process.env.DB_PATH || path.join(__dirname, "..", "database", "codesit.db"),

  // --- Roles ---
  ROLES: { STUDENT: "student", LECTURER: "lecturer" },

  /*
   * Academic structure.
   * CodeSit is built for a polytechnic, so levels are ND/HND, not 100–400.
   * `value` is stored in the database; `label` is what people see.
   */
  DEPARTMENTS: [
    "Computer Science",
    "Computer Engineering",
    "Electrical/Electronic Engineering",
    "Information Technology",
    "Science Laboratory Technology",
    "Mechanical Engineering",
  ],
  LEVELS: [
    { value: "ND1", label: "ND I" },
    { value: "ND2", label: "ND II" },
    { value: "HND1", label: "HND I" },
    { value: "HND2", label: "HND II" },
  ],

  /*
   * Languages students can write in.
   * `piston` / `wandbox` map our id to what each execution engine expects.
   * `html` is special: it is previewed in a sandboxed iframe in the browser
   * and never sent to a server engine.
   */
  LANGUAGES: [
    { id: "python", label: "Python", monaco: "python", piston: "python", wandboxLang: "Python", wandboxPrefix: "cpython-3" },
    { id: "javascript", label: "JavaScript (Node)", monaco: "javascript", piston: "javascript", wandboxLang: "JavaScript", wandboxPrefix: "nodejs" },
    { id: "java", label: "Java", monaco: "java", piston: "java", wandboxLang: "Java", wandboxPrefix: "openjdk" },
    { id: "cpp", label: "C++", monaco: "cpp", piston: "c++", wandboxLang: "C++", wandboxPrefix: "gcc" },
    { id: "c", label: "C", monaco: "c", piston: "c", wandboxLang: "C", wandboxPrefix: "gcc" },
    { id: "html", label: "HTML (preview)", monaco: "html", piston: null, wandboxLang: null, wandboxPrefix: null },
  ],

  /*
   * Code execution engine.
   * ----------------------
   * IMPORTANT: the free public Piston API (emkc.org) stopped being open to the
   * public on 15 Feb 2026 and now needs an authorisation token. So CodeSit
   * defaults to WANDBOX, a long-running free service that needs no key and
   * works out of the box.
   *
   * To use Piston instead (recommended for production — ideally self-hosted),
   * launch with:  EXECUTOR=piston PISTON_URL=http://localhost:2000/api/v2/piston
   * and, if using the public endpoint, PISTON_TOKEN=your-token
   */
  EXECUTOR: process.env.EXECUTOR || "wandbox", // "wandbox" | "piston"
  PISTON_URL: process.env.PISTON_URL || "https://emkc.org/api/v2/piston",
  PISTON_TOKEN: process.env.PISTON_TOKEN || "",
  WANDBOX_URL: process.env.WANDBOX_URL || "https://wandbox.org/api",

  // Safety limits for execution
  RUN_TIMEOUT_MS: 8000,
};
