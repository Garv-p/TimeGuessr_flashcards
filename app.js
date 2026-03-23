const state = {
  cards: [],
  filtered: [],
  currentMode: "flashcard",
  currentCardIndex: 0,
  flashcardRevealed: false,
};

const elements = {
  cardGrid: document.querySelector("#card-grid"),
  searchInput: document.querySelector("#search-input"),
  decadeSelect: document.querySelector("#decade-select"),
  sortSelect: document.querySelector("#sort-select"),
  statCount: document.querySelector("#stat-count"),
  statYears: document.querySelector("#stat-years"),
  statDecades: document.querySelector("#stat-decades"),
  visibleCount: document.querySelector("#visible-count"),
  template: document.querySelector("#card-template"),
  lightbox: document.querySelector("#image-lightbox"),
  lightboxImage: document.querySelector("#lightbox-image"),
  lightboxClose: document.querySelector("#lightbox-close"),
  allCardsMode: document.querySelector("#all-cards-mode"),
  flashcardMode: document.querySelector("#flashcard-mode"),
  viewCardsMode: document.querySelector("#view-cards-mode"),
  cardNavigation: document.querySelector("#card-navigation"),
  prevCard: document.querySelector("#prev-card"),
  nextCard: document.querySelector("#next-card"),
  cardCounter: document.querySelector("#card-counter"),
};

