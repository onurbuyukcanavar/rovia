import csv
import json
from pathlib import Path

import pytest

from extract import classify, extract, normalize

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((ROOT / "tests/fixtures/normalize-cases.json").read_text(encoding="utf-8"))

# Küçük bir OSM XML: düğüm POI, kapalı yol POI (alan), isimsiz benzinlik, köy, il sınırı, elenmesi gerekenler
FIXTURE = """<?xml version='1.0' encoding='UTF-8'?>
<osm version="0.6">
  <node id="1" lat="40.74" lon="31.60"><tag k="amenity" v="fuel"/><tag k="name" v="Bolu Dağı Petrol"/><tag k="opening_hours" v="24/7"/><tag k="fixme" v="x"/></node>
  <node id="2" lat="40.75" lon="31.61"><tag k="amenity" v="fuel"/><tag k="brand" v="Opet"/></node>
  <node id="3" lat="40.76" lon="31.62"><tag k="amenity" v="bench"/><tag k="name" v="Bank"/></node>
  <node id="4" lat="38.64" lon="34.83"><tag k="place" v="town"/><tag k="name" v="Göreme"/></node>
  <node id="5" lat="39.94" lon="32.86"><tag k="historic" v="memorial"/><tag k="name" v="Küçük plaket"/></node>
  <node id="6" lat="39.94" lon="32.86"><tag k="amenity" v="restaurant"/></node>
  <node id="10" lat="39.940" lon="32.860"/><node id="11" lat="39.940" lon="32.870"/>
  <node id="12" lat="39.945" lon="32.870"/><node id="13" lat="39.945" lon="32.860"/>
  <way id="100"><nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/>
    <tag k="historic" v="castle"/><tag k="name" v="Ankara Kalesi"/><tag k="name:en" v="Ankara Castle"/><tag k="wikidata" v="Q1"/></way>
  <node id="20" lat="38.0" lon="34.0"/><node id="21" lat="38.0" lon="35.0"/><node id="22" lat="39.0" lon="35.0"/><node id="23" lat="39.0" lon="34.0"/>
  <way id="200"><nd ref="20"/><nd ref="21"/><nd ref="22"/><nd ref="23"/><nd ref="20"/></way>
  <relation id="300"><member type="way" ref="200" role="outer"/>
    <tag k="type" v="boundary"/><tag k="boundary" v="administrative"/><tag k="admin_level" v="4"/><tag k="name" v="Nevşehir"/></relation>
</osm>
"""


@pytest.mark.parametrize("raw,expected", CASES)
def test_normalize_matches_typescript(raw, expected):
    assert normalize(raw) == expected


def test_classify():
    assert classify({"amenity": "fuel"}) == ("poi", "fuel", "fuel")
    assert classify({"place": "village"}) == ("settlement", "village", "village")
    assert classify({"amenity": "place_of_worship", "religion": "muslim"}) == ("poi", "worship", "muslim")
    assert classify({"natural": "water", "water": "lake", "name": "Tuz Gölü"}) == ("poi", "nature", "lake")
    assert classify({"natural": "spring"}) is None
    assert classify({"waterway": "waterfall", "name": "Düden Şelalesi"}) == ("poi", "nature", "waterfall")
    assert classify({"amenity": "bench"}) is None


def test_extract_fixture(tmp_path):
    src = tmp_path / "fixture.osm"
    src.write_text(FIXTURE, encoding="utf-8")
    counts = extract(str(src), str(tmp_path / "out"))
    rows = list(csv.DictReader(open(tmp_path / "out/features.csv", encoding="utf-8")))
    by_ref = {r["osm_ref"]: r for r in rows}

    assert set(by_ref) == {"n1", "n2", "n4", "w100"}  # bank, memorial, isimsiz restoran elendi
    assert by_ref["n1"]["category"] == "fuel"
    assert json.loads(by_ref["n1"]["tags"]) == {"opening_hours": "24/7"}  # fixme atıldı
    assert by_ref["n2"]["name"] == "Opet"  # isimsiz benzinlik marka adıyla
    assert by_ref["n4"]["kind"] == "settlement" and by_ref["n4"]["name_search"] == "goreme"
    castle = by_ref["w100"]
    assert castle["category"] == "historic" and castle["subtype"] == "castle"
    assert float(castle["importance"]) > float(by_ref["n1"]["importance"])  # wikidata + kültürel
    assert castle["wkb"]  # alan geometrisi (yüklemede temsil noktasına çevrilir)

    admin = list(csv.DictReader(open(tmp_path / "out/admin.csv", encoding="utf-8")))
    assert [(a["osm_ref"], a["name"], a["admin_level"]) for a in admin] == [("r300", "Nevşehir", "4")]
    assert counts == {"features": 4, "admin": 1, "skipped_geometry": 0}
