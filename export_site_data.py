import argparse
import json
import sqlite3
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(description="Export SQLite card data to JSON for the static site.")
    parser.add_argument("--db", default="cards.db", help="SQLite database path.")
    parser.add_argument("--out", default="data/cards.json", help="Output JSON path.")
    return parser.parse_args()


def parse_location(location_json):
    if not location_json:
        return None
    try:
        return json.loads(location_json)
    except json.JSONDecodeError:
        return {"raw": location_json}


def main():
    args = parse_args()
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            SELECT
                id,
                image_id,
                image_url,
                year,
                country,
                description,
                license,
                location_json,
                lat,
                lng,
                street_view,
                source_url,
                created_at,
                updated_at
            FROM cards
            ORDER BY CAST(year AS INTEGER), image_url
            """
        ).fetchall()
    finally:
        conn.close()

    cards = []
    years = []
    for row in rows:
        description = row["description"] or ""
        if not description.strip():
            continue

        year_value = row["year"] or ""
        year_int = None
        if year_value:
            try:
                year_int = int(year_value)
                years.append(year_int)
            except ValueError:
                year_int = None

        cards.append(
            {
                "id": row["id"],
                "imageId": row["image_id"],
                "imageUrl": row["image_url"],
                "year": year_value,
                "yearInt": year_int,
                "decade": f"{(year_int // 10) * 10}s" if year_int is not None else "Unknown",
                "country": row["country"] or "",
                "description": description,
                "license": row["license"] or "",
                "location": parse_location(row["location_json"]),
                "lat": row["lat"],
                "lng": row["lng"],
                "streetView": row["street_view"] or "",
                "sourceUrl": row["source_url"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
        )

    payload = {
        "stats": {
            "count": len(cards),
            "yearMin": min(years) if years else None,
            "yearMax": max(years) if years else None,
            "decades": len({card["decade"] for card in cards}),
        },
        "cards": cards,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {len(cards)} cards to {out_path}")


if __name__ == "__main__":
    main()
