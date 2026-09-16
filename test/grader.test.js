/*
 * Pure-logic tests for the marking scheme's output comparison. No network,
 * no code execution — these exercise normalise()/outputsMatch() directly, so
 * they run the same whether or not the execution engine is reachable.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { outputsMatch, normalise } = require("../src/services/grader");

test("exact match passes", () => {
  assert.equal(outputsMatch("42", "42"), true);
});

test("a trailing newline does not cost a mark", () => {
  assert.equal(outputsMatch("42\n", "42"), true);
  assert.equal(outputsMatch("42", "42\n"), true);
  assert.equal(outputsMatch("42\n\n\n", "42"), true);
});

test("trailing spaces on a line do not cost a mark", () => {
  assert.equal(outputsMatch("hello   \nworld", "hello\nworld"), true);
});

test("CRLF vs LF line endings do not cost a mark", () => {
  assert.equal(outputsMatch("a\r\nb\r\n", "a\nb"), true);
});

test("wrong output fails", () => {
  assert.equal(outputsMatch("41", "42"), false);
});

test("case differences are not normalised away — 'Hello' != 'hello'", () => {
  assert.equal(outputsMatch("Hello", "hello"), false);
});

test("leading whitespace on a line is significant", () => {
  assert.equal(outputsMatch("  42", "42"), false);
});

test("normalise treats null/undefined as empty", () => {
  assert.equal(normalise(null), "");
  assert.equal(normalise(undefined), "");
  assert.equal(outputsMatch(null, ""), true);
});
