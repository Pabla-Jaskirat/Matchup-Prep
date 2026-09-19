-- Position on players, so the hitter pool is a query rather than a list of
-- names someone has to remember to update.
--
-- `team` already exists but has been NULL on every row: build_players.py asked
-- StatsAPI's /people endpoint for currentTeam, which that endpoint returns as
-- null unless the request hydrates it. Nothing errored and no check asserted on
-- it, so the gap sat there silently. build_roster.py fills it from the roster
-- endpoint, where the team is not an optional extra but the whole question.

ALTER TABLE players ADD COLUMN position text;

-- The main screen's first query: the Blue Jays who hit.
CREATE INDEX players_team_position_idx ON players (team, position);
