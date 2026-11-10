import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { api, getMe, type MiniUser } from "./api";

type AuthContextValue = {
  user: MiniUser | null;
  loading: boolean;
  refresh: () => Promise<MiniUser | null>;
  setUser: (user: MiniUser | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => null,
  setUser: () => undefined,
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MiniUser | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const found = await getMe();
    if (alive.current) {
      setUser(found);
      setLoading(false);
    }
    return found;
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const sync = () => void refresh();
    window.addEventListener("unitedchat:auth", sync);
    return () => {
      alive.current = false;
      window.removeEventListener("unitedchat:auth", sync);
    };
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api("/api/auth/sign-out", { method: "POST", body: JSON.stringify({}) });
    setUser(null);
    window.dispatchEvent(new Event("unitedchat:auth"));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function notifyAuthChanged() {
  window.dispatchEvent(new Event("unitedchat:auth"));
}
