-- 0004 · per-player Venmo / Zelle handles, scoped to a single game.
--
-- Stored alongside the game so a player who plays in multiple sessions
-- can use different handles for each (e.g. a different Venmo from a
-- different phone). Looked up at render time to attach Venmo / Zelle
-- icons to settlement rows where the WINNER (recipient) has handles
-- registered. The losers' clients then fire the deep links with the
-- right amount + recipient.
--
-- Either field may be null — players can register Venmo only, Zelle
-- only, both, or neither. Composite PK on (game_id, player_id) so each
-- player has at most one row per game.

CREATE TABLE player_payment_methods (
  game_id           TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id         TEXT NOT NULL,
  -- Stored without the leading '@'; the client adds it when displaying.
  venmo_username    TEXT,
  -- Either an email address or a US phone number. The kind disambiguates.
  zelle_handle      TEXT,
  zelle_handle_kind TEXT CHECK (zelle_handle_kind IS NULL OR zelle_handle_kind IN ('email', 'phone')),
  updated_at        INTEGER NOT NULL,
  updated_by        TEXT,
  PRIMARY KEY (game_id, player_id),
  CHECK (
    (zelle_handle IS NULL AND zelle_handle_kind IS NULL)
    OR (zelle_handle IS NOT NULL AND zelle_handle_kind IS NOT NULL)
  )
);

CREATE INDEX idx_player_payment_methods_game ON player_payment_methods(game_id);
