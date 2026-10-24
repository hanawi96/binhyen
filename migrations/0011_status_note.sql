-- Migration number: 0011 	 2026-10-24T07:50:00.000Z

-- Ly do ngan khi quan tri tu choi bai; nguoi viet doc duoc.

ALTER TABLE content_status_events ADD COLUMN note TEXT CHECK (
  note IS NULL OR length(note) BETWEEN 1 AND 300
);
