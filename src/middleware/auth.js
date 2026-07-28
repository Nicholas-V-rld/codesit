/*
 * CodeSit — authentication guards
 * -------------------------------
 * Small middleware functions that protect routes. They check the session that
 * was created at login. Because the checks happen on the server, they cannot
 * be bypassed by editing anything in the browser.
 */

// Block anyone who is not logged in.
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    // For API calls answer with JSON; for page visits send them to login.
    // Use originalUrl because inside a mounted router req.path is relative.
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(401).json({ error: "Please log in to continue." });
    }
    return res.redirect("/login");
  }
  next();
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

module.exports = { requireAuth, requireRole };
