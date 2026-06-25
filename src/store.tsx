import { createContext, useContext, useState, type ReactNode } from "react";

interface AppState {
  selectedHost: string;
  setSelectedHost: (h: string) => void;
  knownHosts: string[];
  registerHosts: (hosts: string[]) => void;
  refreshMs: number;
  setRefreshMs: (ms: number) => void;
}

const Ctx = createContext<AppState | null>(null);

const HOST_STORAGE_KEY = "edr-explorer:selected-host";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [selectedHost, setSelectedHostState] = useState<string>(
    () => localStorage.getItem(HOST_STORAGE_KEY) ?? "",
  );
  const [knownHosts, setKnownHosts] = useState<string[]>([]);
  const [refreshMs, setRefreshMs] = useState<number>(5000);

  const setSelectedHost = (h: string) => {
    setSelectedHostState(h);
    localStorage.setItem(HOST_STORAGE_KEY, h);
  };

  const registerHosts = (hosts: string[]) => {
    setKnownHosts((prev) => {
      const merged = Array.from(new Set([...prev, ...hosts])).sort();
      return merged.length === prev.length && merged.every((h, i) => h === prev[i]) ? prev : merged;
    });
  };

  return (
    <Ctx.Provider value={{ selectedHost, setSelectedHost, knownHosts, registerHosts, refreshMs, setRefreshMs }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
