import argparse
import csv
import sqlite3


def parse_args():
    parser = argparse.ArgumentParser(description="Export collected TimeGuessr cards to CSV.")
    parser.add_argument("--db", default="cards.db", help="SQLite database path.")
    parser.add_argument("--csv", default="timeguessr_rounds.csv", help="Flat CSV export path.")
    parser.add_argument("--anki", default="timeguessr_anki.csv", help="Anki-friendly CSV export path.")
    return parser.parse_args()


def fetch_cards(conn):
    cursor = conn.execute(
        """
        SELECT
            image_id,
            image_url,
            year,
            location_json,
            lat,
            lng,
            street_view,
            guess_coords_json
        FROM cards
        ORDER BY COALESCE(year, ''), image_url
        """
    )
    return cursor.fetchall()


def export_flat_csv(rows, path):
    headers = [
        "image_id",
        "image_url",
        "year",
        "location_json",
        "lat",
        "lng",
        "street_view",
        "guess_coords_json",
    ]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        writer.writerows(rows)


def export_anki_csv(rows, path):
    headers = [
        "front_image_html",
        "answer_year",
        "answer_location_json",
        "image_url",
        "image_id",
        "tags",
    ]
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        for image_id, image_url, year, location_json, lat, lng, street_view, guess_coords_json in rows:
            writer.writerow(
                [
                    f'<img src="{image_url}">' if image_url else "",
                    year or "",
                    location_json or "",
                    image_url or "",
                    image_id or "",
                    "timeguessr geography history",
                ]
            )


def main():
    args = parse_args()
    conn = sqlite3.connect(args.db)
    try:
        rows = fetch_cards(conn)
    finally:
        conn.close()

    export_flat_csv(rows, args.csv)
    export_anki_csv(rows, args.anki)

    print(f"Wrote {len(rows)} rows to {args.csv}")
    print(f"Wrote {len(rows)} rows to {args.anki}")


if __name__ == "__main__":
    main()
