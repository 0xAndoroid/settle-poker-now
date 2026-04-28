-- 0002 · player aliases
-- Lets the user fold one PokerNow player_id into another (e.g. someone
-- reconnected mid-session under a fresh nickname). The aliased player
-- disappears from the active roster; their net is added to the target.
-- Settlement, isolation rules, and adjustments all run on the COLLAPSED
-- roster. Removing the alias restores the original separate balances.

CREATE TABLE player_aliases (
  game_id            TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  -- The player being aliased ("the duplicate") — disappears from the
  -- active roster after this rule applies.
  player_id          TEXT NOT NULL,
  -- The canonical target whose net absorbs the duplicate's net. We
  -- canonicalize on insert (chain compression), so this never points
  -- to another aliased player at write time.
  alias_to_player_id TEXT NOT NULL,
  created_at         INTEGER NOT NULL,
  created_by         TEXT,
  PRIMARY KEY (game_id, player_id),
  CHECK (player_id != alias_to_player_id)
);

CREATE INDEX idx_player_aliases_game ON player_aliases(game_id);
CREATE INDEX idx_player_aliases_target ON player_aliases(game_id, alias_to_player_id);
