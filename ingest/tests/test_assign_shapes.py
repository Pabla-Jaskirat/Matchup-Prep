"""Reading the assignment coverage report.

The assignment itself is one SQL statement, so these tests cover the part that
decides whether its result is acceptable -- in particular, telling an expected
miss (a pitch type too rare to have earned a shape) apart from an unexpected
one (a hole in the bands), which look identical in a raw count.
"""

import assign_shapes as asg

KNOWN = {("R", "FF"), ("R", "CU"), ("L", "SL")}


def test_coverage_is_the_share_of_typed_pitches_assigned():
    assert asg.coverage_pct(assigned=683_797, typed=695_000) == 98.4


def test_coverage_of_nothing_is_zero_rather_than_a_crash():
    assert asg.coverage_pct(assigned=0, typed=0) == 0.0


def test_a_rare_pitch_type_is_an_expected_miss():
    # Knuckleballs never reach 5,000 league pitches, so no shape exists for
    # them and their pitches are correctly left unassigned.
    lines = asg.explain_unassigned({("R", "KN"): 412}, KNOWN)
    assert lines == ["  R KN    412  no shape (group under the 5,000-pitch floor)"]


def test_a_gap_in_a_banded_group_is_flagged_as_unexpected():
    # This type HAS shapes, so an unassigned pitch means the bands do not
    # cover the number line -- a bug, not a rarity.
    lines = asg.explain_unassigned({("R", "FF"): 3}, KNOWN)
    assert "UNEXPECTED" in lines[0]


def test_unexpected_misses_are_reported_before_expected_ones():
    # The alarming line should not be buried under a list of rare pitch types.
    lines = asg.explain_unassigned({("R", "KN"): 9_000, ("R", "CU"): 2}, KNOWN)
    assert "UNEXPECTED" in lines[0]


def test_nothing_unassigned_reports_nothing():
    assert asg.explain_unassigned({}, KNOWN) == []


def test_a_group_with_shapes_is_matched_on_hand_as_well_as_type():
    # 'SL' has shapes for lefties only in this fixture. A righty slider going
    # unassigned would be a real gap, and must not be excused by the type
    # alone appearing somewhere in the known set.
    lines = asg.explain_unassigned({("R", "SL"): 5}, KNOWN)
    assert "no shape" in lines[0]
