"use client";

import { createContext, useContext, type ReactNode } from "react";
import { canPerform } from "@/lib/permission-ui";

const PermissionContext = createContext({ codes: [] as readonly string[], isOwner: false });

export function PermissionProvider({ children, codes, isOwner }: { children: ReactNode; codes: string[]; isOwner: boolean }) {
  return <PermissionContext value={{ codes, isOwner }}>{children}</PermissionContext>;
}

export function useHasPermission(code: string | readonly string[] | null) {
  const permissions = useContext(PermissionContext);
  return canPerform(permissions.codes, permissions.isOwner, code);
}

export function usePermissions() {
  return useContext(PermissionContext);
}
