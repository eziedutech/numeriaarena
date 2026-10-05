-- MY FOLD TOWN of a seat: every change the student made, in the order the
-- server took it, and what stands now (worked out again from the changes
-- after each batch), so City Builder can sum finished buildings in SQL.

CREATE TABLE town_events (
    seq           BIGSERIAL PRIMARY KEY,
    class_seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    event_id      TEXT NOT NULL,
    event         JSONB NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_seat_id, event_id)
);

CREATE TABLE town_items (
    class_seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    place_id      TEXT NOT NULL,
    asset         TEXT NOT NULL,
    price         INTEGER NOT NULL,
    ready_at      TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (class_seat_id, place_id)
);

CREATE INDEX town_items_ready ON town_items (ready_at);
