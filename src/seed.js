/*
 * CodeSit — seed data
 * -------------------
 * Creates a set of demo accounts the first time the app runs, so the platform
 * can be explored (and access control demonstrated) without registering
 * anyone by hand. Runs only if the users table is empty.
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

function seed() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return; // already seeded

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const PW = hash("codesit123");

  const insertUser = db.prepare(`
    INSERT INTO users (username, password, role, full_name, matric_number, staff_id, department, level)
    VALUES (@username, @password, @role, @full_name, @matric_number, @staff_id, @department, @level)
  `);
  const insertLevel = db.prepare(
    "INSERT OR IGNORE INTO lecturer_levels (lecturer_id, level) VALUES (?, ?)"
  );

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

  const tx = db.transaction(() => {
    for (const s of students) {
      insertUser.run({
        username: s.username, password: PW, role: "student", full_name: s.full_name,
        matric_number: s.matric, staff_id: "", department: s.dept, level: s.level,
      });
    }
    for (const l of lecturers) {
      const info = insertUser.run({
        username: l.username, password: PW, role: "lecturer", full_name: l.full_name,
        matric_number: "", staff_id: l.staff, department: l.dept, level: "",
      });
      for (const lvl of l.levels) insertLevel.run(info.lastInsertRowid, lvl);
    }
  });
  tx();

  console.log("✓ Seeded demo accounts (password for all: codesit123)");
}

module.exports = seed;
