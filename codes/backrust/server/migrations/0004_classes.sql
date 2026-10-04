-- MY CLASSES: a teacher's standing classes and their numbered seats.
-- A seat keeps one pseudonym all year; a student signs in to it with the
-- class code, the seat number and a picture password (three of nine
-- pictures, stored only as a salted hash). Real names never reach the server.

CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    owner BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- The teacher's own label, such as "5B": about the class, not a student.
    label TEXT NOT NULL,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 9),
    school_year TEXT NOT NULL DEFAULT '',
    join_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX classes_owner ON classes (owner, created_at DESC);
-- A code belongs to one active class; an archived class lets go of it.
CREATE UNIQUE INDEX classes_join_code ON classes (join_code) WHERE status = 'active';

CREATE TABLE class_seats (
    id BIGSERIAL PRIMARY KEY,
    class_id TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    number SMALLINT NOT NULL CHECK (number BETWEEN 1 AND 99),
    pseudonym TEXT NOT NULL,
    picture_salt TEXT NOT NULL,
    picture_hash TEXT NOT NULL,
    -- Wrong pictures since the last lock, and since the last right one.
    tries SMALLINT NOT NULL DEFAULT 0,
    wrong SMALLINT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    -- Too many wrong pictures: only the teacher opens the seat again.
    teacher_lock BOOLEAN NOT NULL DEFAULT false,
    last_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, number),
    UNIQUE (class_id, pseudonym)
);

-- A signed-in device. Only the token's hash is kept.
CREATE TABLE seat_sessions (
    token_hash TEXT PRIMARY KEY,
    seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX seat_sessions_seat ON seat_sessions (seat_id);
