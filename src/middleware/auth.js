/*
 * CodeSit — authentication guards
 * -------------------------------
 * Small middleware functions that protect routes. They check the session that
 * was created at login. Because the checks happen on the server, they cannot
 * be bypassed by editing anything in the browser.
 */

const db = require("../db");

// Where each role lands after signing in.
const HOME = { student: "/student", lecturer: "/lecturer", admin: "/admin" };
const homeFor = (role) => HOME[role] || "/login";

function refuse(req, res, status, message) {
  // For API calls answer with JSON; for page visits send them to login.
  // Use originalUrl because inside a mounted router req.path is relative.
  if (req.originalUrl.startsWith("/api/")) return res.status(status).json({ error: message });
  return res.redirect("/login");
}

/*
 * Block anyone who is not logged in — or whose account has since been
 * suspended or removed by an administrator. The account is looked up on every
 * request, so a suspension takes effect at once, even mid-exam, and a changed
 * role is picked up without signing in again.
 */
async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      return refuse(req, res, 401, "Please log in to continue.");
    }
    const user = await db.get("SELECT role, status FROM users WHERE id = ?", [req.session.userId]);
    if (!user || user.status !== "active") {
      return req.session.destroy(() =>
        refuse(req, res, 401, "Your account is not active. Please contact an administrator."));
    }
    req.session.role = user.role;
    next();
  } catch (err) {
    next(err);
  }
}

// Block anyone whose role is not the one required (e.g. lecturer-only routes).
function requireRole(role) {
  return function (req, res, next) {
    if (!req.session || req.session.role !== role) {
      return res.status(403).json({ error: "You do not have access to this." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, homeFor };
