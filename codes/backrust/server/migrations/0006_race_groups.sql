-- A room for a class has six desks, so a bigger class races in groups, one
-- group a match. A seat is in the group of its number (01 to 06 group A,
-- 07 to 12 group B, ...) unless the teacher put it in another; 0 is group A.

ALTER TABLE class_seats ADD COLUMN race_group SMALLINT CHECK (race_group BETWEEN 0 AND 7);

-- The group that raced in a match of a class's room; null in other rooms.
ALTER TABLE matches ADD COLUMN race_group SMALLINT;
