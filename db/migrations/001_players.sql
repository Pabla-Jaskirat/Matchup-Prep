-- Players. Deliberately has NO batting hand: switch-hitters bat from the side
-- opposite whoever is pitching, so batting side is a property of the pitch
-- (pitches.stand), not of the player.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE players (
    mlbam_id   integer PRIMARY KEY,
    full_name  text NOT NULL,
    throws     char(1),                      -- pitchers only: 'L' / 'R'
    team       text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Day 4 needs a fast "type a few letters of a pitcher's name" search.
CREATE INDEX players_name_trgm_idx ON players USING gin (full_name gin_trgm_ops);
