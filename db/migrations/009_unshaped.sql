-- The pitches a pitcher throws that the model cannot see.
--
-- A pitch type needs 5,000 league pitches for a shape to exist, because a
-- shape's whole purpose is to carry a league baseline -- "is this hitter worse
-- than most against this pitch?" needs a "most". Under the floor there is no
-- trustworthy baseline, so the pitch gets no shape and every pitch of it goes
-- unassigned.
--
-- Left-handed splitters are the case that matters. Shota Imanaga throws one
-- 33.7% of the time and the page could not name it: the arsenal simply did not
-- list it, and a footnote reported an anonymous "33.7% unclassified". That
-- disclosed the gap without explaining it.
--
-- So the gap becomes data too. league_pitches and league_pitchers are carried
-- along because they are the explanation: 2,242 pitches from 30 pitchers in a
-- whole season is the reason, and it is a reason a reader can check.

CREATE TABLE pitcher_unshaped_stats (
    method     text     NOT NULL,
    season     smallint NOT NULL,
    pitcher_id integer  NOT NULL REFERENCES players (mlbam_id),
    pitch_type text     NOT NULL,

    pitch_name text    NOT NULL,   -- from ingest PITCH_NAMES, the one source
    pitches    integer NOT NULL,   -- how many HE threw
    season_pitches  integer NOT NULL,

    league_pitches  integer NOT NULL,   -- how many of this (hand, type) exist
    league_pitchers integer NOT NULL,   -- how many pitchers throw it at all

    PRIMARY KEY (method, season, pitcher_id, pitch_type),
    CHECK (pitches > 0),
    CHECK (pitches <= season_pitches)
);
