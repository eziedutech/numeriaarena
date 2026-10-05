-- How a race room was set up: its games, rounds of how many seconds, and
-- level. Rooms from before have none: they raced the usual race.
ALTER TABLE rooms ADD COLUMN setup JSONB;
