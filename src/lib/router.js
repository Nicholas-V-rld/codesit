/*
 * CodeSit — an Express router for async handlers
 * ----------------------------------------------
 * Every database call is asynchronous, so nearly every route handler is an
 * async function. Express 4 does not watch the promise a handler returns: if
 * it rejects (a dropped database connection, say), the request would simply
 * hang and the error would go unreported. This router passes any such
 * rejection to next(), where the app's error handler answers with a clean 500.
 *
 * It also normalises numeric URL ids. SQLite quietly finds nothing for
 * /api/exams/abc; PostgreSQL rejects the query outright because "abc" is not
 * an integer. Anything that is not a plain, sensibly sized number is turned
 * into 0 — an id no row has — so both databases give the same "not found".
 */

const express = require("express");

const ID_PARAMS = ["id", "questionId"];

function wrap(handler) {
  if (typeof handler !== "function" || handler.length === 4) return handler; // error middleware
  return function (req, res, next) {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === "function") result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

function asyncRouter() {
  const router = express.Router();
  for (const method of ["get", "post", "put", "delete"]) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.flat().map(wrap));
  }
  for (const name of ID_PARAMS) {
    router.param(name, (req, res, next, value) => {
      if (!/^\d{1,9}$/.test(value)) req.params[name] = "0";
      next();
    });
  }
  return router;
}

module.exports = { asyncRouter };
