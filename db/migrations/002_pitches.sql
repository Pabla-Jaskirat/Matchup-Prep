-- One row per pitch thrown. ~700k rows per season.
--
-- The primary key comes from the game itself, not from a sequence, which is
-- what makes the loader idempotent: re-loading the same pitch updates one row
-- instead of inserting a second.

CREATE TABLE pitches (
    game_pk       integer  NOT NULL,
    at_bat_number smallint NOT NULL,
    pitch_number  smallint NOT NULL,
    game_date     date     NOT NULL,

    pitcher_id    integer  NOT NULL,
    batter_id     integer  NOT NULL,
    p_throws      char(1)  NOT NULL,
    stand         char(1)  NOT NULL,   -- batter's side on THIS pitch (switch-hitters)

    pitch_type    text,                -- nullable: Statcast has genuine gaps
    release_speed numeric(4,1),
    pfx_x         numeric(5,3),        -- horizontal break, feet, catcher's view
    pfx_z         numeric(5,3),        -- vertical break, feet
    spin_rate     integer,
    extension     numeric(4,2),

    plate_x       numeric(5,3),
    plate_z       numeric(5,3),
    zone          smallint,            -- Savant: 1-9 inside the zone, 11-14 outside

    balls         smallint,
    strikes       smallint,
    description   text NOT NULL,       -- 'swinging_strike', 'foul', 'ball', ...
    events        text,

    launch_speed  numeric(4,1),
    est_woba      numeric(5,4),        -- xwOBA on contact

    season smallint GENERATED ALWAYS AS (
        EXTRACT(year FROM game_date)::smallint) STORED,

    -- Defined once here so no query has to remember the rules.
    is_swing boolean GENERATED ALWAYS AS (
        description IN ('swinging_strike', 'swinging_strike_blocked', 'foul',
                        'foul_tip', 'hit_into_play')) STORED,

    is_whiff boolean GENERATED ALWAYS AS (
        description IN ('swinging_strike', 'swinging_strike_blocked',
                        'foul_tip')) STORED,

    -- NULL when the pitch wasn't tracked. Aggregation must exclude NULLs from
    -- chase-rate denominators rather than treating unknown as out-of-zone.
    in_zone boolean GENERATED ALWAYS AS (zone BETWEEN 1 AND 9) STORED,

    is_bip boolean GENERATED ALWAYS AS (description = 'hit_into_play') STORED,

    PRIMARY KEY (game_pk, at_bat_number, pitch_number)
);

CREATE INDEX pitches_pitcher_idx ON pitches (pitcher_id, season);
CREATE INDEX pitches_batter_idx  ON pitches (batter_id, season, stand);
