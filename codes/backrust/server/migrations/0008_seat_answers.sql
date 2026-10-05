-- Answers a student gives on their own (practice, races with robots), sent
-- from the device once signed in to a seat. Kept apart from class matches.

CREATE TABLE seat_answers (
    class_seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    -- The device's id for the answer, so sending it again stores it once.
    event_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('practice', 'race')),
    skill TEXT NOT NULL,
    template_id TEXT NOT NULL,
    correct BOOLEAN NOT NULL,
    attempt SMALLINT NOT NULL,
    time_ms INTEGER NOT NULL,
    misconception TEXT,
    event JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_seat_id, event_id)
);

CREATE INDEX seat_answers_recent ON seat_answers (class_seat_id, received_at DESC);
