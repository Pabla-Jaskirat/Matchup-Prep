-- Name search that survives accents.
--
-- 001 put a trigram index on full_name, which is enough for "skub" -> Skubal
-- but not for "gimenez" -> "Andrés Giménez". Statcast spells names with their
-- accents; nobody types them. So search runs against a normalized copy of the
-- name and the index lives there.
--
-- unaccent() is STABLE, not IMMUTABLE, because it resolves its dictionary
-- through search_path. A generated column requires IMMUTABLE, so the wrapper
-- names the dictionary explicitly and can honestly claim immutability.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

ALTER TABLE players
    ADD COLUMN search_name text
    GENERATED ALWAYS AS (immutable_unaccent(lower(full_name))) STORED;

-- gin_trgm_ops accelerates LIKE '%...%', which is what the search actually
-- runs: a coach types the letters that are in the name, not an approximation
-- of it. Similarity only breaks ties.
CREATE INDEX players_search_trgm_idx ON players USING gin (search_name gin_trgm_ops);
