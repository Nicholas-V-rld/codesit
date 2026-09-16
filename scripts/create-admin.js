/*
 * Create an administrator account, or make an existing account one.
 *
 *   npm run create-admin -- <username>              # generates a password
 *   ADMIN_PASSWORD=... npm run create-admin -- <username>
 *
 * Uses the same database the app would: DATABASE_URL if set (for the deployed
 * database, run `vercel env pull .env.local` first — it is read from there),
 * otherwise the local SQLite file. An existing account keeps its password
 * unless ADMIN_PASSWORD is given.
 */

require("dotenv").config({ path: ".env.local", quiet: true });
require("dotenv").config({ quiet: true });

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../src/db");

(async () => {
  const username = String(process.argv[2] || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    console.error("Usage: npm run create-admin -- <username>");
    process.exit(1);
  }
  const given = process.env.ADMIN_PASSWORD || "";
  if (given && given.length < 8) {
    console.error("ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  await db.ready();
  const existing = await db.get("SELECT id, role FROM users WHERE username = ?", [username]);
  let password = given;

  if (existing) {
    await db.run("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?", [existing.id]);
    await db.run("DELETE FROM lecturer_levels WHERE lecturer_id = ?", [existing.id]);
    if (password) {
      await db.run("UPDATE users SET password = ? WHERE id = ?", [await bcrypt.hash(password, 10), existing.id]);
    }
    console.log(`✓ "${username}" (was ${existing.role}) is now an administrator.`);
  } else {
    if (!password) password = crypto.randomBytes(12).toString("base64url");
    await db.run(`
      INSERT INTO users (username, password, role, full_name, status)
      VALUES (?, ?, 'admin', 'Administrator', 'active')
    `, [username, await bcrypt.hash(password, 10)]);
    console.log(`✓ Created administrator "${username}".`);
  }
  if (password && !given) {
    console.log(`  Password: ${password}`);
    console.log("  Sign in and change it from the admin page (Change password).");
  }
  console.log(`  Database: ${db.dialect === "postgres" ? "PostgreSQL (DATABASE_URL)" : "local SQLite"}`);
  await db.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
