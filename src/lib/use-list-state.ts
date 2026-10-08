"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSessionMemoryUser } from "@/components/session-memory-context";
import { matchesMemoryShape, parseListMemory, readSessionMemory, sessionMemoryKey, writeSessionMemory } from "./session-memory";

type ListStore = { snapshot: string | null; search: string | null; listeners: Set<() => void> };
const stores = new Map<string, ListStore>();
const serverSnapshot = () => null;

function getListSnapshot(store: ListStore, key: string) {
  const search = window.location.search;
  if (store.search !== search) {
    const params = new URLSearchParams(search);
    store.snapshot = params.get("view") ?? (params.size === 0 ? readSessionMemory(key) : null);
    store.search = search;
  }
  return store.snapshot;
}

function updateListStore(store: ListStore, key: string, values: Record<string, unknown>) {
  store.snapshot = JSON.stringify(values);
  writeSessionMemory(key, store.snapshot);
  const url = new URL(window.location.href);
  url.searchParams.set("view", store.snapshot);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  store.search = url.search;
  store.listeners.forEach((notify) => notify());
}

export function useListState<T>(field: string, initialValue: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const userId = useSessionMemoryUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [initial] = useState(initialValue);
  const key = sessionMemoryKey(userId ?? "", "list", pathname);
  const store = useMemo(() => {
    if (!stores.has(key)) stores.set(key, { snapshot: null, search: null, listeners: new Set() });
    return stores.get(key)!;
  }, [key]);
  const subscribe = useCallback((notify: () => void) => { store.listeners.add(notify); return () => { store.listeners.delete(notify); }; }, [store]);
  const getSnapshot = useCallback(() => {
    if (!userId) return null;
    return getListSnapshot(store, key);
  }, [key, store, userId]);
  // Reading searchParams also makes browser Back/Forward update the snapshot.
  void searchParams;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  useEffect(() => {
    if (snapshot && window.location.pathname === pathname && !window.location.search) updateListStore(store, key, parseListMemory(snapshot));
  }, [key, pathname, snapshot, store]);
  const saved = useMemo(() => parseListMemory(snapshot)[field], [field, snapshot]);
  const value = matchesMemoryShape(saved, initial) ? saved as T : initial;
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const values = parseListMemory(getSnapshot());
    const previous = matchesMemoryShape(values[field], initial) ? values[field] as T : initial;
    values[field] = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    updateListStore(store, key, values);
  }, [field, getSnapshot, initial, key, store]);
  return [value, setValue];
}

export function useRememberedListUrl(transientParameter?: string) {
  const userId = useSessionMemoryUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const rememberedParams = new URLSearchParams(search);
  if (transientParameter) rememberedParams.delete(transientParameter);
  const rememberedSearch = rememberedParams.toString();
  const visitedPath = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const key = sessionMemoryKey(userId, "url", pathname);
    const identity = `${userId}:${pathname}`;
    const entering = visitedPath.current !== identity;
    visitedPath.current = identity;
    if (entering && !search) {
      const saved = readSessionMemory(key);
      if (saved?.startsWith(`${pathname}?`) && !saved.includes("#")) { router.replace(saved, { scroll: false }); return; }
    }
    writeSessionMemory(key, `${pathname}${rememberedSearch ? `?${rememberedSearch}` : ""}`);
  }, [pathname, rememberedSearch, router, search, userId]);
  useListScroll();
}

export function useListScroll() {
  const userId = useSessionMemoryUser();
  const pathname = usePathname();
  useEffect(() => {
    if (!userId) return;
    const key = sessionMemoryKey(userId, "scroll", pathname);
    const saved = parseListMemory(readSessionMemory(key));
    const content = document.querySelector<HTMLElement>("[data-settings-content]");
    let restoring = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const restore = () => {
      const y = typeof saved.y === "number" && Number.isFinite(saved.y) ? Math.max(0, saved.y) : 0;
      const x = typeof saved.x === "number" && Number.isFinite(saved.x) ? Math.max(0, saved.x) : 0;
      if (content) content.scrollTo(x, y); else window.scrollTo(x, y);
      const position = content?.scrollTop ?? window.scrollY;
      if (position >= y || ++attempts >= 20) restoring = false;
      else timer = setTimeout(restore, 100);
    };
    timer = setTimeout(restore, 0);
    const save = () => {
      if (!restoring) writeSessionMemory(key, JSON.stringify({ x: content?.scrollLeft ?? window.scrollX, y: content?.scrollTop ?? window.scrollY }));
    };
    const stopRestoring = () => { restoring = false; clearTimeout(timer); };
    const target = content ?? window;
    target.addEventListener("scroll", save, { passive: true });
    window.addEventListener("wheel", stopRestoring, { passive: true });
    window.addEventListener("touchstart", stopRestoring, { passive: true });
    return () => {
      clearTimeout(timer);
      target.removeEventListener("scroll", save);
      window.removeEventListener("wheel", stopRestoring);
      window.removeEventListener("touchstart", stopRestoring);
    };
  }, [pathname, userId]);
}
