-- 0003 · game finalization
-- Add a "finalized" lock state on games. Once finalized, structural
-- mutations (adjustments, isolation rules, aliases) are rejected with
-- 423 Locked. Marking payments complete still works — the whole point
-- of finalize is to freeze the SHAPE of the plan while letting people
-- check off who paid.
--
-- Re-finalize is idempotent. Unfinalize reverses the lock; both events
-- are recorded in the audit log.

ALTER TABLE games ADD COLUMN finalized_at INTEGER;
ALTER TABLE games ADD COLUMN finalized_by TEXT;

CREATE INDEX idx_games_finalized_at ON games(finalized_at);
