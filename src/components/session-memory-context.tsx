"use client";

import { createContext, useContext, type ReactNode } from "react";

const SessionMemoryContext = createContext<string | null>(null);

export function SessionMemoryProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  return <SessionMemoryContext value={userId}>{children}</SessionMemoryContext>;
}

export function useSessionMemoryUser() {
  return useContext(SessionMemoryContext);
}
