"""Validating the shape file before it reaches the database.

db/shapes/v1_type_velo.json is hand-editable on purpose -- Task 15 may widen
the bands by editing it. That makes it the most likely place for a silent
mistake to enter the pipeline, so it is checked before it is loaded rather
than after the numbers look wrong.
"""

import pytest

import derive_shapes as ds


def group(pitch_type="FF", hand="R", bands=()):
    return {"p_throws": hand, "pitch_type": pitch_type,
            "pitches": 100_000, "iqr": 3.3, "bands_by_spread": len(bands),
            "bands": list(bands)}


def band(shape_id, lo, hi, pitches=10_000):
    return {"shape_id": shape_id, "label": shape_id, "velo_min": lo,
            "velo_max": hi, "pitches": pitches,
            "min_percentile": None, "max_percentile": 50}


def doc(*groups):
    return {"method": "v1_type_velo", "season": 2026,
            "generated": "2026-09-18", "rule": {}, "groups": list(groups)}


# --- the bands must tile the number line ------------------------------------

def test_a_well_formed_file_validates():
    d = doc(group(bands=[band("R-FF-1", None, 95.2), band("R-FF-2", 95.2, None)]))
    ds.validate(d)  # no exception


def test_a_gap_between_bands_is_rejected():
    # Pitches at 95.3 would be silently unassigned -- they would just quietly
    # vanish from every hitter's sample.
    d = doc(group(bands=[band("R-FF-1", None, 95.2), band("R-FF-2", 95.5, None)]))
    with pytest.raises(ds.ShapeFileError, match="gap"):
        ds.validate(d)


def test_an_overlap_between_bands_is_rejected():
    # A pitch at 95.3 would match both bands and be counted twice.
    d = doc(group(bands=[band("R-FF-1", None, 95.5), band("R-FF-2", 95.2, None)]))
    with pytest.raises(ds.ShapeFileError, match="overlap"):
        ds.validate(d)


def test_the_slowest_band_must_be_open_at_the_bottom():
    d = doc(group(bands=[band("R-FF-1", 90.0, 95.2), band("R-FF-2", 95.2, None)]))
    with pytest.raises(ds.ShapeFileError, match="unbounded"):
        ds.validate(d)


def test_the_fastest_band_must_be_open_at_the_top():
    # A 104 mph four-seamer has to land somewhere.
    d = doc(group(bands=[band("R-FF-1", None, 95.2), band("R-FF-2", 95.2, 100.0)]))
    with pytest.raises(ds.ShapeFileError, match="unbounded"):
        ds.validate(d)


def test_a_single_band_group_must_be_open_at_both_ends():
    d = doc(group(pitch_type="KC", bands=[band("R-KC-1", None, None)]))
    ds.validate(d)


def test_a_group_with_no_bands_is_rejected():
    d = doc(group(bands=[]))
    with pytest.raises(ds.ShapeFileError, match="no bands"):
        ds.validate(d)


# --- ids are the database's primary key, so they must be unique -------------

def test_a_duplicate_shape_id_is_rejected():
    d = doc(group(pitch_type="FF", bands=[band("R-FF-1", None, None)]),
            group(pitch_type="SI", bands=[band("R-FF-1", None, None)]))
    with pytest.raises(ds.ShapeFileError, match="duplicate"):
        ds.validate(d)


# --- turning the file into rows ---------------------------------------------

def test_every_band_becomes_one_row():
    d = doc(group(pitch_type="FF", bands=[band("R-FF-1", None, 95.2),
                                          band("R-FF-2", 95.2, None)]),
            group(pitch_type="KC", bands=[band("R-KC-1", None, None)]))
    assert len(ds.rows_from(d)) == 3


def test_a_row_carries_the_method_and_season_from_the_file():
    # Both are part of how the row is identified later; neither is re-derived.
    d = doc(group(bands=[band("R-FF-1", None, None)]))
    row = ds.rows_from(d)[0]
    assert row[0] == "v1_type_velo"
    assert row[9] == 2026


def test_a_row_carries_the_band_edges_and_the_league_count():
    d = doc(group(bands=[band("R-FF-1", None, 95.2, pitches=73_506),
                         band("R-FF-2", 95.2, None)]))
    method, shape_id, lbl, hand, ptype, lo, hi, lo_p, hi_p, season, n = ds.rows_from(d)[0]
    assert (shape_id, hand, ptype, lo, hi, n) == ("R-FF-1", "R", "FF", None, 95.2, 73_506)


def test_rows_come_out_in_a_stable_order():
    # Re-running derive_shapes should produce an identical statement, so a
    # diff of two runs is empty rather than a reshuffle.
    d = doc(group(pitch_type="SI", bands=[band("R-SI-1", None, None)]),
            group(pitch_type="FF", bands=[band("R-FF-1", None, None)]))
    assert [r[1] for r in ds.rows_from(d)] == ["R-FF-1", "R-SI-1"]


# --- the real file ----------------------------------------------------------

def test_the_checked_in_shape_file_is_valid():
    ds.validate(ds.read_file())


def test_the_checked_in_shape_file_holds_20_shapes():
    # The count the README and the interview answer both quote. It was 33
    # until the Task 15 coverage audit: splitting a group halves every
    # hitter's sample, and the middle-spread splits were not separating
    # anything worth that price.
    assert len(ds.rows_from(ds.read_file())) == 20


# --- shapes the file no longer defines --------------------------------------

def test_a_shape_dropped_from_the_file_is_identified():
    # Widening the bands in Task 15 turned 33 shapes into 20. Upserting alone
    # would have left the other 13 in the database with their assignments
    # still attached, and every league total would have been double-counted.
    assert ds.stale_shape_ids(in_file={"R-CU-1"}, in_db={"R-CU-1", "R-FF-2"}) \
        == {"R-FF-2"}


def test_nothing_is_stale_when_the_file_is_unchanged():
    assert ds.stale_shape_ids(in_file={"R-CU-1"}, in_db={"R-CU-1"}) == set()


def test_a_newly_added_shape_is_not_stale():
    assert ds.stale_shape_ids(in_file={"R-CU-1", "R-CU-2"}, in_db={"R-CU-1"}) == set()
