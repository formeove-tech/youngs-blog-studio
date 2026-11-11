"""Create a compact position index of licensed restaurants, cafés, and bakeries."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
# Public, normalized snapshot of MOIS datasets 15154916, 15154921 and 15155252.
SNAPSHOT = "https://www.kaggle.com/api/v1/datasets/download/taeyangg4/korea-food-service-permits/korea_food_service_permits.parquet?datasetVersionNumber=2"
SNAPSHOT_SIZE = 165_170_021
SNAPSHOT_SHA = "1e190aba12234023a88e2a92b05bcf0526ec37f22b4d02df6cdba27b214578b3"
CACHE_FILE = "food-permits-v2-schema1.sqlite"


def download(target):
    digest = hashlib.sha256()
    total, deadline = 0, time.monotonic() + 300
    with urlopen(SNAPSHOT, timeout=30) as source, target.open("wb") as output:
        while chunk := source.read(512 * 1024):
            total += len(chunk)
            if total > SNAPSHOT_SIZE or time.monotonic() > deadline:
                raise ValueError("Public food permit download exceeded its size or time limit")
            digest.update(chunk)
            output.write(chunk)
    if total != SNAPSHOT_SIZE or digest.hexdigest() != SNAPSHOT_SHA:
        raise ValueError("The public food permit snapshot does not match the expected checksum")


def venues(snapshot):
    import duckdb
    from pyproj import Transformer

    transform = Transformer.from_crs(5174, 4326, always_xy=True)
    with duckdb.connect(config={"threads": "2", "memory_limit": "128MB"}) as source:
        cursor = source.execute(
            """SELECT trim(business_name), coalesce(nullif(trim(road_address), ''), trim(lot_address)),
                      source_coordinate_x, source_coordinate_y
                 FROM read_parquet(?)
                WHERE source_status_code = '01'
                  AND source_coordinate_x IS NOT NULL AND source_coordinate_y IS NOT NULL
                  AND nullif(trim(business_name), '') IS NOT NULL""",
            [str(snapshot)],
        )
        while batch := cursor.fetchmany(8192):
            lngs, lats = transform.transform([row[2] for row in batch], [row[3] for row in batch])
            for (name, address, _, _), lat, lng in zip(batch, lats, lngs):
                if not address or not (32 <= lat <= 40 and 123 <= lng <= 133):
                    continue
                address = " ".join(address.split())
                region = address.split()[:2]
                if region and region[0].endswith("특별자치시"):
                    region = region[:1]
                yield name[:100], address[:500], " ".join(region)[:100], lat, lng


def build(snapshot, output):
    with sqlite3.connect(output) as db:
        db.execute("PRAGMA journal_mode = OFF")
        db.execute("PRAGMA synchronous = OFF")
        db.execute("CREATE TABLE shops (name TEXT NOT NULL, address TEXT NOT NULL, region TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL)")
        db.executemany("INSERT INTO shops VALUES (?, ?, ?, ?, ?)", venues(snapshot))
        count = db.execute("SELECT COUNT(*) FROM shops").fetchone()[0]
        if count < 500_000:
            raise ValueError("The food permit snapshot has too few active venues")
        db.execute("CREATE INDEX shops_position ON shops(lat, lng)")
    print(f"Indexed {count:,} active food and drink venues.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="Use an existing permit Parquet file")
    args = parser.parse_args()
    destination = ROOT / "data" / "place-index.sqlite"
    destination.parent.mkdir(exist_ok=True)
    cache_home = os.environ.get("XDG_CACHE_HOME")
    cache = Path(cache_home) / "youngs-place-index" / CACHE_FILE if cache_home and not args.snapshot else None
    with tempfile.TemporaryDirectory(prefix="place-build-", dir=destination.parent) as tmp:
        work = Path(tmp)
        database = work / "places.sqlite"
        if cache and cache.is_file():
            shutil.copyfile(cache, database)
        else:
            snapshot = args.snapshot
            if not snapshot:
                snapshot = work / "permits.parquet"
                download(snapshot)
            build(snapshot, database)
            if cache:
                cache.parent.mkdir(parents=True, exist_ok=True)
                pending = cache.with_suffix(".next")
                shutil.copyfile(database, pending)
                pending.replace(cache)
        database.replace(destination)


if __name__ == "__main__":
    main()
