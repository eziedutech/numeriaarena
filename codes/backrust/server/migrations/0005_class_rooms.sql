-- A room opened for one of the teacher's classes takes only its seats, and
-- a signed-in seat keeps what it played, in two records never added up:
-- matches in rooms (official in its class's room, unofficial in a room for
-- anyone), and plays on its own (a race against the robots, a practice),
-- which the game reports and the server cannot check.

ALTER TABLE rooms ADD COLUMN class_id TEXT REFERENCES classes (id) ON DELETE SET NULL;

CREATE TABLE match_seat_results (
    match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    -- The desk in the match (0 based), as in match_answers.
    seat SMALLINT NOT NULL,
    class_seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    -- In a room the teacher opened for the seat's class.
    official BOOLEAN NOT NULL,
    points INTEGER NOT NULL,
    folded INTEGER NOT NULL,
    place SMALLINT NOT NULL,
    stars SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, seat)
);

CREATE INDEX match_seat_results_seat ON match_seat_results (class_seat_id, created_at DESC);

CREATE TABLE seat_plays (
    class_seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    -- The game's own id for the play, so sending it again stores it once.
    client_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('race', 'practice')),
    game TEXT,
    points INTEGER NOT NULL,
    folded INTEGER NOT NULL,
    -- A race: the place among the robots and the stars.
    place SMALLINT,
    stars SMALLINT,
    -- A practice: right answers of how many.
    right_answers SMALLINT,
    total SMALLINT,
    duration_ms INTEGER NOT NULL,
    played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_seat_id, client_id)
);

CREATE INDEX seat_plays_seat ON seat_plays (class_seat_id, played_at DESC);
