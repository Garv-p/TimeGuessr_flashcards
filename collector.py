import argparse
import json
import sqlite3
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from selenium import webdriver
from selenium.common.exceptions import JavascriptException, TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


EXTRACT_JS = r"""
return (() => {
  function safeJsonParse(value, fallback = null) {
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function pickNumber(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  function extractLatLng(source) {
    if (!isObject(source)) return { lat: null, lng: null };
    return {
      lat: pickNumber(
        source.Latitude,
        source.latitude,
        source.lat,
        source.Lat,
        source.y,
        source?.coords?.lat,
        source?.coordinates?.lat
      ),
      lng: pickNumber(
        source.Longitude,
        source.longitude,
        source.lng,
        source.lon,
        source.long,
        source.Lng,
        source.Lon,
        source.x,
        source?.coords?.lng,
        source?.coordinates?.lng,
        source?.coords?.lon,
        source?.coordinates?.lon
      )
    };
  }

  function normalizeGuessCoords(rawCoords, index) {
    if (rawCoords == null) return null;

    if (Array.isArray(rawCoords)) {
      const entry = rawCoords[index];
      if (entry == null) return null;
      if (Array.isArray(entry) && entry.length >= 2) {
        return { lat: pickNumber(entry[0]), lng: pickNumber(entry[1]) };
      }
      if (isObject(entry)) {
        const coords = extractLatLng(entry);
        return coords.lat !== null || coords.lng !== null ? coords : entry;
      }
      return entry;
    }

    if (isObject(rawCoords)) {
      const coords = extractLatLng(rawCoords);
      return coords.lat !== null || coords.lng !== null ? coords : rawCoords;
    }

    if (typeof rawCoords === "string") {
      const parsed = safeJsonParse(rawCoords, rawCoords);
      if (parsed !== rawCoords) return normalizeGuessCoords(parsed, index);

      const parts = rawCoords.split(",").map((part) => part.trim());
      if (parts.length >= 2) {
        return { lat: pickNumber(parts[0]), lng: pickNumber(parts[1]) };
      }
    }

    return rawCoords;
  }

  const playArray = safeJsonParse(sessionStorage.getItem("playArray"), []);
  const yearStorage = safeJsonParse(sessionStorage.getItem("yearStorage"), sessionStorage.getItem("yearStorage"));
  const coords = safeJsonParse(sessionStorage.getItem("coords"), sessionStorage.getItem("coords"));
  const domImageUrl = document.querySelector("img.results-img-top, img.results-img")?.src || null;

  const rounds = Array.isArray(playArray)
    ? playArray
        .filter((item) => isObject(item) && item.URL)
        .map((item, index) => {
          const location = isObject(item.Location) ? item.Location : null;
          const locationCoords = extractLatLng(location);
          const topLevelCoords = extractLatLng(item);
          return {
            round: index + 1,
            imageId: item.ImageId ?? item.imageId ?? null,
            imageUrl: item.URL ?? item.url ?? domImageUrl ?? null,
            year: item.Year ?? item.year ?? yearStorage ?? null,
            country: item.Country ?? item.country ?? location?.Country ?? location?.country ?? null,
            description: item.Description ?? item.description ?? location?.Description ?? location?.description ?? null,
            license: item.License ?? item.license ?? null,
            location,
            lat: locationCoords.lat ?? topLevelCoords.lat,
            lng: locationCoords.lng ?? topLevelCoords.lng,
            streetView: item.StreetView ?? item.streetView ?? null,
            guessCoords: normalizeGuessCoords(coords, index)
          };
        })
    : [];

  if (!rounds.length && domImageUrl) {
    rounds.push({
      round: 1,
      imageId: null,
      imageUrl: domImageUrl,
      year: yearStorage ?? null,
      country: null,
      description: null,
      license: null,
      location: null,
      lat: null,
      lng: null,
      streetView: null,
      guessCoords: normalizeGuessCoords(coords, 0)
    });
  }

  return {
    pageUrl: location.href,
    extractedAt: new Date().toISOString(),
    rounds
  };
})();
"""

