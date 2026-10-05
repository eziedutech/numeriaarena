-- A race on the classroom's smartboard: three students of the class at one
-- screen, saved by the signed-in teacher who watched it. Its answers count
-- with the class's own races in the report.

ALTER TABLE seat_answers DROP CONSTRAINT seat_answers_mode_check;
ALTER TABLE seat_answers ADD CONSTRAINT seat_answers_mode_check
    CHECK (mode IN ('practice', 'race', 'board'));

ALTER TABLE seat_plays DROP CONSTRAINT seat_plays_kind_check;
ALTER TABLE seat_plays ADD CONSTRAINT seat_plays_kind_check
    CHECK (kind IN ('race', 'practice', 'board'));
