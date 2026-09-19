-- What each pitcher actually throws, precomputed.
--
-- The whole point of 005 is that the web app never scans `pitches`. But the
-- main screen has to start from "what is tonight's starter's arsenal?", and
-- `shape_assignments` carries no pitcher_id -- it is keyed by the pitch's
-- natural key alone. Answering the arsenal question from the raw tables means
-- joining 683,797 assignment rows to `pitches` on every page load.
--
-- So it becomes the fourth aggregate. One row per pitcher per shape.
--
-- season_pitches is the pitcher's whole 2026 season, assigned or not, and is
-- deliberately repeated on every row. The arsenal floor is a share, and the
-- honest denominator is everything he threw -- not everything he threw that
-- happened to land in a shape. A pitcher whose splitter is below the league
-- floor should see his other shares shrink accordingly, not be told he throws
-- 8% splitters when he throws 6%.

CREATE TABLE pitcher_shape_stats (
    method     text     NOT NULL,
    season     smallint NOT NULL,
    pitcher_id integer  NOT NULL REFERENCES players (mlbam_id),
    shape_id   text     NOT NULL,

    pitches        integer NOT NULL,
    season_pitches integer NOT NULL,   -- all his 2026 pitches, shaped or not

    PRIMARY KEY (method, season, pitcher_id, shape_id),
    FOREIGN KEY (method, shape_id) REFERENCES pitch_shapes (method, shape_id)
        ON DELETE CASCADE,

    CHECK (pitches > 0),
    CHECK (pitches <= season_pitches)
);
