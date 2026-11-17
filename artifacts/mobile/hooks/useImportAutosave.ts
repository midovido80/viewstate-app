import { useEffect, useRef } from "react";
import { AppState } from "react-native";

/** Retain typing locally as well as flushing on Back/Continue. Never writes business records. */
export function useImportAutosave(
  snapshot: string,
  persist: () => Promise<unknown>,
  onError: () => void,
) {
  const latest = useRef({ persist, onError });
  latest.current = { persist, onError };
  useEffect(() => {
    const timer = setTimeout(() => {
      void latest.current.persist().catch(() => latest.current.onError());
    }, 500);
    return () => clearTimeout(timer);
  }, [snapshot]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active")
        void latest.current.persist().catch(() => latest.current.onError());
    });
    return () => listener.remove();
  }, []);
}
