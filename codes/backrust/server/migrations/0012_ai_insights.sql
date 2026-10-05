-- AI insights for a class's teacher, kept per class and seat (0 for the
-- whole class) with a hash of the numbers they were made from: the same
-- numbers are never sent to a provider twice.
CREATE TABLE ai_insights (
    class_id TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    seat SMALLINT NOT NULL,
    data_hash TEXT NOT NULL,
    value JSONB NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, seat)
);

CREATE INDEX ai_insights_created ON ai_insights (created_at);
