-- FIND A RIVAL: a room of two desks for two signed-in students of one grade.

ALTER TABLE rooms DROP CONSTRAINT rooms_kind_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_kind_check CHECK (kind IN ('class', 'open', 'duel'));
