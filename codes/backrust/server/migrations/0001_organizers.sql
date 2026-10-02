-- Adults who sign in (organizers, admins), their organizations, and the
-- self-registration gate (docs/SKEMA-PENGGUNA.md sections 3.2 and 5).
-- Students never appear here.

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    firebase_uid TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    sign_in_provider TEXT NOT NULL DEFAULT '',
    global_role TEXT NOT NULL DEFAULT 'none' CHECK (global_role IN ('none', 'admin', 'content_admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_email ON users (lower(email));

CREATE TABLE organizations (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('school', 'tutoring', 'community', 'event', 'personal')),
    country TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    org_id BIGINT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'organizer', 'assistant')),
    PRIMARY KEY (user_id, org_id)
);

CREATE TABLE organizer_approvals (
    user_id BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'suspended')),
    path TEXT NOT NULL CHECK (path IN ('self', 'manual', 'school_domain', 'invite')),
    approved_by BIGINT REFERENCES users (id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consents (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    group_id BIGINT,
    kind TEXT NOT NULL CHECK (kind IN ('organizer_terms', 'group_parental_responsibility')),
    terms_version TEXT NOT NULL,
    agreed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor BIGINT REFERENCES users (id),
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
