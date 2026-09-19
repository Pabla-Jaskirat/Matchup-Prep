"""The aggregation, defined once in Python so the SQL can be checked against it.

aggregate.py does the real work in SQL -- 684,000 rows should not travel over
the wire to be counted. But SQL that is subtly wrong still returns numbers, and
the two mistakes that matter here both return plausible ones. So the same
definitions live here as a small pure function, and verify_aggregate.py runs
both over the same real hitters and compares.
"""

import aggregate as ag


def pitch(stand="R", shape="R-FF-1", swing=False, whiff=False,
          in_zone=True, bip=False, est_woba=None, exit_velo=None):
    return {"stand": stand, "shape_id": shape, "is_swing": swing,
            "is_whiff": whiff, "in_zone": in_zone, "is_bip": bip,
            "est_woba": est_woba, "launch_speed": exit_velo}


def only(rows):
    assert len(rows) == 1, rows
    return next(iter(rows.values()))


# --- counting ---------------------------------------------------------------

def test_it_counts_every_pitch_seen():
    assert only(ag.reference_stats([pitch(), pitch(), pitch()]))["pitches_seen"] == 3


def test_a_whiff_is_also_a_swing():
    # Whiffs are a subset of swings, not a separate outcome. If they were
    # counted separately the whiff rate could exceed 1.
    s = only(ag.reference_stats([pitch(swing=True, whiff=True)]))
    assert (s["swings"], s["whiffs"]) == (1, 1)


def test_whiff_rate_is_whiffs_over_swings():
    rows = [pitch(swing=True, whiff=True), pitch(swing=True), pitch()]
    assert only(ag.reference_stats(rows))["whiff_rate"] == 0.5


def test_whiff_rate_is_none_when_he_never_swung():
    # Not 0.0. A hitter who never swung has no whiff rate; saying 0% would
    # read as "he never misses".
    assert only(ag.reference_stats([pitch(), pitch()]))["whiff_rate"] is None


# --- the chase denominator, which is the easy thing to get wrong ------------

def test_chase_rate_is_swings_at_balls_over_balls_seen():
    rows = [pitch(in_zone=False, swing=True), pitch(in_zone=False), pitch(in_zone=True)]
    s = only(ag.reference_stats(rows))
    assert (s["out_of_zone"], s["chases"], s["chase_rate"]) == (2, 1, 0.5)


def test_an_untracked_pitch_is_not_counted_as_out_of_zone():
    # in_zone is NULL for ~0.41% of pitches -- the tracking missed them, which
    # is not the same as the pitch being a ball. Treating unknown as
    # out-of-zone inflates the denominator and deflates every chase rate.
    rows = [pitch(in_zone=False, swing=True), pitch(in_zone=None)]
    s = only(ag.reference_stats(rows))
    assert s["out_of_zone"] == 1
    assert s["chase_rate"] == 1.0


def test_an_untracked_pitch_still_counts_as_a_pitch_seen():
    # It is excluded from the chase denominator, not from the sample.
    s = only(ag.reference_stats([pitch(in_zone=None), pitch(in_zone=None)]))
    assert s["pitches_seen"] == 2


def test_chase_rate_is_none_when_nothing_was_out_of_zone():
    assert only(ag.reference_stats([pitch(in_zone=True)]))["chase_rate"] is None


# --- a switch-hitter is two rows -------------------------------------------

def test_the_two_sides_of_a_switch_hitter_are_separate_rows():
    # `stand` is a property of the pitch, not the player. His numbers batting
    # left and batting right are different numbers, and which applies tonight
    # is decided by the starter's hand.
    rows = ag.reference_stats([pitch(stand="L", swing=True, whiff=True),
                               pitch(stand="R", swing=True)])
    assert sorted(rows) == [("L", "R-FF-1"), ("R", "R-FF-1")]
    assert rows[("L", "R-FF-1")]["whiff_rate"] == 1.0
    assert rows[("R", "R-FF-1")]["whiff_rate"] == 0.0


def test_each_shape_is_its_own_row():
    rows = ag.reference_stats([pitch(shape="R-FF-1"), pitch(shape="R-SL-2")])
    assert sorted(rows) == [("R", "R-FF-1"), ("R", "R-SL-2")]


# --- contact quality --------------------------------------------------------

def test_expected_woba_averages_only_the_pitches_that_have_one():
    # est_woba exists on contact. Averaging NULLs in as zeroes would make every
    # hitter look worse the more he takes.
    rows = [pitch(bip=True, est_woba=0.5), pitch(bip=True, est_woba=0.3), pitch()]
    assert only(ag.reference_stats(rows))["avg_est_woba"] == 0.4


def test_exit_velocity_averages_only_batted_balls():
    rows = [pitch(bip=True, exit_velo=100.0), pitch(bip=True, exit_velo=90.0), pitch()]
    assert only(ag.reference_stats(rows))["avg_exit_velo"] == 95.0


def test_contact_quality_is_none_when_he_never_put_one_in_play():
    s = only(ag.reference_stats([pitch(), pitch()]))
    assert s["avg_est_woba"] is None and s["avg_exit_velo"] is None


def test_batted_balls_are_counted():
    rows = [pitch(bip=True, exit_velo=95.0), pitch(swing=True), pitch()]
    assert only(ag.reference_stats(rows))["batted_balls"] == 1


# --- rates are stored at the precision the column holds ---------------------

def test_a_rate_is_rounded_to_four_places():
    # numeric(5,4). Rounding here rather than at read time means the stored
    # value and the compared value are the same number.
    rows = [pitch(swing=True, whiff=True)] + [pitch(swing=True)] * 2
    assert only(ag.reference_stats(rows))["whiff_rate"] == 0.3333


def test_a_half_rounds_up_the_way_the_database_does():
    # Postgres rounds a half away from zero; Python's round() rounds it to the
    # nearest even digit. 73.05 is 73.1 in SQL and would be 73.0 here. The
    # reference has to match the database, or the cross-check reports
    # differences that are only about rounding.
    rows = [pitch(bip=True, exit_velo=73.0), pitch(bip=True, exit_velo=73.1)]
    assert only(ag.reference_stats(rows))["avg_exit_velo"] == 73.1


def test_a_rate_landing_exactly_on_a_half_also_rounds_up():
    # 13/32 = 0.40625 -> 0.4063, not 0.4062.
    rows = ([pitch(in_zone=False, swing=True)] * 13
            + [pitch(in_zone=False)] * 19)
    assert only(ag.reference_stats(rows))["chase_rate"] == 0.4063
