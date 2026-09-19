"""Reading the Blue Jays active roster.

The hitter pool is the list the main screen iterates over, so it comes from
MLB's roster endpoint rather than a hardcoded list of names -- a hardcoded
list is both wrong within a week and a thing a reviewer notices.
"""

import pytest

import build_roster as br


def entry(pid, name, pos):
    return {"person": {"id": pid, "fullName": name},
            "position": {"abbreviation": pos, "name": pos},
            "status": {"code": "A"}}


def payload(*entries):
    return {"teamId": 141, "rosterType": "active", "roster": list(entries)}


# --- turning the response into rows -----------------------------------------

def test_an_entry_becomes_one_row():
    rows = br.roster_rows(payload(entry(672386, "Alejandro Kirk", "C")), "TOR")
    assert rows == [(672386, "Alejandro Kirk", "TOR", "C")]


def test_an_empty_roster_produces_no_rows():
    assert br.roster_rows(payload(), "TOR") == []


def test_an_entry_missing_an_id_is_refused_rather_than_skipped():
    # Silently dropping a roster spot would show up later as a hitter simply
    # missing from the page, with nothing to explain why.
    broken = {"person": {"fullName": "No Id"}, "position": {"abbreviation": "C"}}
    with pytest.raises(br.RosterError, match="id"):
        br.roster_rows(payload(broken), "TOR")


def test_an_entry_missing_a_position_is_refused():
    broken = {"person": {"id": 1, "fullName": "No Position"}}
    with pytest.raises(br.RosterError, match="position"):
        br.roster_rows(payload(broken), "TOR")


# --- who counts as a hitter -------------------------------------------------

def test_a_pitcher_is_not_in_the_hitter_pool():
    rows = br.roster_rows(payload(entry(1, "A Pitcher", "P")), "TOR")
    assert br.hitters(rows) == []


def test_a_position_player_is_in_the_hitter_pool():
    rows = br.roster_rows(payload(entry(2, "A Catcher", "C")), "TOR")
    assert [r[0] for r in br.hitters(rows)] == [2]


def test_a_designated_hitter_is_in_the_hitter_pool():
    rows = br.roster_rows(payload(entry(3, "A DH", "DH")), "TOR")
    assert [r[0] for r in br.hitters(rows)] == [3]


def test_a_two_way_player_is_in_the_hitter_pool():
    # TWP pitches AND hits. Excluding everyone who pitches would drop him from
    # a page he belongs on.
    rows = br.roster_rows(payload(entry(4, "A Two-Way", "TWP")), "TOR")
    assert [r[0] for r in br.hitters(rows)] == [4]


# --- keeping the roster current ---------------------------------------------

def test_a_player_no_longer_on_the_roster_is_identified():
    # Re-running must clear `team` for someone who was traded, or he keeps
    # appearing on a Blue Jays page.
    assert br.departed(on_roster={1, 2}, recorded={1, 2, 3}) == {3}


def test_nobody_departs_when_the_roster_is_unchanged():
    assert br.departed(on_roster={1, 2}, recorded={1, 2}) == set()


def test_a_new_call_up_is_not_mistaken_for_a_departure():
    assert br.departed(on_roster={1, 2, 3}, recorded={1, 2}) == set()
