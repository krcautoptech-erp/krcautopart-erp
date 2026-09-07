"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  getDefaultWorkspaceTabs,
  getWorkspaceTabForPath,
  type WorkspaceTab,
} from "@/components/workspace-tabs";

type AppContextType = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  workspaceTabs: WorkspaceTab[];
  syncWorkspaceTab: (pathname: string) => void;
  closeWorkspaceTab: (href: string) => void;
};

const AppContext = createContext<AppContextType | undefined>(undefined);
const WORKSPACE_TABS_STORAGE_KEY = "krc_workspace_tabs";

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(() =>
    getDefaultWorkspaceTabs(),
  );

  // Initialize theme from localStorage if available
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsDarkMode(true);
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    const savedTabs = sessionStorage.getItem(WORKSPACE_TABS_STORAGE_KEY);
    if (!savedTabs) {
      return;
    }

    try {
      const parsedTabs = JSON.parse(savedTabs) as WorkspaceTab[];
      if (!Array.isArray(parsedTabs)) {
        return;
      }
      const migratedTabs = parsedTabs.reduce<WorkspaceTab[]>((tabs, tab) => {
        const normalized = ["/products", "/inventory/materials"].includes(tab.href)
          ? { ...tab, href: "/items", icon: "inventory_2", title: "รายการสินค้า" }
          : tab.href === "/items"
          ? { ...tab, icon: "inventory_2", title: "รายการสินค้า" }
          : tab;
        return tabs.some((item) => item.href === normalized.href) ? tabs : [...tabs, normalized];
      }, []);
      // Restore persisted UI state after hydration and migrate legacy item tabs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWorkspaceTabs(migratedTabs);
    } catch {
      sessionStorage.removeItem(WORKSPACE_TABS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, JSON.stringify(workspaceTabs));
  }, [workspaceTabs]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        localStorage.setItem("theme", "dark");
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        localStorage.setItem("theme", "light");
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  };

  const syncWorkspaceTab = useCallback((pathname: string) => {
    const matchedTab = getWorkspaceTabForPath(pathname);
    if (!matchedTab) {
      return;
    }

    setWorkspaceTabs((prev) => {
      const currentTabs = prev.filter(
        (tab) =>
          !(
            matchedTab.href === "/settings/users" &&
            tab.href === "/settings/roles"
          ),
      );
      if (currentTabs.some((tab) => tab.href === matchedTab.href)) {
        return currentTabs;
      }
      return [...currentTabs, matchedTab];
    });
  }, []);

  const closeWorkspaceTab = useCallback((href: string) => {
    setWorkspaceTabs((prev) => prev.filter((tab) => tab.href !== href));
  }, []);

  return (
    <AppContext.Provider
      value={{
        searchQuery,
        setSearchQuery,
        isDarkMode,
        setIsDarkMode,
        toggleDarkMode,
        isAddModalOpen,
        setIsAddModalOpen,
        workspaceTabs,
        syncWorkspaceTab,
        closeWorkspaceTab,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
