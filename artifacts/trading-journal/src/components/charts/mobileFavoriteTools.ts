const STORAGE_KEY = "deepcharts.mobileDrawingFavorites.v1";

const TOOL_LABELS = [
  "Trendline", "Ray", "Extended", "H. Line", "H. Ray", "V. Line", "Channel",
  "Fib Ret.", "Fib Channel", "Long Pos.", "Short Pos.", "Date Range", "Price Range",
  "Text", "Note", "Brush", "Highlighter", "Rectangle", "Circle",
];

type FavoriteState = { timer: number | null; longPressed: boolean };
const pressState = new WeakMap<HTMLElement, FavoriteState>();

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string" && TOOL_LABELS.includes(x)) : [];
  } catch { return []; }
}

function saveFavorites(items: string[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
}

function findSheetRoot(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(el => el.textContent?.trim() === "Drawing Tools" && visible(el));
  for (const heading of headings) {
    let root: HTMLElement | null = heading;
    for (let i = 0; i < 9 && root; i++, root = root.parentElement) {
      const text = root.textContent || "";
      if (text.includes("LINES") && text.includes("FIBONACCI") && root.querySelectorAll("button").length >= 10) return root;
    }
  }
  return null;
}

function findToolButton(root: HTMLElement, label: string): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent?.trim() === label && visible(b)) || null;
}

function showTooltip(button: HTMLElement, label: string, onAdd: () => void) {
  document.querySelectorAll(".dc-mobile-fav-tooltip").forEach(x => x.remove());
  const tip = document.createElement("div");
  tip.className = "dc-mobile-fav-tooltip";
  Object.assign(tip.style, {
    position: "fixed", zIndex: "2147483647", padding: "9px 12px", borderRadius: "10px",
    background: "#17181d", border: "1px solid rgba(255,255,255,.16)", color: "#fff",
    font: "600 13px/1.2 system-ui,sans-serif", boxShadow: "0 8px 28px rgba(0,0,0,.55)",
    whiteSpace: "nowrap", touchAction: "none",
  } as CSSStyleDeclaration);
  const isFav = loadFavorites().includes(label);
  tip.textContent = isFav ? "Remove from favourites" : "☆ Add to favourites";
  const r = button.getBoundingClientRect();
  tip.style.left = `${Math.max(12, Math.min(window.innerWidth - 230, r.left + r.width / 2 - 80))}px`;
  tip.style.top = `${Math.max(12, r.top - 52)}px`;
  tip.addEventListener("click", e => { e.stopPropagation(); onAdd(); tip.remove(); });
  document.body.appendChild(tip);
  window.setTimeout(() => { if (tip.isConnected) tip.remove(); }, 3500);
}

function toggleFavorite(label: string) {
  const items = loadFavorites();
  const next = items.includes(label) ? items.filter(x => x !== label) : [label, ...items];
  saveFavorites(next);
  window.dispatchEvent(new CustomEvent("dc-mobile-favorites-changed"));
}

function wireLongPress(button: HTMLButtonElement, label: string) {
  if (button.dataset.dcFavLongPress === "1") return;
  button.dataset.dcFavLongPress = "1";
  const state: FavoriteState = { timer: null, longPressed: false };
  pressState.set(button, state);

  button.addEventListener("pointerdown", () => {
    state.longPressed = false;
    state.timer = window.setTimeout(() => {
      state.longPressed = true;
      if (navigator.vibrate) navigator.vibrate(12);
      showTooltip(button, label, () => toggleFavorite(label));
    }, 600);
  }, { passive: true });
  const cancel = () => { if (state.timer !== null) window.clearTimeout(state.timer); state.timer = null; };
  button.addEventListener("pointerup", cancel, { passive: true });
  button.addEventListener("pointercancel", cancel, { passive: true });
  button.addEventListener("pointerleave", cancel, { passive: true });
  button.addEventListener("click", e => {
    if (state.longPressed) { e.preventDefault(); e.stopImmediatePropagation(); state.longPressed = false; }
  }, true);
}

function buildFavorites(root: HTMLElement) {
  const names = loadFavorites();
  const existing = root.querySelector<HTMLElement>("[data-dc-mobile-favorites]");
  if (!names.length) { existing?.remove(); return; }

  const firstHeading = Array.from(root.querySelectorAll<HTMLElement>("*")).find(el => el.textContent?.trim() === "LINES");
  if (!firstHeading) return;
  const anchor = firstHeading.parentElement || firstHeading;

  const section = existing || document.createElement("section");
  section.setAttribute("data-dc-mobile-favorites", "1");
  if (!existing) {
    section.style.cssText = "padding:0 24px 18px;";
    anchor.parentElement?.insertBefore(section, anchor);
  }
  section.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = "FAVORITES";
  title.style.cssText = "font:700 13px/1 system-ui,sans-serif;letter-spacing:1.4px;color:rgba(255,255,255,.82);margin:0 0 12px;";
  section.appendChild(title);

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;";
  section.appendChild(grid);

  for (const name of names) {
    const original = findToolButton(root, name);
    if (!original) continue;
    const clone = original.cloneNode(true) as HTMLButtonElement;
    clone.removeAttribute("data-dc-fav-long-press");
    clone.title = "Tap to use • Hold to remove favourite";
    clone.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation(); original.click();
    });
    clone.addEventListener("contextmenu", e => e.preventDefault());
    grid.appendChild(clone);
  }
}

function apply() {
  const root = findSheetRoot();
  if (!root) return;
  for (const label of TOOL_LABELS) {
    const button = findToolButton(root, label);
    if (button) wireLongPress(button, label);
  }
  buildFavorites(root);
}

let raf = 0;
function schedule() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { raf = 0; apply(); });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("dc-mobile-favorites-changed", schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(schedule, 250);
}
