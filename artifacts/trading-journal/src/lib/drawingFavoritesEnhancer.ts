const FAVS_KEY = "tv_toolbar_favorites_v3";

const LABEL_TO_KEY: Record<string, string> = {
  "Trendline": "trendline",
  "Ray": "ray",
  "Extended line": "extended",
  "Horizontal line": "hline",
  "Horizontal ray": "hray",
  "Vertical line": "vline",
  "Parallel channel": "channel",
  "Fib retracement": "fib",
  "Fib channel": "fib_channel",
  "Long position": "position_long",
  "Short position": "position_short",
  "Date Range": "date_range",
  "Price Range": "price_range",
  "Text": "text",
  "Note": "note",
  "Brush": "brush_brush",
  "Highlighter": "brush_highlighter",
  "Arrow": "brush_arrow",
  "Rectangle": "shape_rect",
  "Path": "shape_path",
  "Circle": "shape_circle",
  "Curve": "shape_curve",
};

function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

function getToolRows(popup: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  popup.querySelectorAll<HTMLElement>("button").forEach(button => {
    const star = button.querySelector("svg.lucide-star");
    if (!star) return;
    const row = button.parentElement;
    if (!row || row.dataset.favRow === "true") return;
    const toolButton = row.querySelector<HTMLButtonElement>(":scope > button");
    if (!toolButton || toolButton === button) return;
    const label = toolButton.querySelector("span")?.textContent?.trim();
    if (!label || !LABEL_TO_KEY[label]) return;
    if (!rows.includes(row)) rows.push(row);
  });
  return rows;
}

function showPrompt(button: HTMLElement, label: string, onAction: () => void) {
  document.querySelectorAll<HTMLElement>("[data-favorite-prompt]").forEach(el => el.remove());

  const rect = button.getBoundingClientRect();
  const prompt = document.createElement("button");
  prompt.type = "button";
  prompt.dataset.favoritePrompt = "true";
  prompt.innerHTML = `<span style="font-size:16px;line-height:1">★</span><span>${label}</span>`;
  prompt.style.cssText = [
    "position:fixed",
    `left:${Math.max(10, Math.min(rect.left + 8, window.innerWidth - 190))}px`,
    `top:${Math.max(8, rect.top - 46)}px`,
    "z-index:1000000",
    "display:flex",
    "align-items:center",
    "gap:7px",
    "height:36px",
    "padding:0 12px",
    "border:1px solid rgba(255,255,255,.14)",
    "border-radius:9px",
    "background:#000000",
    "color:#ffffff",
    "font:600 12px/1 ui-sans-serif,system-ui,sans-serif",
    "box-shadow:0 8px 24px rgba(0,0,0,.65)",
    "cursor:pointer",
    "touch-action:manipulation",
  ].join(";");

  prompt.addEventListener("pointerdown", e => e.stopPropagation());
  prompt.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    onAction();
    prompt.remove();
  });
  document.body.appendChild(prompt);

  window.setTimeout(() => {
    if (prompt.isConnected) prompt.remove();
  }, 3000);
}

function installLongPress(row: HTMLElement) {
  const button = row.querySelector<HTMLButtonElement>(":scope > button");
  if (!button || button.dataset.longPressFavoriteInstalled === "true") return;
  button.dataset.longPressFavoriteInstalled = "true";
  button.style.touchAction = "manipulation";

  let timer: number | null = null;
  let longPressed = false;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  button.addEventListener("pointerdown", e => {
    clearTimer();
    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = window.setTimeout(() => {
      longPressed = true;
      const label = button.querySelector("span")?.textContent?.trim() ?? "Tool";
      const key = LABEL_TO_KEY[label];
      if (!key) return;
      const isFav = readFavorites().has(key);
      showPrompt(button, isFav ? "Remove from favourites" : "Add to favourites", () => {
        const starButton = row.querySelector<HTMLButtonElement>(":scope > button:nth-last-child(1)");
        starButton?.click();
        window.setTimeout(refreshFavorites, 30);
      });
    }, 550);
  });

  button.addEventListener("pointermove", e => {
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) clearTimer();
  });

  button.addEventListener("pointerup", e => {
    clearTimer();
    if (longPressed) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  button.addEventListener("pointercancel", clearTimer);
  button.addEventListener("contextmenu", e => e.preventDefault());
  button.addEventListener("click", e => {
    if (longPressed) {
      e.preventDefault();
      e.stopPropagation();
      longPressed = false;
    }
  }, true);
}

function buildFavoritesSection(popup: HTMLElement) {
  const scroll = popup.querySelector<HTMLElement>(":scope > div");
  if (!scroll) return;

  const rows = getToolRows(popup);
  rows.forEach(installLongPress);

  let section = popup.querySelector<HTMLElement>("[data-favorites-section]");
  const favorites = readFavorites();
  const favoriteRows = rows.filter(row => {
    const label = row.querySelector(":scope > button span")?.textContent?.trim();
    return !!label && favorites.has(LABEL_TO_KEY[label]);
  });
  const signature = favoriteRows
    .map(row => LABEL_TO_KEY[row.querySelector(":scope > button span")?.textContent?.trim() ?? ""])
    .join("|");

  if (!favoriteRows.length) {
    section?.remove();
    return;
  }

  if (section?.dataset.signature === signature) return;

  if (!section) {
    section = document.createElement("div");
    section.dataset.favoritesSection = "true";
    section.style.cssText = "padding:4px 0 7px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:3px;";
    scroll.prepend(section);
  }
  section.dataset.signature = signature;
  section.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = "FAVOURITES";
  title.style.cssText = "padding:6px 12px 3px;font:800 9px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.09em;color:rgba(255,255,255,.55);text-transform:uppercase;";
  section.appendChild(title);

  favoriteRows.forEach(row => {
    const originalButton = row.querySelector<HTMLButtonElement>(":scope > button");
    if (!originalButton) return;

    const clone = row.cloneNode(true) as HTMLElement;
    clone.dataset.favRow = "true";
    clone.style.background = "transparent";
    clone.style.cursor = "pointer";
    clone.querySelectorAll("button").forEach(b => {
      b.style.pointerEvents = "none";
      b.tabIndex = -1;
    });
    clone.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      originalButton.click();
    });
    section!.appendChild(clone);
  });
}

let scheduled = false;
function refreshFavorites() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>("[data-drawing-popup]").forEach(popup => {
      if (popup.querySelector("svg.lucide-star")) buildFavoritesSection(popup);
    });
  }, 0);
}

const observer = new MutationObserver(refreshFavorites);

function start() {
  observer.observe(document.body, { childList: true, subtree: true });
  refreshFavorites();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

export {};
