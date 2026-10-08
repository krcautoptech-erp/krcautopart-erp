"use client";

import { useEffect, useState, useTransition } from "react";
import {
  deactivatePushSubscriptionAction,
  registerPushSubscriptionAction,
} from "@/app/actions/push-notifications";
import {
  decodeVapidPublicKey,
  subscriptionUsesVapidKey,
} from "@/lib/push-subscription";

type PushState =
  | "checking"
  | "disabled"
  | "enabled"
  | "install-required"
  | "denied"
  | "unsupported";

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean(
        (window.navigator as Navigator & { standalone?: boolean }).standalone,
      ))
  );
}

export async function ensureCurrentSubscription(
  registration: ServiceWorkerRegistration,
  existing: PushSubscription | null,
  publicKey: string,
  createWhenMissing: boolean,
) {
  const applicationServerKey = decodeVapidPublicKey(publicKey);
  let subscription = existing;
  if (
    subscription &&
    !subscriptionUsesVapidKey(
      subscription.options.applicationServerKey,
      applicationServerKey,
    )
  ) {
    const staleEndpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await deactivatePushSubscriptionAction(staleEndpoint);
    subscription = null;
  }
  if (!subscription && createWhenMissing) {
    subscription = await registration.pushManager.subscribe({
      applicationServerKey,
      userVisibleOnly: true,
    });
  }
  return subscription;
}

export async function persistSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.keys?.auth || !json.keys.p256dh) {
    throw new Error("PUSH_KEYS_MISSING");
  }
  return registerPushSubscriptionAction(
    {
      endpoint: subscription.endpoint,
      keys: { auth: json.keys.auth, p256dh: json.keys.p256dh },
    },
    navigator.userAgent,
  );
}

export function PushSubscriptionSynchronizer({
  publicKey,
}: {
  publicKey: string | null;
}) {

  useEffect(() => {
    if (
      !publicKey ||
      Notification.permission !== "granted" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      (isIosDevice() && !isStandalone())
    ) return;

    let active = true;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await registration.pushManager.getSubscription();
        const subscription = await ensureCurrentSubscription(
          registration,
          existing,
          publicKey,
          true,
        );
        if (!subscription || !active) return;
        const result = await persistSubscription(subscription);
        if (!result.success) {
          console.warn("Unable to synchronize Web Push subscription");
        }
      } catch {
        if (active) console.warn("Unable to synchronize Web Push subscription");
      }
    })();
    return () => {
      active = false;
    };
  }, [publicKey]);

  return null;
}

export function PushNotificationControl({
  publicKey,
}: {
  publicKey: string | null;
}) {
  const [state, setState] = useState<PushState>("checking");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const updateState = (nextState: PushState) => {
      queueMicrotask(() => {
        if (active) {
          setState(nextState);
        }
      });
    };

    if (
      !publicKey ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      updateState("unsupported");
      return () => {
        active = false;
      };
    }

    if (isIosDevice() && !isStandalone()) {
      updateState("install-required");
      return () => {
        active = false;
      };
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async (registration) => {
        const existing = await registration.pushManager.getSubscription();
        return ensureCurrentSubscription(
          registration,
          existing,
          publicKey,
          Notification.permission === "granted",
        );
      })
      .then(async (subscription) => {
        if (!active) {
          return;
        }

        if (!subscription) {
          setState(Notification.permission === "denied" ? "denied" : "disabled");
          return;
        }

        const json = subscription.toJSON();
        if (!json.keys?.auth || !json.keys.p256dh) {
          setState("disabled");
          return;
        }

        const result = await registerPushSubscriptionAction(
          {
            endpoint: subscription.endpoint,
            keys: {
              auth: json.keys.auth,
              p256dh: json.keys.p256dh,
            },
          },
          navigator.userAgent,
        );

        if (active) {
          setState(result.success ? "enabled" : "disabled");
        }
      })
      .catch(() => {
        if (active) {
          setState("unsupported");
        }
      });

    return () => {
      active = false;
    };
  }, [publicKey]);

  const enablePush = () => {
    setMessage("");
    startTransition(async () => {
      try {
        if (!publicKey) {
          setState("unsupported");
          return;
        }
        if (isIosDevice() && !isStandalone()) {
          setState("install-required");
          return;
        }

        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "disabled");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const existing = await registration.pushManager.getSubscription();
        const subscription = await ensureCurrentSubscription(
          registration,
          existing,
          publicKey,
          true,
        );
        if (!subscription) throw new Error("PUSH_SUBSCRIPTION_MISSING");
        const result = await persistSubscription(subscription);

        if (!result.success) {
          setMessage(result.error);
          setState("disabled");
          return;
        }

        setState("enabled");
        setMessage("อุปกรณ์นี้พร้อมรับการแจ้งเตือนแล้ว");
      } catch {
        setMessage("เปิดการแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setState("disabled");
      }
    });
  };

  const disablePush = () => {
    setMessage("");
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deactivatePushSubscriptionAction(subscription.endpoint);
      }
      setState("disabled");
      setMessage("ปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว");
    });
  };

  if (state === "unsupported") {
    return null;
  }

  if (state === "install-required") {
    return (
      <div className="rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 py-3">
        <p className="text-[12px] font-bold text-on-surface">
          รับการแจ้งเตือนบน iPhone
        </p>
        <p className="mt-1 text-[11px] leading-5 text-secondary">
          เปิดด้วย Safari แล้วเลือก แชร์ → เพิ่มไปยังหน้าจอโฮม จากนั้นเปิด KRC ERP
          จากไอคอนบนหน้าจอ
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[4px] border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-on-surface">
            แจ้งเตือนบนอุปกรณ์นี้
          </p>
          <p className="mt-0.5 text-[10px] text-secondary">
            {state === "enabled"
              ? "เปิดใช้งานแล้ว"
              : state === "denied"
                ? "เบราว์เซอร์ปิดกั้นการแจ้งเตือน"
                : "รับแจ้งเตือนเมื่อมีเอกสารที่ต้องตรวจสอบ"}
          </p>
        </div>
        <button
          className={`shrink-0 rounded-[4px] border px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50 ${
            state === "enabled"
              ? "border-outline-variant bg-surface-container-lowest text-on-surface"
              : "border-primary bg-primary text-white"
          }`}
          disabled={isPending || state === "checking" || state === "denied"}
          onClick={state === "enabled" ? disablePush : enablePush}
          type="button"
        >
          {isPending
            ? "กำลังบันทึก..."
            : state === "enabled"
              ? "ปิด"
              : "เปิดใช้งาน"}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-[10px] font-medium text-primary">{message}</p>
      ) : null}
    </div>
  );
}
