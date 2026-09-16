/*
 * CodeSit — login sessions, stored in the database
 * ------------------------------------------------
 * express-session keeps only a random id in the browser's cookie; the session
 * itself (who is logged in, and as what role) lives in the app_sessions
 * table. Keeping it in the database rather than in memory is what lets a
 * student stay logged in across a server restart — and, once deployed, across
 * the many short-lived serverless instances that may each answer one of their
 * requests during a single exam.
 *
 * It works on SQLite and PostgreSQL alike, because it only uses src/db.js.
 */

const session = require("express-session");
const db = require("./db");

const DAY_MS = 24 * 60 * 60 * 1000;

class DbSessionStore extends session.Store {
  get(sid, callback) {
    db.get("SELECT sess, expires FROM app_sessions WHERE sid = ?", [sid]).then((row) => {
      if (!row) return callback(null, null);
      if (Number(row.expires) <= Date.now()) {
        return this.destroy(sid, () => callback(null, null));
      }
      callback(null, JSON.parse(row.sess));
    }, callback);
  }

  set(sid, sess, callback = () => {}) {
    const expires = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + DAY_MS;
    db.run(`
      INSERT INTO app_sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT (sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `, [sid, JSON.stringify(sess), expires]).then(() => {
      // Expired rows are cleared now and then as a side effect of logins,
      // rather than by a timer: a serverless instance has no long-lived
      // process to run one, and a test process must be free to exit.
      if (Math.random() < 0.05) this.clearExpired();
      callback(null);
    }, callback);
  }

  destroy(sid, callback = () => {}) {
    db.run("DELETE FROM app_sessions WHERE sid = ?", [sid]).then(() => callback(null), callback);
  }

  /*
   * Sessions are written only when they change (at login), and the cookie
   * carries the same fixed expiry, so there is nothing to extend on each
   * request — skipping the write keeps every page view free of a database
   * write.
   */
  touch(sid, sess, callback = () => {}) {
    callback(null);
  }

  clearExpired() {
    return db.run("DELETE FROM app_sessions WHERE expires <= ?", [Date.now()])
      .catch((err) => console.error("[sessions] cleanup failed:", err.message));
  }
}

module.exports = DbSessionStore;
