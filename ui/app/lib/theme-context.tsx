import { createContext, useContext, useEffect, useState } from "react";

import { readTheme, writeTheme, type ThemeMode } from "./theme";

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    setModeState(readTheme());
    const sync = () => setModeState(readTheme());
    window.addEventListener("unitedchat:theme", sync);
    return () => window.removeEventListener("unitedchat:theme", sync);
  }, []);

  const setMode = (next: ThemeMode) => {
    writeTheme(next);
    setModeState(next);
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
