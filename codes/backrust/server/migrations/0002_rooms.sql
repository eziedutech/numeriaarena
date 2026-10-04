-- Class Match rooms, their matches, and the classmates' answers.
-- Seats carry pseudonyms only: no real names,
-- no chat. Kept 90 days for matches, 365 for answers (clean-up not yet scheduled).

CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    play_code TEXT NOT NULL,
    watch_code TEXT NOT NULL,
    seats SMALLINT NOT NULL CHECK (seats BETWEEN 1 AND 6),
    created_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
    seed BIGINT NOT NULL,
    content_pack_version TEXT NOT NULL,
    fairness_params_version TEXT NOT NULL,
    -- Each seat's pseudonym and whether a bot sat there.
    seats JSONB NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    recap JSONB
);

CREATE INDEX matches_room ON matches (room_id);

-- One row per answer; the event id makes writing again harmless.
CREATE TABLE match_answers (
    event_id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
    seat SMALLINT NOT NULL,
    event JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX match_answers_match ON match_answers (match_id);
