/*
 * CodeSit — automatic marking
 * ---------------------------
 * Takes a student's answer and the question's test cases, runs the code once
 * per test case on the sandboxed engine, and awards the points for every case
 * whose output matches.
 *
 * Two properties matter here, and both are deliberate:
 *
 *  1. THE SERVER RUNS THE CODE. The browser never tells us what the output
 *     was. Everything stored against an answer is produced here, so a student
 *     editing the page (or the network request) cannot claim an output their
 *     program did not actually produce.
 *
 *  2. MARKING DEGRADES HONESTLY. If the external engine is unreachable, we do
 *     not silently award zero — that would punish a student for our outage.
 *     The answer is stored ungraded with a note, and the lecturer is told it
 *     needs a manual look.
 */

const { runCode, runBatch } = require("./executor");

// How many test cases to run at once on an engine that takes one run per
// request (Piston, Wandbox). Those are often shared services, so we stay
// polite rather than firing a whole exam at them in one burst.
const CONCURRENCY = 3;

/*
 * Output comparison.
 * Students should not lose a mark for a trailing newline or a stray space at
 * the end of a line, so we compare in a normalised form: CRLF collapsed, each
 * line right-trimmed, and blank lines at the very end dropped.
 */
function normalise(text) {
  return String(text == null ? "" : text)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

function outputsMatch(actual, expected) {
  return normalise(actual) === normalise(expected);
}

// Run an array of async jobs with a fixed ceiling on how many are in flight.
async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/*
 * Did the engine actually run anything?
 * runCode returns a `note` and nothing else when it could not reach the
 * runner. A program that legitimately prints nothing has no note, so this
 * tells a real outage apart from an empty-but-valid result.
 */
function engineFailed(result) {
  return Boolean(result.note) && !result.stdout && !result.stderr && !result.output;
}

/*
 * Grade one answer.
 * Returns everything needed to store the answer and to render both the
 * student's result screen and the lecturer's review.
 */
async function gradeAnswer({ code, language, testCases }) {
  const cases = Array.isArray(testCases) ? testCases : [];
  const maxScore = cases.reduce((sum, t) => sum + (Number(t.points) || 0), 0);

  if (!code || !code.trim()) {
    return {
      score: 0, maxScore, passedCount: 0, totalCount: cases.length,
      report: cases.map((t, i) => ({
        index: i, hidden: !!t.hidden, points: Number(t.points) || 0,
        stdin: t.stdin || "", expected: t.expected_output, actual: "",
        stderr: "", passed: false, skipped: true,
      })),
      note: "No answer was written for this question.",
    };
  }

  if (cases.length === 0) {
    return {
      score: 0, maxScore: 0, passedCount: 0, totalCount: 0, report: [],
      note: "This question has no test cases, so it needs marking by hand.",
    };
  }

  let outage = null;

  // The local and sandbox engines take every test case in one job (compile
  // once, run each input); the others are asked one case at a time below.
  const batch = await runBatch(code, language, cases.map((t) => t.stdin || ""));

  const report = await mapWithLimit(cases, batch ? cases.length : CONCURRENCY, async (t, i) => {
    const points = Number(t.points) || 0;
    // Once the engine is known to be down, stop hammering it.
    if (outage) {
      return { index: i, hidden: !!t.hidden, points, stdin: t.stdin || "",
        expected: t.expected_output, actual: "", stderr: "", passed: false, skipped: true };
    }

    const result = batch ? batch[i] : await runCode(code, language, t.stdin || "");
    if (engineFailed(result)) {
      outage = result.note;
      return { index: i, hidden: !!t.hidden, points, stdin: t.stdin || "",
        expected: t.expected_output, actual: "", stderr: "", passed: false, skipped: true };
    }

    const actual = result.stdout || result.output || "";
    return {
      index: i,
      hidden: !!t.hidden,
      points,
      stdin: t.stdin || "",
      expected: t.expected_output,
      actual,
      stderr: result.stderr || "",
      passed: outputsMatch(actual, t.expected_output),
      skipped: false,
    };
  });

  if (outage) {
    return {
      score: 0, maxScore, passedCount: 0, totalCount: cases.length, report,
      note: `Could not mark automatically — ${outage} This answer needs marking by hand.`,
      ungraded: true,
    };
  }

  const passed = report.filter((r) => r.passed);
  return {
    score: passed.reduce((sum, r) => sum + r.points, 0),
    maxScore,
    passedCount: passed.length,
    totalCount: report.length,
    report,
    note: "",
  };
}

/*
 * Strip a report down to what a student is allowed to see.
 * Hidden cases still show pass/fail — otherwise a score looks arbitrary — but
 * never reveal their input or the expected answer.
 */
function studentSafeReport(report) {
  return (Array.isArray(report) ? report : []).map((r) => (
    r.hidden
      ? { index: r.index, hidden: true, points: r.points, passed: r.passed, skipped: r.skipped }
      : r
  ));
}

module.exports = { gradeAnswer, studentSafeReport, outputsMatch, normalise };
