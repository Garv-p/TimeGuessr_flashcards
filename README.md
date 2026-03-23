# tg_flashcards

Short-term TimeGuessr card collector for building a local flashcard dataset quickly.

## What it does

- Opens TimeGuessr pages in Selenium
- Reads round data from `sessionStorage`
- Filters valid round objects from `playArray`
- Normalizes image, year, location, and coordinates
- Stores cards in SQLite with deduping
- Exports normal CSV and Anki-friendly CSV

## Files

- `collector.py`: visits TimeGuessr pages and saves cards into SQLite
- `export_csv.py`: exports `cards.db` into flashcard-friendly CSV files

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Selenium Manager should fetch the right driver automatically for Chrome in most cases.

## Usage

Collect from one or more pages:

```bash
python3 collector.py --db cards.db "https://timeguessr.com/some/results/page"
```

Collect from a text file of URLs:

```bash
python3 collector.py --db cards.db --urls-file urls.txt
```

If you need to log in manually first:

```bash
python3 collector.py --db cards.db --manual-login "https://timeguessr.com/some/results/page"
```

In manual login mode the browser opens and waits for you to press Enter in the terminal before extraction starts.

Export CSV files:

```bash
python3 export_csv.py --db cards.db
```

This creates:

- `timeguessr_rounds.csv`
- `timeguessr_anki.csv`

## Notes

- This is meant for your own active browser usage, not a production crawler.
- The extractor reads client-side session data, not a private JSON API.
- Cards are deduped by `image_id` when available, otherwise by `image_url`.
