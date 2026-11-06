ALTER TABLE elections DROP CONSTRAINT elections_threshold_check;
ALTER TABLE elections ADD CONSTRAINT elections_threshold_check CHECK (threshold >= 1);