def parse_args():
    parser = argparse.ArgumentParser(description="Collect TimeGuessr rounds into SQLite.")
    parser.add_argument("urls", nargs="*", help="TimeGuessr page URLs to visit and extract.")
    parser.add_argument("--urls-file", help="Path to a text file containing one URL per line.")
    parser.add_argument("--db", default="cards.db", help="SQLite database path.")
    parser.add_argument(
        "--repeat",
        type=int,
        default=1,
        help="Repeat the full URL list this many times. Useful for collecting many games from the same page.",
    )
    parser.add_argument(
        "--manual-login",
        action="store_true",
        help="Pause after opening the first page so you can log in manually before extraction.",
    )
    parser.add_argument(
        "--manual-login-wait",
        type=int,
        default=90,
        help="Seconds to wait for manual login/navigation when stdin is not interactive. Default: 90.",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chrome in headless mode. Avoid this if login or bot checks require visible browsing.",
    )
    return parser.parse_args()


def load_urls(args):
    urls = list(args.urls)
    if args.urls_file:
        lines = Path(args.urls_file).read_text(encoding="utf-8").splitlines()
        urls.extend(line.strip() for line in lines if line.strip())
    deduped = []
    seen = set()
    for url in urls:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    if not deduped:
        raise SystemExit("No URLs provided. Pass URLs directly or use --urls-file.")
    if args.repeat < 1:
        raise SystemExit("--repeat must be at least 1.")
    return deduped * args.repeat


def connect_db(path):
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_url TEXT NOT NULL,
            extracted_at TEXT NOT NULL,
            raw_payload_json TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id TEXT,
            image_url TEXT NOT NULL,
            year TEXT,
            country TEXT,
            description TEXT,
            license TEXT,
            location_json TEXT,
            lat REAL,
            lng REAL,
            street_view TEXT,
            guess_coords_json TEXT,
            source_url TEXT NOT NULL,
            import_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(image_id),
            UNIQUE(image_url),
            FOREIGN KEY(import_id) REFERENCES imports(id)
        )
        """
    )
    existing_columns = {
        row[1] for row in conn.execute("PRAGMA table_info(cards)").fetchall()
    }
    migrations = {
        "country": "ALTER TABLE cards ADD COLUMN country TEXT",
        "description": "ALTER TABLE cards ADD COLUMN description TEXT",
        "license": "ALTER TABLE cards ADD COLUMN license TEXT",
    }
    for column, statement in migrations.items():
        if column not in existing_columns:
            conn.execute(statement)
    return conn


def make_driver(headless=False):
    options = Options()
    options.add_argument("--window-size=1440,1100")
    options.add_argument("--disable-blink-features=AutomationControlled")
    if headless:
        options.add_argument("--headless=new")
    return webdriver.Chrome(options=options)


def wait_for_page(driver):
    WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
    time.sleep(2)


def looks_like_game_settings(url):
    return bool(re.search(r"/game-settings/?$", url))


def try_auto_start_game(driver):
    candidates = driver.find_elements(
        By.XPATH,
        (
            "//button[contains(normalize-space(.), 'Play')]"
            " | //a[contains(normalize-space(.), 'Play')]"
            " | //*[@role='button' and contains(normalize-space(.), 'Play')]"
            " | //input[(@type='button' or @type='submit') and contains(@value, 'Play')]"
        ),
    )

    for candidate in candidates:
        if candidate.is_displayed() and candidate.is_enabled():
            label = candidate.text.strip() or candidate.get_attribute("value") or candidate.get_attribute("aria-label")
            driver.execute_script("arguments[0].click();", candidate)
            print(f"[click] auto-started game via button text: {label!r}")
            return

    body_text = driver.find_element(By.TAG_NAME, "body").text
    if "Play" not in body_text:
        raise RuntimeError("Game settings page loaded, but no visible Play text was present in the page body.")

    candidates = driver.find_elements(By.XPATH, "//*[contains(normalize-space(.), 'Play')]")
    for candidate in candidates:
        if candidate.is_displayed():
            driver.execute_script("arguments[0].click();", candidate)
            print(f"[click] auto-started game via generic Play element: {candidate.tag_name!r}")
            return

    if not candidates:
        raise RuntimeError("Could not find a visible Play button on the game settings page.")
    raise RuntimeError("Found Play text on the page, but could not click a displayed element for it.")


def wait_for_round_data(driver, timeout=30):
    def has_round_data(d):
        return d.execute_script(
            """
            const raw = sessionStorage.getItem("playArray");
            if (!raw) return false;
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) && parsed.some((item) => item && typeof item === "object" && item.URL);
            } catch (err) {
              return false;
            }
            """
        )

    WebDriverWait(driver, timeout).until(has_round_data)


def extract_rounds(driver):
    try:
        payload = driver.execute_script(EXTRACT_JS)
    except JavascriptException as exc:
        raise RuntimeError(f"JS extraction failed: {exc}") from exc

    rounds = payload.get("rounds") or []
    if not rounds:
        raise RuntimeError("No rounds found on page. Check that this is a game/results page with session data.")
    return payload


def store_import(conn, payload):
    cursor = conn.execute(
        """
        INSERT INTO imports (source_url, extracted_at, raw_payload_json)
        VALUES (?, ?, ?)
        """,
        (
            payload["pageUrl"],
            payload["extractedAt"],
            json.dumps(payload, ensure_ascii=True),
        ),
    )
    return cursor.lastrowid


def upsert_card(conn, card, import_id, source_url):
    now = datetime.now(timezone.utc).isoformat()
    location_json = json.dumps(card["location"], ensure_ascii=True) if card.get("location") is not None else None
    guess_coords_json = (
        json.dumps(card["guessCoords"], ensure_ascii=True) if card.get("guessCoords") is not None else None
    )
    image_id = card.get("imageId")
    image_url = card.get("imageUrl")

    existing = None
    if image_id:
        existing = conn.execute("SELECT id FROM cards WHERE image_id = ?", (image_id,)).fetchone()
    if existing is None and image_url:
        existing = conn.execute("SELECT id FROM cards WHERE image_url = ?", (image_url,)).fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO cards (
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
                guess_coords_json,
                source_url,
                import_id,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                image_id,
                image_url,
                card.get("year"),
                card.get("country"),
                card.get("description"),
                card.get("license"),
                location_json,
                card.get("lat"),
                card.get("lng"),
                card.get("streetView"),
                guess_coords_json,
                source_url,
                import_id,
                now,
                now,
            ),
        )
        return

    conn.execute(
        """
        UPDATE cards
        SET
            image_id = COALESCE(?, image_id),
            image_url = COALESCE(?, image_url),
            year = COALESCE(?, year),
            country = COALESCE(?, country),
            description = COALESCE(?, description),
            license = COALESCE(?, license),
            location_json = COALESCE(?, location_json),
            lat = COALESCE(?, lat),
            lng = COALESCE(?, lng),
            street_view = COALESCE(?, street_view),
            guess_coords_json = COALESCE(?, guess_coords_json),
            source_url = ?,
            import_id = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            image_id,
            image_url,
            card.get("year"),
            card.get("country"),
            card.get("description"),
            card.get("license"),
            location_json,
            card.get("lat"),
            card.get("lng"),
            card.get("streetView"),
            guess_coords_json,
            source_url,
            import_id,
            now,
            existing[0],
        ),
    )


