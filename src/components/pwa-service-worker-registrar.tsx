"use client";

import { useEffect } from "react";

export function PwaServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => {
        console.error("Unable to register the PWA service worker:", error);
      });
  }, []);

  return null;
}
