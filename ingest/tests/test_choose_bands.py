"""The banding rule, tested without a database.

Task 10 is the only place a human decision enters the pipeline: how many
velocity slices each pitch type gets. The decision lives in these functions
and its output lives in db/shapes/<method>.json, so both the rule and the
data it produced can be argued with later.
"""

import choose_bands as cb


# --- how many bands a group earns -------------------------------------------
#
# The shipped rule does not split on speed at all. That is a measured result,
# not a simplification: grouping by hand + pitch type captured 5.0 points of
# real hitter-by-pitch difference, and adding a speed band captured 4.9, while
# costing 12 Blue Jays cells that no longer cleared the 50-pitch floor. See
# `make reliability`.
#
# The splitting rule is kept as an option rather than deleted, so the rejected
# experiment can be re-run -- `choose_bands.py --split-above-iqr 5.0` rebuilds
# the 20-shape file the comparison was made against.


def test_speed_does_not_split_a_group_by_default():
    # Even RHP curveballs, the widest-spreading pitch that was ever split.
    assert cb.band_count(5.6) == 1


def test_a_tight_group_gets_one_band():
    assert cb.band_count(2.0) == 1


def test_the_old_rule_still_splits_when_asked_for():
    # RHP curveballs: some are 73, some are 87. Wide enough that the old rule
    # split them, which is what makes it the interesting case to reproduce.
    assert cb.band_count(5.6, split_above_iqr=5.0) == 3


def test_the_old_threshold_is_inclusive():
    # "> 5.0 -> 3 bands", so a group sitting exactly on 5.0 stays whole.
    assert cb.band_count(5.0, split_above_iqr=5.0) == 1


def test_a_moderate_group_is_left_whole_under_the_old_rule_too():
    # RHP sliders, IQR 3.5: a "slow" one is 85 and a "fast" one is 88, which
    # is the same pitch.
    assert cb.band_count(3.5, split_above_iqr=5.0) == 1


# --- where the cuts go ------------------------------------------------------

def test_one_band_has_no_cuts():
    assert cb.cut_percentiles(1) == []


def test_two_bands_split_at_the_median():
    # No group takes two bands under the current rule, but collapse_under_floor
    # can produce a two-band result from three, so the shape stays defined.
    assert cb.cut_percentiles(2) == [50]


def test_three_bands_split_at_the_thirds():
    assert cb.cut_percentiles(3) == [33, 67]


# --- turning cuts into half-open ranges -------------------------------------

def test_the_outer_bands_are_unbounded():
    # A 104 mph fastball must land somewhere. Open ends mean no pitch of the
    # right type is ever orphaned by a velocity outlier.
    bands = cb.make_bands([(95.2, 50)])
    assert bands[0]["velo_min"] is None
    assert bands[-1]["velo_max"] is None


def test_each_cut_becomes_a_shared_boundary():
    bands = cb.make_bands([(78.9, 33), (82.6, 67)])
    assert [b["velo_min"] for b in bands] == [None, 78.9, 82.6]
    assert [b["velo_max"] for b in bands] == [78.9, 82.6, None]


def test_a_boundary_remembers_the_percentile_that_set_it():
    # So a reviewer can ask "why 82.6?" and the file answers "p67".
    bands = cb.make_bands([(78.9, 33), (82.6, 67)])
    assert bands[0]["max_percentile"] == 33
    assert bands[1]["min_percentile"] == 33
    assert bands[1]["max_percentile"] == 67


# --- counting pitches into the bands ----------------------------------------

def test_a_pitch_on_the_boundary_lands_in_the_upper_band():
    # Half-open: velo_min <= speed < velo_max. Closed bands would count the
    # boundary pitch twice.
    bands = cb.make_bands([(90.0, 50)])
    cb.count_bands([89.9, 90.0, 90.1], bands)
    assert [b["pitches"] for b in bands] == [1, 2]


def test_every_pitch_is_counted_exactly_once():
    bands = cb.make_bands([(80.0, 33), (85.0, 67)])
    speeds = [70.0, 79.9, 80.0, 84.9, 85.0, 99.0]
    cb.count_bands(speeds, bands)
    assert sum(b["pitches"] for b in bands) == len(speeds)


# --- the sample-size floor overrules the spread -----------------------------

