-- 0006 · per-game note for the Venmo deep-link `note=` query param.
--
-- Free-text, optional. Defaults to NULL (the application layer falls
-- back to "poker night" when null/empty). Set at finalize time and
-- editable post-finalize via PATCH /api/games/:id/note. Survives the
-- finalize lock — it's a per-user UX setting, not game state.

ALTER TABLE games ADD COLUMN note TEXT;
