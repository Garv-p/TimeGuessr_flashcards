"use client";

import { useEffect, useState } from "react";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pickRandomIndex(length) {
  if (!length) {
    return 0;
  }

  return Math.floor(Math.random() * length);
}

function createMapEmbed(lat, lng) {
  const latSpan = 0.04;
  const lngSpan = Math.max(0.04, 0.04 / Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const left = clamp(lng - lngSpan, -180, 180);
  const right = clamp(lng + lngSpan, -180, 180);
  const top = clamp(lat + latSpan, -85, 85);
  const bottom = clamp(lat - latSpan, -85, 85);
  const bbox = `${left},${bottom},${right},${top}`;

  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

function normalizeText(card) {
  return [
    card.year,
    card.decade,
    card.country,
    card.description,
    card.imageId,
    card.imageUrl,
  ]
    .join(" ")
    .toLowerCase();
}

function sortCards(cards, sortValue) {
  const sorted = [...cards];
  sorted.sort((a, b) => {
    const aYear = a.yearInt ?? Number.MAX_SAFE_INTEGER;
    const bYear = b.yearInt ?? Number.MAX_SAFE_INTEGER;
    return sortValue === "year-desc" ? bYear - aYear : aYear - bYear;
  });
  return sorted;
}

function buildFilteredCards(cards, query, decade, sortValue) {
  const filtered = cards.filter((card) => {
    if (decade !== "all" && card.decade !== decade) {
      return false;
    }

    if (!query) {
      return true;
    }

    return normalizeText(card).includes(query);
  });

  return sortCards(filtered, sortValue);
}

function Card({
  card,
  mode,
  flashcardRevealed,
  onReveal,
  onOpenLightbox,
}) {
  const mapSrc = Number.isFinite(card.lat) && Number.isFinite(card.lng)
    ? createMapEmbed(card.lat, card.lng)
    : null;
  const showAnswer = mode !== "flashcard" || flashcardRevealed;

  return (
    <article className={`card ${mode !== "all-cards" ? "single-card" : ""} ${mode === "flashcard" ? "flashcard-card" : ""}`}>
      <div className="card-media">
        <div className="card-image-wrap">
          <button
            className="image-button"
            type="button"
            aria-label="Open image larger"
            onClick={() => onOpenLightbox(card.imageUrl, `TimeGuessr card from ${card.year || "unknown year"}`)}
          >
            <img className="card-image" src={card.imageUrl} alt={`TimeGuessr card from ${card.year || "unknown year"}`} />
          </button>
        </div>
        <div className={`map-panel ${mode === "flashcard" ? "flashcard-answer" : ""}`}>
          <div className="map-header">
            <span>Destination</span>
            {mode === "flashcard" ? (
              <button className="show-map-button" type="button" hidden={showAnswer} onClick={onReveal}>
                Show
              </button>
            ) : null}
          </div>
          <div className={`map-canvas ${showAnswer ? "" : "hidden"}`}>
            {mapSrc ? (
              <div className="map-frame">
                <iframe
                  className="map-embed"
                  title="Destination map"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={mapSrc}
                />
              </div>
            ) : (
              <div className="empty-state">No destination available for this card.</div>
            )}
          </div>
        </div>
      </div>
      <div className={`card-body ${showAnswer ? "" : "hidden"}`}>
        <div className="card-meta">
          <div>
            <p className="meta-label">Time</p>
            <p className="meta-value">{card.year || "Unknown year"}</p>
          </div>
          <div>
            <p className="meta-label">Country</p>
            <p className="meta-value">{card.country || "Unknown country"}</p>
          </div>
          <div>
            <p className="meta-label">Decade</p>
            <p className="meta-value">{card.decade || "Unknown decade"}</p>
          </div>
        </div>
        <div className="description-panel">
          <p className="meta-label">Description</p>
          <p className="description-text">{card.description || "No description captured for this card yet."}</p>
        </div>
      </div>
    </article>
  );
}

export default function FlashcardsApp({ initialCards, initialStats }) {
  const [mode, setMode] = useState("flashcard");
  const [query, setQuery] = useState("");
  const [decade, setDecade] = useState("all");
  const [sortValue, setSortValue] = useState("year-asc");
  const [filteredCards, setFilteredCards] = useState(() => buildFilteredCards(initialCards, "", "all", "year-asc"));
  const [currentCardIndex, setCurrentCardIndex] = useState(() => pickRandomIndex(initialCards.length));
  const [flashcardRevealed, setFlashcardRevealed] = useState(false);
  const [lightbox, setLightbox] = useState({ open: false, src: "", alt: "" });

  const decades = [...new Set(initialCards.map((card) => card.decade).filter(Boolean))].sort();

  useEffect(() => {
    const nextFiltered = buildFilteredCards(initialCards, query.trim().toLowerCase(), decade, sortValue);
    setFilteredCards(nextFiltered);
    setFlashcardRevealed(false);
    setCurrentCardIndex((previousIndex) => {
      if (!nextFiltered.length) {
        return 0;
      }

      const previousCard = filteredCards[previousIndex];
      if (previousCard) {
        const preservedIndex = nextFiltered.findIndex((card) => card.id === previousCard.id);
        if (preservedIndex >= 0) {
          return preservedIndex;
        }
      }

      return pickRandomIndex(nextFiltered.length);
    });
  }, [initialCards, query, decade, sortValue]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && lightbox.open) {
        setLightbox({ open: false, src: "", alt: "" });
        return;
      }

      if (!filteredCards.length || mode === "all-cards") {
        return;
      }

      if (event.key === "ArrowLeft") {
        setFlashcardRevealed(false);
        setCurrentCardIndex((currentIndex) => (currentIndex - 1 + filteredCards.length) % filteredCards.length);
      }

      if (event.key === "ArrowRight") {
        setFlashcardRevealed(false);
        setCurrentCardIndex((currentIndex) => (currentIndex + 1) % filteredCards.length);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filteredCards, lightbox.open, mode]);

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setFlashcardRevealed(false);
    if (nextMode !== "all-cards" && filteredCards.length) {
      setCurrentCardIndex(pickRandomIndex(filteredCards.length));
    }
  }

  function handleNavigate(direction) {
    if (!filteredCards.length) {
      return;
    }

    setFlashcardRevealed(false);
    setCurrentCardIndex((index) => (index + direction + filteredCards.length) % filteredCards.length);
  }

  const cardsToRender = mode === "all-cards"
    ? filteredCards
    : filteredCards[currentCardIndex]
      ? [filteredCards[currentCardIndex]]
      : [];

  return (
    <main className="page-shell">
      <section className="toolbar">
        <div className="mode-buttons">
          <button className={`mode-button ${mode === "all-cards" ? "active" : ""}`} type="button" onClick={() => handleModeChange("all-cards")}>
            All Cards
          </button>
          <button className={`mode-button ${mode === "flashcard" ? "active" : ""}`} type="button" onClick={() => handleModeChange("flashcard")}>
            Flashcard
          </button>
          <button className={`mode-button ${mode === "view-cards" ? "active" : ""}`} type="button" onClick={() => handleModeChange("view-cards")}>
            View Cards
          </button>
        </div>

        <label className="search-block">
          <span>Search</span>
          <input
            id="search-input"
            type="search"
            placeholder="Year, image id, decade, country..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="filter-block">
          <span>Decade</span>
          <select value={decade} onChange={(event) => setDecade(event.target.value)}>
            <option value="all">All decades</option>
            {decades.map((decadeOption) => (
              <option key={decadeOption} value={decadeOption}>
                {decadeOption}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-block">
          <span>Sort</span>
          <select value={sortValue} onChange={(event) => setSortValue(event.target.value)}>
            <option value="year-asc">Year ascending</option>
            <option value="year-desc">Year descending</option>
          </select>
        </label>
      </section>

      <section className="summary-bar">
        <div>
          <span className="summary-label">Visible cards</span>
          <strong>{filteredCards.length}</strong>
        </div>
        <div>
          <span className="summary-label">Dataset</span>
          <strong>{initialStats.count ?? initialCards.length} total cards</strong>
        </div>
      </section>

      <section className="card-grid" aria-live="polite">
        {cardsToRender.length ? (
          cardsToRender.map((card) => (
            <Card
              key={card.id ?? card.imageId ?? card.imageUrl}
              card={card}
              mode={mode}
              flashcardRevealed={flashcardRevealed}
              onReveal={() => setFlashcardRevealed(true)}
              onOpenLightbox={(src, alt) => setLightbox({ open: true, src, alt })}
            />
          ))
        ) : (
          <div className="empty-state">No cards match the current filters.</div>
        )}
      </section>

      <div className={`card-navigation ${mode === "view-cards" && filteredCards.length ? "" : "hidden"}`}>
        <button className="nav-button" type="button" aria-label="Previous card" onClick={() => handleNavigate(-1)}>
          &larr;
        </button>
        <span className="card-counter">
          {filteredCards.length ? `${currentCardIndex + 1} / ${filteredCards.length}` : "0 / 0"}
        </span>
        <button className="nav-button" type="button" aria-label="Next card" onClick={() => handleNavigate(1)}>
          &rarr;
        </button>
      </div>

      <div
        className="lightbox"
        hidden={!lightbox.open}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setLightbox({ open: false, src: "", alt: "" });
          }
        }}
      >
        <button className="lightbox-close" type="button" aria-label="Close image viewer" onClick={() => setLightbox({ open: false, src: "", alt: "" })}>
          Close
        </button>
        <img className="lightbox-image" src={lightbox.src} alt={lightbox.alt} />
      </div>
    </main>
  );
}
