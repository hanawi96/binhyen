-- Migration number: 0014 	 2026-10-24T04:40:00.000Z

-- Khao sat tren the: dap an + phieu (mot lan / actor / bai).

CREATE TABLE IF NOT EXISTS poll_options (
  content_id TEXT NOT NULL,
  option_id TEXT NOT NULL CHECK (
    length(option_id) BETWEEN 1 AND 40
  ),
  label TEXT NOT NULL CHECK (
    length(label) BETWEEN 1 AND 120
  ),
  sort_order INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (content_id, option_id),

  FOREIGN KEY (content_id)
    REFERENCES contents(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_options_content
ON poll_options(content_id, sort_order, option_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  content_id TEXT NOT NULL,
  actor_id TEXT NOT NULL CHECK (
    length(actor_id) BETWEEN 16 AND 80
  ),
  option_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  PRIMARY KEY (content_id, actor_id),

  FOREIGN KEY (content_id, option_id)
    REFERENCES poll_options(content_id, option_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_option
ON poll_votes(content_id, option_id);
