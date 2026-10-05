-- TRY THE TEACHER PAGE: a sample teacher for one visitor, with a class that
-- has already played, gone after a day.
ALTER TABLE organizer_approvals DROP CONSTRAINT organizer_approvals_path_check;
ALTER TABLE organizer_approvals ADD CONSTRAINT organizer_approvals_path_check
    CHECK (path IN ('self', 'manual', 'school_domain', 'invite', 'demo'));

CREATE TABLE demo_teachers (
    -- Only the token's hash is kept, like a seat's.
    token_hash TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX demo_teachers_expires ON demo_teachers (expires_at);
