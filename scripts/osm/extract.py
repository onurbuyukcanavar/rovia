#!/usr/bin/env python3
"""
ROVIA · OpenStreetMap içe aktarma — çıkarım adımı.

Bir .osm.pbf (veya test için .osm XML) dosyasından ROVIA'nın kullandığı
yerleşimleri, ilgi noktalarını (POI) ve il/ilçe sınırlarını CSV olarak çıkarır.
Yükleme adımı: scripts/osm/load.sql (psql ile).

Veri: © OpenStreetMap katkıda bulunanlar, ODbL 1.0.

Kullanım:
  python3 scripts/osm/extract.py turkey-latest.osm.pbf out/
"""
from __future__ import annotations

import csv
import json
import sys
import unicodedata
from pathlib import Path

import osmium

# ---------------------------------------------------------------------------
# Normalleştirme — src/lib/places/normalize.ts ile birebir aynı olmalı
# ---------------------------------------------------------------------------
_MAP = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})


def normalize(text: str) -> str:
    s = text.replace("İ", "i").replace("I", "ı").lower().translate(_MAP)
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.category(c).startswith("M"))
    out = []
    prev_space = True
    for c in s:
        if ("a" <= c <= "z") or ("0" <= c <= "9"):
            out.append(c)
            prev_space = False
        elif not prev_space:
            out.append(" ")
            prev_space = True
    return "".join(out).strip()


# ---------------------------------------------------------------------------
# Kategori eşlemesi: (etiket, değerler) → ROVIA kategorisi
# Sıra önemlidir: ilk eşleşen kazanır.
# ---------------------------------------------------------------------------
POI_RULES: list[tuple[str, str, set[str] | None]] = [
    ("fuel", "amenity", {"fuel"}),
    ("ev", "amenity", {"charging_station"}),
    ("rest", "highway", {"rest_area", "services"}),
    ("restaurant", "amenity", {"restaurant", "fast_food", "food_court"}),
    ("cafe", "amenity", {"cafe"}),
    ("health", "amenity", {"hospital", "pharmacy", "clinic"}),
    ("hotel", "tourism", {"hotel", "motel", "guest_house", "hostel"}),
    ("camping", "tourism", {"camp_site", "caravan_site"}),
    ("museum", "tourism", {"museum"}),
    ("historic", "historic", {"castle", "ruins", "archaeological_site", "monument", "fort", "city_gate",
                              "aqueduct", "tomb", "caravanserai", "citywalls", "bridge", "church", "mosque"}),
    ("nature", "natural", {"peak", "waterfall", "cave_entrance", "beach", "spring", "volcano", "gorge", "canyon"}),
    ("nature", "waterway", {"waterfall"}),  # şelaleler OSM'de çoğunlukla waterway=waterfall
    ("nature", "tourism", {"viewpoint"}),
    ("nature", "leisure", {"nature_reserve"}),
    ("nature", "boundary", {"national_park"}),
    ("attraction", "tourism", {"attraction", "theme_park", "zoo", "aquarium", "gallery"}),
    ("shopping", "shop", {"mall", "department_store", "supermarket"}),
    ("shopping", "amenity", {"marketplace"}),
    ("worship", "amenity", {"place_of_worship"}),
]

# İsimsiz olsa da yolcu için anlamlı olanlar; marka/işletmeci ya da genel adla tutulur
UNNAMED_OK = {"fuel": "Akaryakıt istasyonu", "ev": "Şarj istasyonu", "rest": "Dinlenme tesisi", "health": "Eczane"}

SETTLEMENTS = {"city": 1.0, "town": 0.6, "suburb": 0.35, "village": 0.3}

KEEP_TAGS = {
    "opening_hours", "phone", "contact:phone", "website", "contact:website", "wikidata", "wikipedia",
    "cuisine", "brand", "operator", "addr:street", "addr:housenumber", "addr:city", "addr:district",
    "addr:postcode", "stars", "fee", "ele", "heritage", "religion", "denomination", "description",
    "wheelchair", "internet_access", "capacity", "fuel:diesel", "fuel:lpg", "fuel:octane_95",
    "socket:type2", "socket:type2_combo", "socket:chademo",
}