def test_a_thin_band_is_merged_into_its_neighbour():
    bands = [
        {"velo_min": None, "velo_max": 85.0, "pitches": 2_000,
         "max_percentile": 50, "min_percentile": None},
        {"velo_min": 85.0, "velo_max": None, "pitches": 40_000,
         "max_percentile": None, "min_percentile": 50},
    ]
    merged = cb.collapse_under_floor(bands, floor=5_000)
    assert len(merged) == 1
    assert merged[0]["pitches"] == 42_000


def test_a_merged_band_spans_the_full_range_of_its_parts():
    bands = [
        {"velo_min": None, "velo_max": 85.0, "pitches": 2_000,
         "max_percentile": 50, "min_percentile": None},
        {"velo_min": 85.0, "velo_max": None, "pitches": 40_000,
         "max_percentile": None, "min_percentile": 50},
    ]
    merged = cb.collapse_under_floor(bands, floor=5_000)
    assert merged[0]["velo_min"] is None and merged[0]["velo_max"] is None


def test_merging_repeats_until_every_band_clears_the_floor():
    # RHP knuckle-curve: widest spread of all (IQR 6.2) but only ~9,500
    # pitches, so three bands of ~3,159 collapse all the way back to one.
    bands = [
        {"velo_min": None, "velo_max": 80.6, "pitches": 3_159,
         "max_percentile": 33, "min_percentile": None},
        {"velo_min": 80.6, "velo_max": 84.9, "pitches": 3_159,
         "max_percentile": 67, "min_percentile": 33},
        {"velo_min": 84.9, "velo_max": None, "pitches": 3_158,
         "max_percentile": None, "min_percentile": 67},
    ]
    merged = cb.collapse_under_floor(bands, floor=5_000)
    assert len(merged) == 1
    assert merged[0]["pitches"] == 9_476


def test_a_thin_band_merges_toward_its_smaller_neighbour():
    # Merging into the smaller side keeps the big, well-sampled band pure.
    bands = [
        {"velo_min": None, "velo_max": 80.0, "pitches": 6_000,
         "max_percentile": 33, "min_percentile": None},
        {"velo_min": 80.0, "velo_max": 85.0, "pitches": 1_000,
         "max_percentile": 67, "min_percentile": 33},
        {"velo_min": 85.0, "velo_max": None, "pitches": 50_000,
         "max_percentile": None, "min_percentile": 67},
    ]
    merged = cb.collapse_under_floor(bands, floor=5_000)
    assert [b["pitches"] for b in merged] == [7_000, 50_000]


def test_a_compliant_set_is_left_alone():
    bands = [
        {"velo_min": None, "velo_max": 87.0, "pitches": 31_000,
         "max_percentile": 50, "min_percentile": None},
        {"velo_min": 87.0, "velo_max": None, "pitches": 32_000,
         "max_percentile": None, "min_percentile": 50},
    ]
    assert cb.collapse_under_floor(bands, floor=5_000) == bands


def test_a_single_band_under_the_floor_is_left_alone():
    # Nothing to merge into. The group should never have reached this function,
    # but silently dropping a shape is worse than a thin one.
    bands = [{"velo_min": None, "velo_max": None, "pitches": 900,
              "max_percentile": None, "min_percentile": None}]
    assert cb.collapse_under_floor(bands, floor=5_000) == bands


# --- naming -----------------------------------------------------------------

def test_a_single_band_needs_no_velocity_qualifier():
    bands = cb.make_bands([])
    assert cb.label("R", "KC", bands, 0) == "RHP Knuckle-Curve"


def test_the_first_band_is_named_by_its_ceiling():
    bands = cb.make_bands([(95.2, 50)])
    assert cb.label("R", "FF", bands, 0) == "RHP Four-Seam under 95"


def test_the_last_band_is_named_by_its_floor():
    bands = cb.make_bands([(95.2, 50)])
    assert cb.label("R", "FF", bands, 1) == "RHP Four-Seam 95+"


def test_a_middle_band_is_named_by_both_edges():
    bands = cb.make_bands([(78.9, 33), (82.6, 67)])
    assert cb.label("L", "CU", bands, 1) == "LHP Curveball 79-83"


def test_shape_ids_are_stable_and_readable():
    # The id goes in the database and in URLs, so it must not depend on row
    # order or on anything that changes when the season's data grows.
    assert cb.shape_id("R", "FF", 0) == "R-FF-1"
    assert cb.shape_id("L", "CU", 2) == "L-CU-3"
