-- 0009 · uncaught Pages Function exceptions.
--
-- Cloudflare Pages keeps no Function logs, so functions/lib/error-log.ts
-- writes one row per uncaught exception. `id` is the `errorId` the client
-- received in the 500 response.

CREATE TABLE function_errors (
  id           TEXT PRIMARY KEY,
  occurred_at  INTEGER NOT NULL,
  method       TEXT NOT NULL,
  pathname     TEXT NOT NULL,
  error_name   TEXT NOT NULL,
  message      TEXT NOT NULL,
  stack        TEXT,
  cf_ray       TEXT
);
