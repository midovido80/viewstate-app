import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "expo-router";
import { useUserData } from "@/contexts/UserDataContext";
import {
  createNextWorkspaceRepository,
  emptyNextWorkspace,
  recentFromPath,
  recordRecent,
} from "@/services/nextWorkspace";
function useNextState() {
  const { storage } = useUserData(),
    path = usePathname();
  const repository = useMemo(
    () => createNextWorkspaceRepository(storage),
    [storage],
  );
  const [state, setState] = useState(emptyNextWorkspace),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setReady(false);
    setError(false);
    setState(emptyNextWorkspace());
    try {
      const value = await repository.read();
      if (current === generation.current) {
        setState(value);
        setReady(true);
      }
    } catch {
      if (current === generation.current) setError(true);
    }
  }, [repository]);
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, [reload]);
  const change = useCallback(
    async (mutation: Parameters<typeof repository.update>[0]) => {
      const current = generation.current;
      try {
        const value = await repository.update(mutation);
        if (current === generation.current) setState(value);
        return true;
      } catch {
        if (current === generation.current) setError(true);
        return false;
      }
    },
    [repository],
  );
  useEffect(() => {
    if (!ready || error) return;
    const item = recentFromPath(path);
    if (item)
      void change((state) =>
        recordRecent(state, { ...item, at: new Date().toISOString() }),
      );
  }, [path, ready, change, error]);
  return {
    state,
    ready,
    error,
    reload,
    introduce: () => change((state) => ({ ...state, introduced: true })),
  };
}
const Context = createContext<ReturnType<typeof useNextState> | null>(null);
export function NextExperienceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useNextState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useNextExperience() {
  const context = useContext(Context);
  if (!context) throw Error("NEXT_EXPERIENCE_PROVIDER_REQUIRED");
  return context;
}
