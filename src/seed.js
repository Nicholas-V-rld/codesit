/*
 * CodeSit — seed data
 * -------------------
 * Creates a set of demo accounts the first time the app runs, so the platform
 * can be explored (and access control demonstrated) without registering
 * anyone by hand. Runs only if the users table is empty.
 *
 * Safe to run from several serverless instances starting at once: every
 * insert ignores a row that already exists, so a race creates each account
 * exactly once.
 *
 * The accounts are chosen to show department + level scoping clearly:
 *
 *   Mr Aluko    (CS, teaches ND1 & ND2)  -> sees Chioma, Tunde
 *   Mrs Okoro   (CS, teaches HND1 & HND2)-> sees Amaka, Khalid
 *   Engr Musa   (Comp Eng, ND1 & ND2)    -> sees Adeola only
 *
 * Password for every demo account: codesit123
 */

const bcrypt = require("bcryptjs");
const db = require("./db");

async function seed() {
  const { n } = await db.get("SELECT COUNT(*) AS n FROM users");
  if (n > 0) return; // already seeded

  const PW = await bcrypt.hash("codesit123", 10);

  const students = [
    { username: "chioma", full_name: "Chioma Obi",       matric: "CS/ND/2024/045",  dept: "Computer Science", level: "ND1" },
    { username: "tunde",  full_name: "Tunde Bakare",     matric: "CS/ND/2023/067",  dept: "Computer Science", level: "ND2" },
    { username: "amaka",  full_name: "Amaka Nwosu",      matric: "CS/HND/2024/012", dept: "Computer Science", level: "HND1" },
    { username: "khalid", full_name: "Khalid Abubakar",  matric: "CS/HND/2023/089", dept: "Computer Science", level: "HND2" },
    { username: "adeola", full_name: "Adeola Fashola",   matric: "CE/ND/2023/031",  dept: "Computer Engineering", level: "ND2" },
  ];

  const lecturers = [
    { username: "mr_aluko",  full_name: "Mr. Aluko",           staff: "STAFF/CS/001", dept: "Computer Science",     levels: ["ND1", "ND2"] },
    { username: "mrs_okoro", full_name: "Mrs. Okoro Adaeze",   staff: "STAFF/CS/002", dept: "Computer Science",     levels: ["HND1", "HND2"] },
    { username: "engr_musa", full_name: "Engr. Musa Danladi",  staff: "STAFF/CE/001", dept: "Computer Engineering", levels: ["ND1", "ND2"] },
  ];

  const insertUser = `
    INSERT INTO users (username, password, role, full_name, matric_number, staff_id, department, level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (username) DO NOTHING
  `;

  await db.transaction(async (tx) => {
    for (const s of students) {
      await tx.run(insertUser, [s.username, PW, "student", s.full_name, s.matric, "", s.dept, s.level]);
    }
    for (const l of lecturers) {
      await tx.run(insertUser, [l.username, PW, "lecturer", l.full_name, "", l.staff, l.dept, ""]);
      const { id } = await tx.get("SELECT id FROM users WHERE username = ?", [l.username]);
      for (const lvl of l.levels) {
        await tx.run("INSERT INTO lecturer_levels (lecturer_id, level) VALUES (?, ?) ON CONFLICT DO NOTHING", [id, lvl]);
      }
    }
  });

  console.log("✓ Seeded demo accounts (password for all: codesit123)");
}

module.exports = seed;
