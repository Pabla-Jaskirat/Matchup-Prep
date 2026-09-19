-- One band per (method, hand, pitch type, lower edge).
--
-- derive_shapes.py already refuses to load a file whose bands overlap or leave
-- a gap, but that check lives in Python and only runs on the path through that
-- script. This puts the same guarantee where nothing can go around it.
--
-- NULLS NOT DISTINCT matters here: every group's slowest band has velo_min
-- NULL, and under Postgres' default rule two NULLs count as different values,
-- which would let a group acquire two open-bottom bands -- the exact shape of
-- a double-assignment bug.

ALTER TABLE pitch_shapes
    ADD CONSTRAINT pitch_shapes_band_unique
    UNIQUE NULLS NOT DISTINCT (method, p_throws, pitch_type, velo_min);
