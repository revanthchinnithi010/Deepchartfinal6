const FAVS_KEY = "tv_toolbar_favorites_v4";

const LABEL_TO_KEY: Record<string, string> = {
  "Trendline": "trendline",
  "Ray": "ray",
  "Extended": "extended",
  "Extended line": "extended",
  "H. Line": "hline",
  "Horizontal line": "hline",
  "H. Ray": "hray",
  "Horizontal ray": "hray",
  "V. Line": "vline",
  "Vertical line": "vline",
  "Channel": "channel",
  "Parallel channel": "channel",
  "Fib Ret.": "fib",
  "Fib retracement": "fib",
  "Fib Channel": "fib_channel",
  "Fib channel": "fib_channel",
  "Long Pos.": "position_long",
  "Long position": "position_long",
  "Short Pos.": "position_short",
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
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set<string>();
  }
}

function writeFavorites(favorites: Set<string>) {
  localStorage.setItem(FAVS_KEY, JSON.stringify([...favorites]));
}

function normalizeLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getButtonLabel(button: HTMLElement): string {
  const span = button.querySelector("span");
  return normalizeLabel(span?.textContent || button.textContent || "");
}

function getKeyForButton(button: HTMLElement): string | null {
  return LABEL_TO_KEY[getButtonLabel(button)] ?? null;
}

function findDrawingPopupFrom(start: Element): HTMLElement | null {
  let current: Element | null = start;

  for (let depth = 0; current && depth < 12; depth++, current = current.parentElement) {
    const el = current as HTMLElement;
    if (!(el.textContent || "").includes("Drawing Tools")) continue;

    const mappedButtons = Array.from(el.querySelectorAll("button")).filter(button => {
      return !!getKeyForButton(button as HTMLElement);
    });

    if (mappedButtons.length >= 2) return el;
  }

  return null;
}

function findDrawingPopups(): HTMLElement[] {
  const found = new Set<HTMLElement>();

  document.querySelectorAll<HTMLElement>("[data-drawing-popup]").forEach(el => found.add(el));

  document.querySelectorAll<HTMLElement>("body *").forEach(el => {
    if (!el.textContent?.includes("Drawing Tools")) return;
    const popup = findDrawingPopupFrom(el);
    if (popup) found.add(popup);
  });

  return [...found];
}

function getToolButtons(popup: HTMLElement): HTMLButtonElement[] {
  const buttons: HTMLButtonElement[] = [];
  const seenKeys = new Set<string>();

  popup.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
    if (button.closest("[data-favorites-section]")) return;
    const key = getKeyForButton(button);
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    buttons.push(button);
  });

  return buttons;
}

function showPrompt(button: HTMLButtonElement, key: string) {
  document.querySelectorAll<HTMLElement>("[data-favorite-prompt]").forEach(el => el.remove());

  const isFavorite = readFavorites().has(key);
  const label = isFavorite ? "Remove from favourites" : "Add to favourites";
  const rect = button.getBoundingClientRect();

  const prompt = document.createElement("button");
  prompt.type = "button";
  prompt.dataset.favoritePrompt = "true";
  prompt.innerHTML = `<span style="font-size:17px;line-height:1">★</span><span>${label}</span>`;
  prompt.style.cssText = [
    "position:fixed",
    `left:${Math.max(10, Math.min(rect.left + 8, window.innerWidth - 205))}px`,
    `top:${Math.max(10, rect.top - 50)}px`,
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "gap:8px",
    "height:38px",
    "padding:0 13px",
    "border:1px solid rgba(255,255,255,.18)",
    "border-radius:10px",
    "background:#0b0b0d",
    "color:#fff",
    "font:600 13px/1 ui-sans-serif,system-ui,-apple-system,sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.7)",
    "cursor:pointer",
    "touch-action:manipulation",
    "-webkit-tap-highlight-color:transparent",
  ].join(";");

  const activate = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();

    const favorites = readFavorites();
    if (favorites.has(key)) favorites.delete(key);
    else favorites.add(key);
    writeFavorites(favorites);

    prompt.remove();
    refreshFavorites();
  };

  prompt.addEventListener("pointerdown", e => e.stopPropagation());
  prompt.addEventListener("click", activate);
  document.body.appendChild(prompt);

  window.setTimeout(() => {
    if (prompt.isConnected) prompt.remove();
  }, 3500);
}

function installLongPress(button: HTMLButtonElement) {
  if (button.dataset.longPressFavoriteInstalled === "true") return;
  button.dataset.longPressFavoriteInstalled = "true";
  button.style.touchAction = "manipulation";
  button.style.webkitUserSelect = "none";
  button.style.userSelect = "none";

  let timer: number | null = null;
  let longPressed = false;
  let startX = 0;
  let startY = 0;

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  button.addEventListener("pointerdown", event => {
    clearTimer();
    longPressed = false;
    startX = event.clientX;
    startY = event.clientY;

    timer = window.setTimeout(() => {
      timer = null;
      longPressed = true;
      const key = getKeyForButton(button);
      if (key) showPrompt(button, key);
    }, 600);
  }, true);

  button.addEventListener("pointermove", event => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) clearTimer();
  }, true);

  button.addEventListener("pointerup", event => {
    clearTimer();
    if (longPressed) {
      event.preventDefault();
      event.stopPropagation();
      longPressed = false;
    }
  }, true);

  button.addEventListener("pointercancel", clearTimer, true);
  button.addEventListener("contextmenu", event => event.preventDefault());

  button.addEventListener("click", event => {
    if (longPressed) {
      event.preventDefault();
      event.stopPropagation();
      longPressed = false;
    }
  }, true);
}

function getScrollContainer(popup: HTMLElement): HTMLElement {
  const marked = popup.querySelector<HTMLElement>("[data-drawing-scroll]");
  if (marked) return marked;

  const overflow = popup.querySelector<HTMLElement>("[style*='overflow']");
  if (overflow) return overflow;

  return popup.firstElementChild instanceof HTMLElement ? popup.firstElementChild : popup;
}

function buildFavoritesSection(popup: HTMLElement) {
  const buttons = getToolButtons(popup);
  buttons.forEach(installLongPress);

  const favorites = readFavorites();
  const favoriteButtons = buttons.filter(button => {
    const key = getKeyForButton(button);
    return !!key && favorites.has(key);
  });

  let section = popup.querySelector<HTMLElement>("[data-favorites-section]");

  if (!favoriteButtons.length) {
    section?.remove();
    return;
  }

  const signature = favoriteButtons.map(button => getKeyForButton(button)).join("|");
  if (section?.dataset.signature === signature) return;

  if (!section) {
    section = document.createElement("div");
    section.dataset.favoritesSection = "true";
    section.style.cssText = "padding:5px 0 8px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:3px;";
    getScrollContainer(popup).prepend(section);
  }

  section.dataset.signature = signature;
  section.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = "FAVOURITES";
  title.style.cssText = "padding:6px 12px 5px;font:800 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em;color:rgba(255,255,255,.58);";
  section.appendChild(title);

  favoriteButtons.forEach(originalButton => {
    const clone = originalButton.parentElement?.cloneNode(true) as HTMLElement | null;
    if (!clone) return;

    clone.dataset.favRow = "true";
    clone.style.background = "transparent";
    clone.style.cursor = "pointer";
    clone.querySelectorAll("button").forEach(child => {
      child.style.pointerEvents = "none";
      child.tabIndex = -1;
    });

    clone.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
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
    findDrawingPopups().forEach(buildFavoritesSection);
  }, 30);
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
