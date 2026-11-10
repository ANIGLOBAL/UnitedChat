export type ThemeMode = "light" | "dark" | "system";

const KEY = "unitedchat:theme";

export function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // storage unavailable
  }
  return "system";
}

function mediaDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

export function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && mediaDark());
  document.documentElement.classList.toggle("dark", dark);
}

export function writeTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // storage unavailable
  }
  applyTheme(mode);
  window.dispatchEvent(new Event("unitedchat:theme"));
}

export const THEME_BOOTSTRAP = `(function(){
  try {
    var raw = localStorage.getItem("unitedchat:theme") || "system";
    var dark = raw === "dark" || (raw === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();`;
