const KEY = "fw-theme";

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme() {
  // 1) saved preference wins
  let theme = localStorage.getItem(KEY);
  // 2) otherwise OS preference
  if (!theme) {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    theme = prefersLight ? "light" : "dark";
  }
  applyTheme(theme);
  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem(KEY, next);
  applyTheme(next);
  return next;
}
