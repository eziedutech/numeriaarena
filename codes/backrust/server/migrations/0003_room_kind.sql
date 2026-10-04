-- Who starts a room's match: its teacher ('class') or everyone being ready ('open').

ALTER TABLE rooms ADD COLUMN kind TEXT NOT NULL DEFAULT 'class' CHECK (kind IN ('class', 'open'));

CREATE INDEX rooms_created_by ON rooms (created_by, created_at DESC);
