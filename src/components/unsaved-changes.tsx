"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConfirmModal } from "@/components/confirm-modal";

type UnsavedChangesContextValue = {
  hasUnsavedChanges: boolean;
  requestNavigation: (navigate: () => void) => void;
  setDirty: (source: string, dirty: boolean) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [dirtySources, setDirtySources] = useState<Set<string>>(() => new Set());
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const hasUnsavedChanges = dirtySources.size > 0;

  const setDirty = useCallback((source: string, dirty: boolean) => {
    setDirtySources((current) => {
      const next = new Set(current);
      if (dirty) next.add(source);
      else next.delete(source);
      return next;
    });
  }, []);

  const requestNavigation = useCallback((navigate: () => void) => {
    if (!hasUnsavedChanges) {
      navigate();
      return;
    }
    setPendingNavigation(() => navigate);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const handleLinkClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || target.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      requestNavigation(() => router.push(`${target.pathname}${target.search}${target.hash}`));
    };
    document.addEventListener("click", handleLinkClick, true);
    return () => document.removeEventListener("click", handleLinkClick, true);
  }, [hasUnsavedChanges, requestNavigation, router]);

  const value = useMemo(() => ({ hasUnsavedChanges, requestNavigation, setDirty }), [hasUnsavedChanges, requestNavigation, setDirty]);

  return <UnsavedChangesContext.Provider value={value}>
    {children}
    <ConfirmModal
      cancelText="อยู่หน้านี้ต่อ"
      confirmText="ออกโดยไม่บันทึก"
      description="หากออกจากหน้านี้ การเปลี่ยนแปลงที่ยังไม่ได้บันทึกจะสูญหาย"
      isOpen={Boolean(pendingNavigation)}
      onClose={() => setPendingNavigation(null)}
      onConfirm={() => {
        const navigate = pendingNavigation;
        setPendingNavigation(null);
        setDirtySources(new Set());
        navigate?.();
      }}
      title="มีข้อมูลที่ยังไม่ได้บันทึก"
      tone="warning"
    />
  </UnsavedChangesContext.Provider>;
}

export function useUnsavedChanges(source: string, dirty: boolean) {
  const { setDirty } = useUnsavedChangesContext();
  useEffect(() => {
    setDirty(source, dirty);
    return () => setDirty(source, false);
  }, [dirty, setDirty, source]);
}

export function useUnsavedChangesContext() {
  const context = useContext(UnsavedChangesContext);
  if (!context) throw new Error("useUnsavedChangesContext must be used inside UnsavedChangesProvider");
  return context;
}
