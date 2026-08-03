-- Hermes persona picker (Problem 7): persona is chosen once per Hermes
-- session (not per-message) and persisted alongside the Hermes-generated
-- session id it already tracks.
ALTER TABLE hermes_state ADD COLUMN IF NOT EXISTS persona VARCHAR(32) NOT NULL DEFAULT 'helpful';
