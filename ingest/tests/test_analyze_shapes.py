"""Tests for the pure statistics behind the shape analysis report.

analyze_shapes.py talks to the database, but every number it prints comes from
these functions, which take plain arrays. That split is the whole reason the
report is testable without a connection.
"""

import pandas as pd
import pytest

import analyze_shapes as a


# --- Break normalisation -----------------------------------------------------
#
# pfx_x is signed from the catcher's view, so a lefty's slider and a righty's
# slider break in opposite numerical directions while doing the same thing.
# Comparing them without flipping the sign compares a number to its negative.

def test_normalize_break_flips_horizontal_break_for_lefties():
    df = pd.DataFrame({"p_throws": ["L"], "pfx_x": [0.8]})

    out = a.normalize_break(df)

    assert out.loc[0, "pfx_x"] == pytest.approx(-0.8)


def test_normalize_break_leaves_righties_alone():
    df = pd.DataFrame({"p_throws": ["R"], "pfx_x": [0.8]})

    out = a.normalize_break(df)

    assert out.loc[0, "pfx_x"] == pytest.approx(0.8)


def test_normalize_break_does_not_touch_vertical_break():
    df = pd.DataFrame({"p_throws": ["L"], "pfx_x": [0.8], "pfx_z": [1.2]})

    out = a.normalize_break(df)

    assert out.loc[0, "pfx_z"] == pytest.approx(1.2)


def test_normalize_break_does_not_mutate_the_caller_s_frame():
    df = pd.DataFrame({"p_throws": ["L"], "pfx_x": [0.8]})

    a.normalize_break(df)

    assert df.loc[0, "pfx_x"] == pytest.approx(0.8)


# --- Velocity distribution ---------------------------------------------------

def test_velocity_stats_reports_the_five_percentiles_and_count():
    speeds = list(range(80, 101))  # 80.0 through 100.0, evenly spaced

    s = a.velocity_stats(speeds)

    assert s["n"] == 21
    assert s["p10"] == pytest.approx(82.0)
    assert s["p25"] == pytest.approx(85.0)
    assert s["p50"] == pytest.approx(90.0)
    assert s["p75"] == pytest.approx(95.0)
    assert s["p90"] == pytest.approx(98.0)


def test_velocity_stats_iqr_is_p75_minus_p25():
    s = a.velocity_stats(list(range(80, 101)))

    assert s["iqr"] == pytest.approx(10.0)


def test_velocity_stats_ignores_missing_speeds():
    s = a.velocity_stats([90.0, None, 92.0, float("nan")])

    assert s["n"] == 2


# --- Histogram ---------------------------------------------------------------

def test_histogram_counts_buckets_by_whole_mph():
    edges, counts = a.histogram_counts([80.2, 80.9, 81.4], bin_width=1.0)

    assert edges[0] == pytest.approx(80.0)
    assert counts == [2, 1]


def test_render_histogram_scales_the_longest_bar_to_the_given_width():
    lines = a.render_histogram([80.0, 81.0], [10, 5], width=20)

    assert lines[0].count("#") == 20
    assert lines[1].count("#") == 10


def test_render_histogram_labels_each_row_with_its_bin_floor():
    lines = a.render_histogram([80.0, 81.0], [10, 5], width=20)

    assert lines[0].startswith("80")
    assert lines[1].startswith("81")


# --- Bimodality --------------------------------------------------------------
#
# The interview answer: RHP sliders are two pitches wearing one label. A single
# velocity band blurs them together, which is the known limitation the README
# names. Detecting it needs to be explainable in one sentence: two peaks with a
# real valley between them, not just a bumpy shoulder.

def test_two_separated_clumps_are_bimodal():
    counts = [1, 5, 12, 18, 12, 4, 2, 4, 12, 18, 12, 5, 1]

    assert a.is_bimodal(counts) is True


def test_a_single_clump_is_not_bimodal():
    counts = [1, 3, 8, 15, 20, 15, 8, 3, 1]

    assert a.is_bimodal(counts) is False


def test_a_shoulder_without_a_valley_is_not_bimodal():
    # Two local maxima, but the dip between them is shallow — one wide pitch,
    # not two pitches. Calling this bimodal would put the claim in the README
    # on sand.
    counts = [1, 5, 12, 18, 16, 17, 12, 5, 1]

    assert a.is_bimodal(counts) is False


def test_a_tiny_secondary_bump_is_not_bimodal():
    # A 2-count blip next to an 18-count peak is noise, not a second pitch.
    counts = [1, 5, 12, 18, 12, 5, 1, 2, 1]

    assert a.is_bimodal(counts) is False


# --- Correlation -------------------------------------------------------------

def test_correlation_is_minus_one_when_break_falls_as_velocity_rises():
    assert a.correlation([80, 85, 90], [1.0, 0.5, 0.0]) == pytest.approx(-1.0)


def test_correlation_is_none_when_a_series_never_varies():
    assert a.correlation([88, 88, 88], [0.1, 0.2, 0.3]) is None


# --- Outlier clipping --------------------------------------------------------
#
# 0.14% of RHP sliders in 2026 are recorded under 70 mph — tracking errors, not
# pitches. They barely move the percentiles, but they stretch the histogram
# across 60 mostly-empty bins, which makes the shape of the distribution
# impossible to read. The report clips the tails for display only; the
# percentiles are still computed over every pitch.

def test_clip_tails_drops_a_far_outlier():
    values = [88.0] * 200 + [34.0]

    kept = a.clip_tails(values)

    assert 34.0 not in kept


def test_clip_tails_keeps_the_bulk_of_the_distribution():
    values = [88.0] * 200 + [34.0]

    kept = a.clip_tails(values)

    assert len(kept) >= 190


def test_clipping_keeps_the_histogram_readable():
    # One bad reading at 34 mph would otherwise open a 55-bin desert before the
    # real pitches start.
    values = list(range(80, 95)) * 20 + [34.0]

    edges, _ = a.histogram_counts(a.clip_tails(values))

    assert len(edges) <= 20


def test_clipping_does_not_hide_a_real_second_peak():
    # The clip must not be so aggressive that it removes a genuine slow group.
    slow, fast = [82.0] * 500, [90.0] * 500

    kept = a.clip_tails(slow + fast)

    assert 82.0 in kept and 90.0 in kept
