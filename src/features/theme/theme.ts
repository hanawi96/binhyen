export const THEME_STORAGE_KEY = "binhyen-theme";

const THEME_COLOR_LIGHT = "#f8f6f0";
const THEME_COLOR_DARK = "#1b2320";

export type ThemeChoice = "light" | "dark";

export function readTheme(): ThemeChoice {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;

  if (theme === "dark") {
    root.dataset.theme = "dark";
  } else {
    delete root.dataset.theme;
  }

  const meta = document.querySelector('meta[name="theme-color"]');

  if (meta) {
    meta.setAttribute(
      "content",
      theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
    );
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Trình duyệt chặn lưu thì lần sau vẫn mở ở chế độ sáng.
  }
}
