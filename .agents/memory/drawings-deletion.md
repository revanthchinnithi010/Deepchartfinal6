---
name: Drawings deletion persistence
description: How deleted drawing IDs are kept out of the store after page refresh
---

## Rule
When a drawing is deleted, its ID is added to a localStorage set (`tv_deleted_drawing_ids`). On the next page load, the API response is filtered against this set before calling `resetDrawings()`.

**Why:** The API server returns all drawings; without the client-side filter, deleted drawings reappear after refresh even when DELETE succeeds, because the GET on mount overwrites local state.

**How to apply:**
- `removeDrawing(id)` in drawingStore.ts automatically calls `persistDeletedId(id)` — no extra call needed at call sites.
- DrawingOverlay.tsx load useEffect calls `resetDrawings(data.filter(d => !deletedIds.has(d.id)))`.
- ObjectTreePanel in charts.tsx also calls `removeDrawing(id)`, so it's covered automatically.
- `resetDrawings()` does NOT push to undo history (unlike `setDrawings()`). Use it only for server loads.
- The deleted-ID set caps at 1000 entries to avoid localStorage bloat.
