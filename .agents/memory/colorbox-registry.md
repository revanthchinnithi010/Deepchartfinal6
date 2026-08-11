---
name: ColorBox picker registry — Symbol Map pattern
description: How to correctly build a "only one open at a time" registry for ColorBox pickers; pitfalls with function-reference exclusion
---

## The rule
Use `Map<symbol, () => void>` keyed by a stable `Symbol()` per instance. Never use `Set<() => void>` with a function-reference `except` check.

## Why
The Set + except pattern breaks when the registered closer is a **wrapper** around `closeRef.current`:

```ts
// BAD — registered fn and passed except are different objects
const closeFn = () => closeRef.current();   // registered
_closeAllColorBoxes(closeRef.current);       // except = different ref
// fn !== except is always TRUE → self-close fires
```

React 18 then batches `setOpen(false)` (from self-close) after the `setOpen(true)` from the toggle, so the picker never opens.

## How to apply
```ts
const _colorBoxClosers = new Map<symbol, () => void>();

function _registerColorBoxCloser(id: symbol, fn: () => void) {
  _colorBoxClosers.set(id, fn);
  return () => { _colorBoxClosers.delete(id); };
}

function _closeAllColorBoxes(exceptId?: symbol) {
  _colorBoxClosers.forEach((fn, id) => { if (id !== exceptId) fn(); });
}

// Inside ColorBox:
const idRef = useRef<symbol>(Symbol());
useEffect(() => _registerColorBoxCloser(idRef.current, () => setOpen(false)), []);

const handleOpen = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  setAnchor(btnRef.current?.getBoundingClientRect() ?? null);
  _closeAllColorBoxes(idRef.current); // close others — excludes self by ID
  setOpen(prev => !prev);             // toggle self — NOT inside a setState updater
}, []);
```

Key: `_closeAllColorBoxes` must be called **outside** any `setState` functional updater. Calling `setState` inside a `setState` updater causes unexpected batching.

## Also fix: rgba() strings in ColorPickerGlass
Settings may store `rgba(r,g,b,a)` strings (e.g. `priceLabelLineColor`). `hex6FromValue` and `alphaFromValue` must parse these with a regex before falling back to hex parsing.
