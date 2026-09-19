-- Pitch shapes: (pitcher hand, pitch type, velocity band).
--
-- `method` leads both primary keys on purpose. v1_type_velo bands on velocity
-- alone; a later v2 that clusters on movement can be INSERTed alongside it and
-- compared, instead of migrating over it. Nothing here assumes one definition
-- is the only one.
--
-- The band edges themselves are not decided here -- they come from
-- db/shapes/v1_type_velo.json, which derive_shapes.py loads into this table.

CREATE TABLE pitch_shapes (
    method     text     NOT NULL,       -- 'v1_type_velo'
    shape_id   text     NOT NULL,       -- 'R-CU-2'
    label      text     NOT NULL,       -- 'RHP Curveball 79-83'

    p_throws   char(1)  NOT NULL,
    pitch_type text     NOT NULL,

    -- Half-open: velo_min <= release_speed < velo_max. NULL means unbounded,
    -- so a 104 mph four-seamer still lands in the top band rather than nowhere.
    velo_min   numeric(4,1),
    velo_max   numeric(4,1),

    -- Which percentile of the group's velocity set each edge, so "why 82.6?"
    -- has an answer in the data rather than in someone's memory.
    min_percentile smallint,
    max_percentile smallint,

    season         smallint NOT NULL,   -- the season the bands were derived from
    league_pitches integer  NOT NULL,   -- pitches behind this shape at derivation
    created_at     timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (method, shape_id),

    CONSTRAINT pitch_shapes_band_ordered
        CHECK (velo_min IS NULL OR velo_max IS NULL OR velo_min < velo_max),
    CONSTRAINT pitch_shapes_hand_valid
        CHECK (p_throws IN ('L', 'R'))
);

CREATE INDEX pitch_shapes_group_idx
    ON pitch_shapes (method, p_throws, pitch_type);


-- One row per pitch per method. Materialised rather than joined on a range at
-- query time: the aggregation in Task 14 groups by shape millions of times, and
-- this turns a range predicate into an equality join.

CREATE TABLE shape_assignments (
    method        text     NOT NULL,
    game_pk       integer  NOT NULL,
    at_bat_number smallint NOT NULL,
    pitch_number  smallint NOT NULL,
    shape_id      text     NOT NULL,

    -- Same natural key as pitches, so re-running assign_shapes upserts in place
    -- instead of accumulating duplicates.
    PRIMARY KEY (method, game_pk, at_bat_number, pitch_number),

    FOREIGN KEY (game_pk, at_bat_number, pitch_number)
        REFERENCES pitches (game_pk, at_bat_number, pitch_number)
        ON DELETE CASCADE,

    FOREIGN KEY (method, shape_id)
        REFERENCES pitch_shapes (method, shape_id)
        ON DELETE CASCADE
);

-- The access path for aggregation: every pitch of one shape.
CREATE INDEX shape_assignments_shape_idx
    ON shape_assignments (method, shape_id);
