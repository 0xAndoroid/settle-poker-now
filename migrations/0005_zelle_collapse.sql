-- 0005 · collapse Zelle handle into a single free-text field.
--
-- The 0004 schema discriminated `zelle_handle_kind` ∈ {'email','phone'}.
-- In practice the email-vs-phone distinction is irrelevant — Zelle
-- accepts both interchangeably, and the discriminator made the identity
-- prompt UI fiddly (backspacing the kind selector caused validation
-- thrash). Drop the column.
--
-- SQLite's ALTER TABLE DROP COLUMN refuses when the column is
-- referenced by a CHECK constraint (the dual-null guard from 0004
-- references it). Recreate the table — copy / drop / rename — to
-- preserve the rows we already have on remote.

CREATE TABLE player_payment_methods_new (
  game_id        TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id      TEXT NOT NULL,
  -- Stored without the leading '@'; the client adds it when displaying.
  venmo_username TEXT,
  -- Free-text: email, US phone, anything Zelle will accept. The user
  -- pastes whatever their bank app expects.
  zelle_handle   TEXT,
  updated_at     INTEGER NOT NULL,
  updated_by     TEXT,
  PRIMARY KEY (game_id, player_id)
);

INSERT INTO player_payment_methods_new
  (game_id, player_id, venmo_username, zelle_handle, updated_at, updated_by)
SELECT
  game_id, player_id, venmo_username, zelle_handle, updated_at, updated_by
FROM player_payment_methods;

DROP TABLE player_payment_methods;

ALTER TABLE player_payment_methods_new RENAME TO player_payment_methods;

CREATE INDEX idx_player_payment_methods_game ON player_payment_methods(game_id);
