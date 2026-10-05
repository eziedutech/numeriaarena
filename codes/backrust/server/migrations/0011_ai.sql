-- The AI gateway: providers an admin registers, which provider and model
-- each task uses, the monthly budget, and one row for every call.

CREATE TABLE ai_providers (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_-]{2,32}$'),
    label TEXT NOT NULL,
    -- 'openai': any OpenAI-compatible Chat Completions; 'bedrock': the Converse API.
    kind TEXT NOT NULL CHECK (kind IN ('openai', 'bedrock')),
    base_url TEXT NOT NULL CHECK (
        base_url ~ '^https://[^/]'
        OR base_url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/|$)'
    ),
    -- AES-256-GCM under the server's AI_MASTER_KEY: nonce then sealed key.
    key_cipher BYTEA,
    key_tail TEXT NOT NULL DEFAULT '',
    -- Only a provider ticked here may be sent anything made from students' answers.
    student_data BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    last_test JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_task_bindings (
    task TEXT NOT NULL,
    -- 0 is tried first, then 1 and 2.
    rank SMALLINT NOT NULL CHECK (rank BETWEEN 0 AND 2),
    -- A provider still holding a task cannot be deleted.
    provider_id BIGINT NOT NULL REFERENCES ai_providers (id) ON DELETE RESTRICT,
    model TEXT NOT NULL CHECK (model <> ''),
    max_tokens INTEGER NOT NULL DEFAULT 8000 CHECK (max_tokens BETWEEN 16 AND 64000),
    temperature REAL CHECK (temperature BETWEEN 0 AND 2),
    -- Micro-USD for a million tokens in and out.
    price_in BIGINT NOT NULL DEFAULT 0 CHECK (price_in >= 0),
    price_out BIGINT NOT NULL DEFAULT 0 CHECK (price_out >= 0),
    PRIMARY KEY (task, rank)
);

CREATE TABLE ai_settings (
    one BOOLEAN PRIMARY KEY DEFAULT true CHECK (one),
    -- Micro-USD a calendar month (UTC); 50 USD to begin with.
    monthly_budget BIGINT NOT NULL DEFAULT 50000000 CHECK (monthly_budget >= 0)
);

INSERT INTO ai_settings DEFAULT VALUES;

-- Never the prompt or the answer: what was asked of whom, and what it cost.
CREATE TABLE ai_calls (
    id BIGSERIAL PRIMARY KEY,
    task TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    -- Held from the budget before the call, replaced by the cost once it answers.
    reserved BIGINT NOT NULL,
    cost BIGINT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    latency_ms INTEGER,
    outcome TEXT NOT NULL DEFAULT 'pending',
    finish_reason TEXT,
    detail TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_calls_at ON ai_calls (at);
