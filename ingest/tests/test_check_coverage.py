"""The thin-cell audit.

The question this answers is not statistical, it is about what a coach sees:
opening the page on tonight's starter, does he get numbers, or does he get a
column of "not enough data"? These functions turn the raw cells into that
answer.
"""

import check_coverage as cc

MIN = 75


# --- what a pitcher actually throws -----------------------------------------

def test_an_arsenal_is_the_shapes_he_throws_often_enough():
    # A starter's 4 pitches, plus one he has thrown twice all year. The rare
    # one is not part of tonight's plan and should not dilute the count.
    counts = {"R-FF-2": 900, "R-SL-1": 500, "R-CH-2": 300, "R-CU-1": 280, "R-FS-1": 20}
    assert cc.arsenal(counts, floor_pct=3.0) == ["R-FF-2", "R-SL-1", "R-CH-2", "R-CU-1"]


def test_the_arsenal_floor_is_a_share_not_a_count():
    # 3% of a reliever's 300 pitches is 9; 3% of a starter's 3,000 is 90. The
    # same absolute floor would treat the two completely differently.
    small = {"R-FF-2": 200, "R-SL-1": 90, "R-CH-2": 10}
    assert cc.arsenal(small, floor_pct=3.0) == ["R-FF-2", "R-SL-1", "R-CH-2"]


def test_an_arsenal_is_ordered_by_how_often_he_throws_it():
    counts = {"R-SL-1": 500, "R-FF-2": 900}
    assert cc.arsenal(counts, floor_pct=3.0) == ["R-FF-2", "R-SL-1"]


def test_a_pitcher_with_no_pitches_has_no_arsenal():
    assert cc.arsenal({}, floor_pct=3.0) == []


# --- how much of it we can actually say something about ---------------------

def test_a_shape_over_the_threshold_is_usable():
    assert cc.usable({"R-FF-2": 181, "R-SL-1": 12}, ["R-FF-2", "R-SL-1"], MIN) == 1


def test_a_shape_exactly_at_the_threshold_is_usable():
    # 75 is the floor, not the thing you must exceed.
    assert cc.usable({"R-FF-2": 75}, ["R-FF-2"], MIN) == 1


def test_a_shape_he_has_never_seen_is_not_usable():
    # Missing from the hitter's cells entirely, which is different from zero
    # but reads the same on the page: "not enough data".
    assert cc.usable({}, ["R-FF-2"], MIN) == 0


def test_only_shapes_in_tonights_arsenal_are_counted():
    # He may crush sweepers. If tonight's starter does not throw one, it is
    # not on tonight's page.
    cells = {"R-FF-2": 200, "R-ST-1": 400}
    assert cc.usable(cells, ["R-FF-2"], MIN) == 1


# --- summarising across the roster ------------------------------------------

def test_the_median_of_an_odd_number_of_hitters_is_the_middle_one():
    assert cc.median([1, 5, 3]) == 3


def test_the_median_of_an_even_number_averages_the_middle_two():
    assert cc.median([1, 2, 3, 4]) == 2.5


def test_the_median_of_nothing_is_none():
    assert cc.median([]) is None


def test_the_verdict_is_a_share_of_tonights_arsenal():
    # PLAN.md's bar was "about 4 usable shapes", written when a typical
    # arsenal was 7. That is the share it meant, and the share is stable when
    # the shape definition changes -- an absolute count is not.
    assert cc.verdict(4.0, 7.0) is True
    assert cc.verdict(3.0, 5.0) is True       # 60%, better than 4/7
    assert cc.verdict(2.0, 7.0) is False


def test_a_pitcher_with_no_arsenal_never_passes():
    assert cc.verdict(0.0, 0.0) is False


# --- which side he bats from tonight ----------------------------------------

def test_a_right_handed_hitter_uses_his_only_row():
    by_stand = {"R": {"R-FF-2": 200, "L-FF-1": 80}}
    assert cc.stand_for_hand(by_stand, "R") == "R"
    assert cc.stand_for_hand(by_stand, "L") == "R"


def test_a_switch_hitter_bats_left_against_a_righty():
    # His two rows barely overlap: batting left he has faced righties, batting
    # right he has faced lefties. Picking the wrong one reports a hitter who
    # has seen almost nothing.
    by_stand = {"L": {"R-FF-2": 300, "R-SL-1": 150},
                "R": {"L-FF-1": 120, "L-SL-2": 60}}
    assert cc.stand_for_hand(by_stand, "R") == "L"


def test_a_switch_hitter_bats_right_against_a_lefty():
    by_stand = {"L": {"R-FF-2": 300, "R-SL-1": 150},
                "R": {"L-FF-1": 120, "L-SL-2": 60}}
    assert cc.stand_for_hand(by_stand, "L") == "R"


def test_a_hitter_with_no_history_against_that_hand_has_no_side():
    by_stand = {"L": {"R-FF-2": 300}}
    assert cc.stand_for_hand(by_stand, "L") is None
