-- 0001 · initial schema for persistent ledgers.
-- Money lives in INTEGER cents end-to-end. Foreign keys cascade on delete
-- so dropping a `games` row cleans up everything dependent.

-- Games — one row per shareable settlement link.
CREATE TABLE games (
  id                TEXT PRIMARY KEY,             -- short slug (8 chars base32)
  pokernow_game_id  TEXT NOT NULL,                -- the original PokerNow game id
  source_unit       TEXT NOT NULL CHECK (source_unit IN ('cents','dollars')),
  unit_provenance   TEXT NOT NULL DEFAULT 'header' CHECK (unit_provenance IN ('header','heuristic','user')),
  started_at        INTEGER,                      -- ms since epoch (from CSV); nullable
  ended_at          INTEGER,                      -- ms since epoch
  created_at        INTEGER NOT NULL,             -- ms since epoch
  updated_at        INTEGER NOT NULL              -- bumped on every mutation
);
CREATE INDEX idx_games_pokernow_id ON games(pokernow_game_id);

-- Players in this game (snapshot of the ledger).
CREATE TABLE players (
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL,                       -- PokerNow player_id
  nickname   TEXT NOT NULL,
  net_cents  INTEGER NOT NULL,                    -- session net (already in cents internally)
  PRIMARY KEY (game_id, player_id)
);

-- Adjustments — already-paid transfers recorded by viewers.
CREATE TABLE adjustments (
  id              TEXT PRIMARY KEY,
  game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  from_player_id  TEXT NOT NULL,
  to_player_id    TEXT NOT NULL,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at      INTEGER NOT NULL,
  created_by      TEXT                            -- actor label, optional
);
CREATE INDEX idx_adjustments_game ON adjustments(game_id);

-- Per-player isolation rules.
CREATE TABLE isolation_rules (
  game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id       TEXT NOT NULL,
  counterpart_id  TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id),
  CHECK (player_id != counterpart_id)
);
CREATE INDEX idx_isolation_rules_game ON isolation_rules(game_id);

-- Payments — the materialized settlement plan. We persist this snapshot so
-- that completion checkboxes have stable identity across recomputes. When
-- adjustments / isolation rules change, the worker re-derives the plan and
-- diffs against the stored rows: identical (from,to,amount) tuples preserve
-- their `completed_at`/`completed_by`, brand-new rows start fresh.
CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  game_id          TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  from_player_id   TEXT NOT NULL,
  to_player_id     TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  forced           INTEGER NOT NULL DEFAULT 0 CHECK (forced IN (0,1)),
  position         INTEGER NOT NULL,              -- ordering within the plan
  completed_at     INTEGER,                       -- ms; NULL = pending
  completed_by     TEXT,                          -- actor label that flipped it
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_payments_game ON payments(game_id);
CREATE INDEX idx_payments_game_position ON payments(game_id, position);

-- Audit log — append-only history.
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,                       -- 'create_game','complete_payment','reopen_payment','add_adjustment','remove_adjustment','set_isolation','clear_isolation'
  actor_label TEXT,                                -- user-chosen identity
  payload     TEXT NOT NULL DEFAULT '{}',          -- JSON blob with action-specific details
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_audit_log_game ON audit_log(game_id, created_at DESC);