def classify(tags) -> tuple[str, str, str] | None:
    """(kind, category, subtype) ya da None."""
    place = tags.get("place")
    if place in SETTLEMENTS:
        return ("settlement", place, place)
    for category, key, values in POI_RULES:
        v = tags.get(key)
        if v is not None and (values is None or v in values):
            if category == "nature" and key == "natural" and v == "spring" and "name" not in tags:
                return None  # isimsiz kaynaklar çok fazla ve gezgin için anlamsız
            subtype = tags.get("religion", v) if category == "worship" else v
            return ("poi", category, subtype)
    # Göl ve barajlar: yalnızca isimli su alanları
    if tags.get("natural") == "water" and tags.get("water") in {"lake", "reservoir", "lagoon"} and "name" in tags:
        return ("poi", "nature", "lake")
    return None


def display_name(tags, kind: str, category: str) -> str | None:
    name = tags.get("name:tr") or tags.get("name")
    if name:
        return name.strip()[:300]
    if kind == "poi" and category in UNNAMED_OK:
        alt = tags.get("brand") or tags.get("operator")
        if category == "health" and tags.get("amenity") == "hospital":
            return alt or "Hastane"
        return (alt or UNNAMED_OK[category])[:300]
    return None


def importance(tags, kind: str, category: str) -> float:
    if kind == "settlement":
        base = SETTLEMENTS[category]
        if tags.get("capital") in {"yes", "4"}:
            base = min(1.0, base + 0.2)
        return base
    score = 0.1
    if "wikidata" in tags or "wikipedia" in tags:
        score += 0.15
    if category in {"historic", "museum", "nature", "attraction"}:
        score += 0.05
    return round(score, 3)


def kept_tags(tags) -> str:
    return json.dumps({k: v[:500] for k, v in tags if k in KEEP_TAGS}, ensure_ascii=False, separators=(",", ":"))


class Extractor(osmium.SimpleHandler):
    def __init__(self, feat_writer, admin_writer):
        super().__init__()
        self.wkb = osmium.geom.WKBFactory()
        self.feat = feat_writer
        self.admin = admin_writer
        self.counts = {"features": 0, "admin": 0, "skipped_geometry": 0}

    def _emit(self, ref: str, tags, wkb_hex: str):
        cls = classify(tags)
        if not cls:
            return
        kind, category, subtype = cls
        name = display_name(tags, kind, category)
        if not name:
            return
        self.feat.writerow([ref, kind, category, (subtype or "")[:60], name, normalize(name),
                            kept_tags(tags), importance(tags, kind, category), wkb_hex])
        self.counts["features"] += 1

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        if classify(n.tags):
            self._emit(f"n{n.id}", n.tags, self.wkb.create_point(n))

    def area(self, a):
        tags = a.tags
        ref = f"{'w' if a.from_way() else 'r'}{a.orig_id()}"
        is_admin = tags.get("boundary") == "administrative" and tags.get("admin_level") in {"4", "6"}
        wants_feature = classify(tags) is not None
        if not (is_admin or wants_feature):
            return
        try:
            wkb_hex = self.wkb.create_multipolygon(a)
        except Exception:  # bozuk geometri (açık halkalar vb.)
            self.counts["skipped_geometry"] += 1
            return
        if is_admin and tags.get("name"):
            self.admin.writerow([ref, (tags.get("name:tr") or tags.get("name"))[:200], tags.get("admin_level"), wkb_hex])
            self.counts["admin"] += 1
        if wants_feature:
            self._emit(ref, tags, wkb_hex)


FEATURE_HEADER = ["osm_ref", "kind", "category", "subtype", "name", "name_search", "tags", "importance", "wkb"]
ADMIN_HEADER = ["osm_ref", "name", "admin_level", "wkb"]


def extract(source: str, out_dir: str) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "features.csv", "w", newline="", encoding="utf-8") as ff, \
         open(out / "admin.csv", "w", newline="", encoding="utf-8") as af:
        fw, aw = csv.writer(ff), csv.writer(af)
        fw.writerow(FEATURE_HEADER)
        aw.writerow(ADMIN_HEADER)
        handler = Extractor(fw, aw)
        handler.apply_file(source, locations=True)
    return handler.counts


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    counts = extract(sys.argv[1], sys.argv[2])
    print(json.dumps(counts))
