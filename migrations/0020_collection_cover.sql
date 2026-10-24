-- Migration number: 0020 	 2026-10-24T12:40:00.000Z

-- Anh bia tuy chon cho bo suu tap.

ALTER TABLE collections ADD COLUMN cover_url TEXT NOT NULL DEFAULT '' CHECK (
  length(cover_url) <= 500
);

ALTER TABLE collections ADD COLUMN cover_alt TEXT NOT NULL DEFAULT '' CHECK (
  length(cover_alt) <= 160
);
