import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "dark" | "light" | "system";
export type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  themeMode: ThemeMode;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  setThemeMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: "dark",
  themeMode: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
  setThemeMode: () => {},
});

function getSystemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem("tj-theme-mode") as ThemeMode | null;
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    // Legacy: check old "tj-theme" key
    const legacy = localStorage.getItem("tj-theme") as Theme | null;
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {}
  return "system";
}

function resolveTheme(mode: ThemeMode): Theme {
  if (mode === "system") return getSystemTheme();
  return mode;
}

function applyTheme(t: Theme) {
  const html = document.documentElement;
  if (t === "light") {
    html.classList.add("light");
    html.classList.remove("dark");
  } else {
    html.classList.add("dark");
    html.classList.remove("light");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getInitialMode);
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme(getInitialMode()));

  useEffect(() => {
    applyTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen to system preference changes when mode is "system"
  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "light" : "dark";
      setThemeState(resolved);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode]);

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    const resolved = resolveTheme(m);
    setThemeState(resolved);
    try {
      localStorage.setItem("tj-theme-mode", m);
      localStorage.setItem("tj-theme", resolved);
    } catch {}
  };

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeModeState(next);
    setThemeState(next);
    try {
      localStorage.setItem("tj-theme-mode", next);
      localStorage.setItem("tj-theme", next);
    } catch {}
  };

  const setTheme = (t: Theme) => {
    setThemeModeState(t);
    setThemeState(t);
    try {
      localStorage.setItem("tj-theme-mode", t);
      localStorage.setItem("tj-theme", t);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ theme, themeMode, toggleTheme, setTheme, setThemeMode }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);
