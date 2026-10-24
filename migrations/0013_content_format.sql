-- Migration number: 0013 	 2026-10-24T04:30:00.000Z

-- Dinh dang hien thi cua bai: chu / anh / video / khao sat.
-- Buoc nay chi dung 'text'; cac dinh dang khac mo sau, CHECK chuan bi san.

ALTER TABLE contents
ADD COLUMN format TEXT NOT NULL DEFAULT 'text'
  CHECK (format IN ('text', 'image', 'video', 'poll'));

UPDATE contents
SET format = 'text'
WHERE format IS NULL OR format = '';
