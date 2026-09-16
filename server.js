/*
 * CodeSit — server entry point
 * ============================
 * Sit a coding exam in the browser: write, run and submit code, with
 * department- and level-based access control for lecturers.
 *
 * The app itself (middleware, routes, pages) is built in src/app.js. This
 * file's only job is to load configuration, build that app, and start
 * listening — kept separate so tests can build the same app without binding
 * a real port. Business logic lives in the src/ modules so both this file
 * and src/app.js stay short, readable overviews of the system.
 */

require("dotenv").config(); // load .env before anything reads process.env

const config = require("./src/config");
const app = require("./src/app");
const { localStatus } = require("./src/services/executor");

module.exports = app;
// Only listen when run directly (npm start / npm run dev). On Vercel the
// platform serves the app from src/app.js and nothing here runs.
if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`
  CodeSit is running  ->  http://localhost:${config.PORT}
  Execution engine: ${localStatus() || config.EXECUTOR}

  Demo accounts (password: codesit123)
    Students : chioma, tunde, amaka, khalid, adeola
    Lecturers: mr_aluko, mrs_okoro, engr_musa
  `);
  });
}