function setText(node, value) {
  if (node) {
    node.textContent = value;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pickRandomIndex(length) {
  if (!length) {
    return 0;
  }

  return Math.floor(Math.random() * length);
}

function openLightbox(src, alt) {
  if (!elements.lightbox || !elements.lightboxImage) {
    return;
  }

  elements.lightboxImage.src = src;
  elements.lightboxImage.alt = alt;
  elements.lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  if (!elements.lightbox || !elements.lightboxImage) {
    return;
  }

  elements.lightbox.hidden = true;
  elements.lightboxImage.removeAttribute("src");
  document.body.style.overflow = "";
}

function setCurrentCardIndex(index) {
  if (!state.filtered.length) {
    state.currentCardIndex = 0;
    return;
  }

  const wrappedIndex = ((index % state.filtered.length) + state.filtered.length) % state.filtered.length;
  state.currentCardIndex = wrappedIndex;
}

function chooseRandomCard() {
  setCurrentCardIndex(pickRandomIndex(state.filtered.length));
}

function updateNavigation() {
  if (!elements.cardNavigation) {
    return;
  }

  const hideNavigation = !state.filtered.length || state.currentMode !== "view-cards";
  elements.cardNavigation.classList.toggle("hidden", hideNavigation);

  if (hideNavigation) {
    return;
  }

  setText(elements.cardCounter, `${state.currentCardIndex + 1} / ${state.filtered.length}`);
}

function setMode(mode) {
  if (state.currentMode !== mode) {
    state.currentMode = mode;
    state.flashcardRevealed = false;
    if (mode !== "all-cards") {
      chooseRandomCard();
    }
  }

  elements.allCardsMode?.classList.toggle("active", mode === "all-cards");
  elements.flashcardMode?.classList.toggle("active", mode === "flashcard");
  elements.viewCardsMode?.classList.toggle("active", mode === "view-cards");
  renderCards();
}

function navigateCard(direction) {
  if (!state.filtered.length) {
    return;
  }

  state.flashcardRevealed = false;
  setCurrentCardIndex(state.currentCardIndex + direction);
  renderCards();
}

function revealFlashcard() {
  state.flashcardRevealed = true;
  renderCards();
}

function createMapEmbed(lat, lng) {
  const latSpan = 0.04;
  const lngSpan = Math.max(0.04, 0.04 / Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  const left = clamp(lng - lngSpan, -180, 180);
  const right = clamp(lng + lngSpan, -180, 180);
  const top = clamp(lat + latSpan, -85, 85);
  const bottom = clamp(lat - latSpan, -85, 85);
  const bbox = `${left},${bottom},${right},${top}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;

  return `
    <div class="map-frame">
      <iframe
        class="map-embed"
        title="Destination map"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        src="${src}">
      </iframe>
    </div>
  `;
}

function normalizeText(card) {
  const parts = [
    card.year,
    card.decade,
    card.country,
    card.description,
    card.imageId,
    card.imageUrl,
  ];

  return parts.join(" ").toLowerCase();
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

function applyFilters() {
  const query = elements.searchInput?.value.trim().toLowerCase() || "";
  const decade = elements.decadeSelect?.value || "all";
  const sortValue = elements.sortSelect?.value || "year-asc";

  const filtered = state.cards.filter((card) => {
    if (decade !== "all" && card.decade !== decade) {
      return false;
    }

    if (!query) {
      return true;
    }

    return normalizeText(card).includes(query);
  });

  const previousCard = state.filtered[state.currentCardIndex];
  state.filtered = sortCards(filtered, sortValue);

  if (!state.filtered.length) {
    state.currentCardIndex = 0;
  } else if (previousCard) {
    const preservedIndex = state.filtered.findIndex((card) => card.id === previousCard.id);
    if (preservedIndex >= 0) {
      state.currentCardIndex = preservedIndex;
    } else {
      chooseRandomCard();
    }
  } else {
    chooseRandomCard();
  }

  state.flashcardRevealed = false;
  renderCards();
}

function renderCards() {
  if (!elements.cardGrid || !elements.template) {
    return;
  }

  elements.cardGrid.innerHTML = "";
  setText(elements.visibleCount, String(state.filtered.length));
  updateNavigation();

  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No cards match the current filters.";
    elements.cardGrid.append(empty);
    return;
  }

  if (state.currentCardIndex >= state.filtered.length) {
    state.currentCardIndex = 0;
    updateNavigation();
  }

  const cardsToRender = state.currentMode === "all-cards"
    ? state.filtered
    : [state.filtered[state.currentCardIndex]];

  for (const card of cardsToRender) {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    const image = node.querySelector(".card-image");
    const imageButton = node.querySelector(".image-button");
    const yearValue = node.querySelector(".year-value");
    const country = node.querySelector(".country");
    const decade = node.querySelector(".decade");
    const descriptionText = node.querySelector(".description-text");
    const mapCanvas = node.querySelector(".map-canvas");
    const showMapButton = node.querySelector(".show-map-button");
    const cardBody = node.querySelector(".card-body");
    const mapPanel = node.querySelector(".map-panel");

    if (state.currentMode !== "all-cards") {
      node.classList.add("single-card");
    }
    node.classList.toggle("flashcard-card", state.currentMode === "flashcard");
    node.classList.toggle("viewer-card", state.currentMode === "view-cards");

    if (image) {
      image.src = card.imageUrl;
      image.alt = `TimeGuessr card from ${card.year || "unknown year"}`;
      image.loading = "lazy";
      image.decoding = "async";
    }

    imageButton?.addEventListener("click", () => {
      openLightbox(card.imageUrl, image?.alt || "Expanded TimeGuessr card");
    });

    setText(yearValue, card.year || "Unknown year");
    setText(country, card.country || "Unknown country");
    setText(decade, card.decade || "Unknown decade");
    setText(descriptionText, card.description || "No description captured for this card yet.");

    const hasCoords = Number.isFinite(card.lat) && Number.isFinite(card.lng);
    if (mapCanvas) {
      mapCanvas.innerHTML = hasCoords
        ? createMapEmbed(card.lat, card.lng)
        : `<div class="empty-state">No destination available for this card.</div>`;
    }

    if (state.currentMode === "flashcard") {
      mapPanel?.classList.add("flashcard-answer");
      if (!state.flashcardRevealed) {
        cardBody?.classList.add("hidden");
        mapCanvas?.classList.add("hidden");
        if (showMapButton) {
          showMapButton.textContent = "Show";
          showMapButton.hidden = false;
          showMapButton.addEventListener("click", revealFlashcard);
        }
      } else {
        cardBody?.classList.remove("hidden");
        mapCanvas?.classList.remove("hidden");
        if (showMapButton) {
          showMapButton.hidden = true;
        }
      }
    } else {
      cardBody?.classList.remove("hidden");
      mapPanel?.classList.remove("flashcard-answer");
      mapCanvas?.classList.remove("hidden");
      if (showMapButton) {
        showMapButton.hidden = true;
      }
    }

    elements.cardGrid.append(node);
  }
}

function populateDecades(cards) {
  const decades = [...new Set(cards.map((card) => card.decade).filter(Boolean))].sort();
  for (const decade of decades) {
    const option = document.createElement("option");
    option.value = decade;
    option.textContent = decade;
    elements.decadeSelect?.append(option);
  }
}

function renderStats(stats) {
  setText(elements.statCount, String(stats.count ?? 0));
  setText(
    elements.statYears,
    stats.yearMin != null && stats.yearMax != null ? `${stats.yearMin} - ${stats.yearMax}` : "Unknown"
  );
  setText(elements.statDecades, String(stats.decades ?? 0));
}

async function init() {
  const response = await fetch("./data/cards.json");
  if (!response.ok) {
    throw new Error(`Failed to load cards.json (${response.status})`);
  }

  const payload = await response.json();
  state.cards = payload.cards || [];
  populateDecades(state.cards);
  renderStats(payload.stats || {});
  applyFilters();
}

elements.searchInput?.addEventListener("input", applyFilters);
elements.decadeSelect?.addEventListener("change", applyFilters);
elements.sortSelect?.addEventListener("change", applyFilters);
elements.allCardsMode?.addEventListener("click", () => setMode("all-cards"));
elements.flashcardMode?.addEventListener("click", () => setMode("flashcard"));
elements.viewCardsMode?.addEventListener("click", () => setMode("view-cards"));
elements.prevCard?.addEventListener("click", () => navigateCard(-1));
elements.nextCard?.addEventListener("click", () => navigateCard(1));
elements.lightboxClose?.addEventListener("click", closeLightbox);
elements.lightbox?.addEventListener("click", (event) => {
  if (event.target === elements.lightbox) {
    closeLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.lightbox && !elements.lightbox.hidden) {
    closeLightbox();
    return;
  }

  if (event.key === "ArrowLeft") {
    navigateCard(-1);
  }

  if (event.key === "ArrowRight") {
    navigateCard(1);
  }
});

init().catch((error) => {
  if (elements.cardGrid) {
    elements.cardGrid.innerHTML = `<div class="empty-state">${error.message}</div>`;
  }
});
