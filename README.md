# tg_flashcards

TimeGuessr flashcards with a Next.js frontend for Vercel deployment, plus Python collection/export scripts for building the dataset.

## Frontend

The app is now a standard Next.js project using the App Router. Vercel should detect it automatically.

### Local frontend setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Deploy on Vercel

1. Import the GitHub repo into Vercel.
2. Keep the detected framework as `Next.js`.
3. Deploy with the default build settings.

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
- `app/`: Next.js frontend
- `data/cards.json`: static dataset rendered by the frontend

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
