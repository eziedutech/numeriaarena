-- The leaderboards: My Class, and Global across the classes that take part.
-- A class takes part unless its teacher turns it off; Global shows only a
-- seat's pseudonym and its class's grade.

ALTER TABLE classes ADD COLUMN on_global BOOLEAN NOT NULL DEFAULT true;

-- A month's results across every class, for Global.
CREATE INDEX match_seat_results_at ON match_seat_results (created_at);
CREATE INDEX seat_plays_at ON seat_plays (played_at);
