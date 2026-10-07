-- Verifying teachers (docs/SKEMA-PENGGUNA.md 3.2): a pending organizer sends
-- facts an admin can check that they teach at a school, never documents. An
-- admin may ask for more (needs_info) or refuse (rejected), with a note the
-- organizer reads on their page.
ALTER TABLE organizer_approvals DROP CONSTRAINT organizer_approvals_status_check;
ALTER TABLE organizer_approvals ADD CONSTRAINT organizer_approvals_status_check
    CHECK (status IN ('pending', 'needs_info', 'approved', 'rejected', 'suspended'));
ALTER TABLE organizer_approvals ADD COLUMN note TEXT NOT NULL DEFAULT '';

CREATE TABLE teacher_proofs (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    school TEXT NOT NULL,
    city TEXT NOT NULL,
    -- The school's number in Indonesia's school register, empty elsewhere.
    npsn TEXT NOT NULL DEFAULT '',
    teacher_role TEXT NOT NULL,
    -- At least one of these two: a school page naming the teacher, or the
    -- teacher's school email.
    proof_url TEXT NOT NULL DEFAULT '',
    school_email TEXT NOT NULL DEFAULT '',
    -- How the head of the school can be reached to confirm, if given.
    head_contact TEXT NOT NULL DEFAULT '',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
