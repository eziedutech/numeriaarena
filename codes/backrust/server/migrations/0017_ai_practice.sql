-- AI practice plans for one student, kept per class and seat with a hash of
-- the numbers they were made from, the same way as ai_insights.
CREATE TABLE ai_practice (
    class_id TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    seat SMALLINT NOT NULL,
    data_hash TEXT NOT NULL,
    value JSONB NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, seat)
);

CREATE INDEX ai_practice_created ON ai_practice (created_at);
