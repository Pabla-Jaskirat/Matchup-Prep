-- Pre-computed answers. The web app reads only these tables -- it never
-- touches `pitches`, so a page load is a primary-key lookup against a few
-- thousand rows rather than a scan of 696,100.
--
-- aggregate.py rewrites one (method, season) slice at a time, which is why
-- that pair leads every primary key.
--
-- Two departures from the sketch in PLAN.md, both forced by what shape_id
-- turned out to be:
--
--   * shape_id is text ('R-CU-2'), not integer.
--   * It is unique only within a method, so the foreign key is composite.
--     `REFERENCES pitch_shapes(shape_id)` could not have been created.

-- Every rate is stored beside the counts it came from. The 75-pitch rule is
-- applied when the page is rendered, not when the table is built, so the row
-- has to carry its own denominators -- and a coach asking "out of how many?"
-- gets an answer instead of a percentage.

CREATE TABLE hitter_shape_stats (
    method    text     NOT NULL,
    season    smallint NOT NULL,
    batter_id integer  NOT NULL REFERENCES players (mlbam_id),

    -- The side he batted from on those pitches. A switch-hitter is two rows:
    -- his numbers against a lefty and against a righty are different numbers,
    -- and which one applies is decided by tonight's starter.
    stand     char(1)  NOT NULL,
    shape_id  text     NOT NULL,

    pitches_seen integer NOT NULL,
    swings       integer NOT NULL,
    whiffs       integer NOT NULL,
    out_of_zone  integer NOT NULL,   -- excludes untracked pitches, never assumes
    chases       integer NOT NULL,
    batted_balls integer NOT NULL,

    -- NULL means "no denominator", which is not the same as 0.0.
    whiff_rate    numeric(5,4),
    chase_rate    numeric(5,4),
    avg_est_woba  numeric(5,4),
    avg_exit_velo numeric(4,1),

    PRIMARY KEY (method, season, batter_id, stand, shape_id),
    FOREIGN KEY (method, shape_id) REFERENCES pitch_shapes (method, shape_id)
        ON DELETE CASCADE
);


-- The baseline every hitter number is read against. Without it, "22% whiff
-- rate" is a number with no meaning; with it, the page can say "worse than
-- most hitters against this pitch".

CREATE TABLE league_shape_stats (
    method   text     NOT NULL,
    season   smallint NOT NULL,
    stand    char(1)  NOT NULL,
    shape_id text     NOT NULL,

    pitches_seen integer NOT NULL,
    swings       integer NOT NULL,
    whiffs       integer NOT NULL,
    out_of_zone  integer NOT NULL,
    chases       integer NOT NULL,
    batted_balls integer NOT NULL,

    whiff_rate   numeric(5,4),
    chase_rate   numeric(5,4),
    avg_est_woba numeric(5,4),

    PRIMARY KEY (method, season, stand, shape_id),
    FOREIGN KEY (method, shape_id) REFERENCES pitch_shapes (method, shape_id)
        ON DELETE CASCADE
);


-- Optional: the Day 6 heatmap, first thing to cut. Splitting a shape nine ways
-- divides an already thin sample by nine, so most cells here will be too small
-- to report -- which is the point of storing the counts.

CREATE TABLE hitter_shape_zone_stats (
    method    text     NOT NULL,
    season    smallint NOT NULL,
    batter_id integer  NOT NULL REFERENCES players (mlbam_id),
    stand     char(1)  NOT NULL,
    shape_id  text     NOT NULL,
    zone      smallint NOT NULL,

    pitches_seen integer NOT NULL,
    swings       integer NOT NULL,
    whiffs       integer NOT NULL,

    PRIMARY KEY (method, season, batter_id, stand, shape_id, zone),
    FOREIGN KEY (method, shape_id) REFERENCES pitch_shapes (method, shape_id)
        ON DELETE CASCADE
);
