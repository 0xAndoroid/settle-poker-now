-- 0007 · live game management.
--
-- Live games are D1-canonical, append-friendly sessions that finalize into
-- the existing games/players/payments settlement surface.

ALTER TABLE games
ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'pokernow'
CHECK (source_kind IN ('pokernow', 'live'));

ALTER TABLE players ADD COLUMN buy_in_cents INTEGER;
ALTER TABLE players ADD COLUMN buy_out_cents INTEGER;

CREATE TABLE live_games (
  id                    TEXT PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'finalizing', 'finalized', 'abandoned')),
  host_player_id         TEXT,
  title                  TEXT,
  note                   TEXT,
  total_chip_bank_cents  INTEGER CHECK (total_chip_bank_cents IS NULL OR total_chip_bank_cents >= 0),
  version                INTEGER NOT NULL DEFAULT 0,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  finalized_at           INTEGER,
  finalized_game_id      TEXT
);

CREATE INDEX idx_live_games_status ON live_games(status);
CREATE INDEX idx_live_games_updated_at ON live_games(updated_at);

CREATE TABLE live_players (
  game_id      TEXT NOT NULL REFERENCES live_games(id) ON DELETE CASCADE,
  player_id    TEXT NOT NULL,
  name         TEXT NOT NULL,
  is_host      INTEGER NOT NULL DEFAULT 0 CHECK (is_host IN (0,1)),
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'cashed_out', 'busted', 'removed')),
  sort_order   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX idx_live_players_game_order ON live_players(game_id, sort_order);

CREATE TABLE live_entries (
  id               TEXT PRIMARY KEY,
  game_id          TEXT NOT NULL REFERENCES live_games(id) ON DELETE CASCADE,
  player_id        TEXT NOT NULL,
  entry_type       TEXT NOT NULL CHECK (entry_type IN ('buy_in', 'cash_out', 'prior_payment')),
  amount_cents     INTEGER NOT NULL,
  to_player_id     TEXT,
  payment_method   TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'venmo', 'zelle', 'other')),
  is_final         INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1)),
  note             TEXT,
  client_event_id  TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  created_by       TEXT,
  voided_at        INTEGER,
  voided_by        TEXT,
  void_reason      TEXT,
  CHECK (
    (entry_type = 'cash_out' AND amount_cents >= 0)
    OR (entry_type IN ('buy_in', 'prior_payment') AND amount_cents > 0)
  ),
  CHECK (
    (entry_type = 'prior_payment' AND to_player_id IS NOT NULL)
    OR (entry_type != 'prior_payment')
  ),
  UNIQUE (game_id, client_event_id)
);

CREATE INDEX idx_live_entries_game_created ON live_entries(game_id, created_at);
CREATE INDEX idx_live_entries_player ON live_entries(game_id, player_id);
CREATE INDEX idx_live_entries_voided ON live_entries(game_id, voided_at);

CREATE TABLE live_chip_checkpoints (
  id               TEXT PRIMARY KEY,
  game_id          TEXT NOT NULL REFERENCES live_games(id) ON DELETE CASCADE,
  checkpoint_type  TEXT NOT NULL
                    CHECK (checkpoint_type IN ('set_bank_total', 'verify_table_count', 'verify_bank_count')),
  amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0),
  expected_cents   INTEGER,
  delta_cents      INTEGER,
  note             TEXT,
  client_event_id  TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  created_by       TEXT,
  UNIQUE (game_id, client_event_id)
);

CREATE INDEX idx_live_chip_checkpoints_game_created
ON live_chip_checkpoints(game_id, created_at);

CREATE TABLE live_audit_log (
  id               TEXT PRIMARY KEY,
  game_id          TEXT NOT NULL REFERENCES live_games(id) ON DELETE CASCADE,
  action           TEXT NOT NULL,
  actor_label      TEXT,
  payload          TEXT NOT NULL DEFAULT '{}',
  client_event_id  TEXT,
  created_at       INTEGER NOT NULL
);

CREATE INDEX idx_live_audit_log_game ON live_audit_log(game_id, created_at DESC);
CREATE UNIQUE INDEX idx_live_audit_log_client_event
ON live_audit_log(game_id, client_event_id)
WHERE client_event_id IS NOT NULL;
