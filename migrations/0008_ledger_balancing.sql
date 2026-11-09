ALTER TABLE live_games ADD COLUMN ledger_balancing TEXT NOT NULL DEFAULT '{"method":"winnings"}';
ALTER TABLE games ADD COLUMN ledger_balancing TEXT;
