"use client";

/**
 * The prototype's client store: the app state in a React reducer, saved to this browser's localStorage. The
 * rules themselves live in src/lib/core (no React), so the server can run them too; this file re-exports them
 * so screens keep importing from "@/lib/store".
 */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { seed } from "./seed";
import { reducer as coreReducer, type Action as CoreAction } from "./core/reducer";
import { protoCtx } from "./proto-ctx";
import type { AppState } from "./types";

export { overlaps } from "./time";
export { protoCtx } from "./proto-ctx";
export * from "./core/scan";
export * from "./core/orders";

export const STORAGE_KEY = "excursiaconnect-proto-v1";
/** Bumped whenever the seed gains records in arrays that already exist, so a saved browser resets instead of
 *  keeping an older copy that lacks them (hydrate only merges top-level keys). */
export const SEED_VERSION = 17;

/** The rules with the prototype's Ctx: what screens and the rule tests call. */
export function reducer(state: AppState, action: CoreAction): AppState {
  return coreReducer(state, action, protoCtx(state, action));
}

/** Prototype-only actions: start again from the seed, or load a saved browser state. */
type Action = CoreAction | { type: "reset" } | { type: "hydrate"; state: AppState };

function protoReducer(state: AppState, action: Action): AppState {
  if (action.type === "reset") return structuredClone(seed);
  // a state saved before a key existed takes the seed's value for it
  if (action.type === "hydrate") return { ...structuredClone(seed), ...action.state };
  return reducer(state, action);
}

const Ctx = createContext<{ state: AppState; dispatch: (a: Action) => void; hydrated: boolean; storageFull: boolean } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(protoReducer, seed, (s) => structuredClone(s));
  const [hydrated, setHydrated] = useReducer(() => true, false);

  const [storageFull, setStorageFull] = useReducer((_: boolean, v: boolean) => v, false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as AppState & { __v?: number };
        // an older save lacks records the seed has since gained: start from the seed instead
        if (saved.__v === SEED_VERSION) dispatch({ type: "hydrate", state: saved });
        else localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
    setHydrated();
  }, []);

  // another tab saved: take its state, so this tab never writes an older copy over newer work.
  // The save that this hydrate triggers is skipped, or two tabs would echo the same state back and forth.
  const fromOtherTab = useRef(false);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      try {
        if (!e.newValue) {
          fromOtherTab.current = true;
          dispatch({ type: "reset" });
          return;
        }
        const saved = JSON.parse(e.newValue) as AppState & { __v?: number };
        if (saved.__v !== SEED_VERSION) return;
        fromOtherTab.current = true;
        dispatch({ type: "hydrate", state: saved });
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // saving waits for typing to settle: the whole state is written each time
  useEffect(() => {
    if (!hydrated) return;
    if (fromOtherTab.current) {
      fromOtherTab.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, __v: SEED_VERSION }));
        setStorageFull(false);
      } catch {
        setStorageFull(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, hydrated]);

  const value = useMemo(() => ({ state, dispatch, hydrated, storageFull }), [state, hydrated, storageFull]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {storageFull && (
        <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-bad text-white px-4 py-2.5 text-[14px] shadow-lg">
          This browser&apos;s storage is full, so changes are not being saved. Remove uploaded images or reset the demo data.
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}
