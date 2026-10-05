-- MY FOLD TOWN on the class map: each land of a seat's town is one cell of
-- the class's map. The student picks the cell of their first land; a later
-- land takes a free cell beside their own, or stays off the map when there
-- is none. A guest's town never shows here.

CREATE TABLE town_plots (
    class_id      TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
    class_seat_id BIGINT NOT NULL REFERENCES class_seats (id) ON DELETE CASCADE,
    land_index    SMALLINT NOT NULL CHECK (land_index >= 0),
    kind          TEXT NOT NULL CHECK (kind IN ('plain', 'river', 'hills', 'beach')),
    x             SMALLINT NOT NULL CHECK (x >= 0 AND x < 10),
    y             SMALLINT NOT NULL CHECK (y >= 0 AND y < 8),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_seat_id, land_index),
    UNIQUE (class_id, x, y)
);