def collect_url(driver, conn, url, manual_login=False, manual_login_wait=90):
    print(f"[open] {url}")
    driver.get(url)
    wait_for_page(driver)

    if looks_like_game_settings(driver.current_url):
        try_auto_start_game(driver)
        wait_for_page(driver)
        wait_for_round_data(driver)

    if manual_login:
        if sys.stdin.isatty():
            input("Browser opened. Log in / navigate if needed, then press Enter to extract...")
        else:
            print(
                f"Browser opened. Waiting {manual_login_wait} seconds for manual login/navigation before extraction..."
            )
            time.sleep(manual_login_wait)

    payload = extract_rounds(driver)
    import_id = store_import(conn, payload)
    for card in payload["rounds"]:
        upsert_card(conn, card, import_id, payload["pageUrl"])
    conn.commit()

    print(f"[ok] extracted {len(payload['rounds'])} rounds from {payload['pageUrl']}")
    first_location = payload["rounds"][0].get("location") if payload["rounds"] else None
    print("[inspect] first location object:")
    print(json.dumps(first_location, indent=2, ensure_ascii=True))


def main():
    args = parse_args()
    urls = load_urls(args)
    conn = connect_db(args.db)
    driver = None

    try:
        driver = make_driver(headless=args.headless)
        for index, url in enumerate(urls):
            collect_url(
                driver,
                conn,
                url,
                manual_login=args.manual_login and index == 0,
                manual_login_wait=args.manual_login_wait,
            )
    except (TimeoutException, WebDriverException, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        if driver is not None:
            driver.quit()
        conn.close()


if __name__ == "__main__":
    main()
