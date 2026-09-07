"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  title?: string;
  duration?: number; // milliseconds, default 3500
  action?: {
    label: string;
    onClick: () => void;
  };
};

export type ToastOptionsInput = string | ToastOptions;

function normalizeOptions(options?: ToastOptionsInput): ToastOptions | undefined {
  if (typeof options === "string") {
    return { title: options };
  }
  return options;
}

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: number;
};

type ToastContextType = {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, options?: ToastOptionsInput) => string;
  dismissToast: (id: string) => void;
  success: (message: string, options?: ToastOptionsInput) => string;
  error: (message: string, options?: ToastOptionsInput) => string;
  warning: (message: string, options?: ToastOptionsInput) => string;
  info: (message: string, options?: ToastOptionsInput) => string;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let globalToastHandler: ((message: string, type: ToastType, options?: ToastOptionsInput) => string) | null = null;

/**
 * Direct global toast API (can be called anywhere in client components)
 */
export const toast = {
  success: (message: string, options?: ToastOptionsInput) =>
    globalToastHandler?.(message, "success", normalizeOptions(options)) ?? "",
  error: (message: string, options?: ToastOptionsInput) =>
    globalToastHandler?.(message, "error", normalizeOptions(options)) ?? "",
  warning: (message: string, options?: ToastOptionsInput) =>
    globalToastHandler?.(message, "warning", normalizeOptions(options)) ?? "",
  info: (message: string, options?: ToastOptionsInput) =>
    globalToastHandler?.(message, "info", normalizeOptions(options)) ?? "",
  show: (message: string, type: ToastType = "info", options?: ToastOptionsInput) =>
    globalToastHandler?.(message, type, normalizeOptions(options)) ?? "",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", options?: ToastOptionsInput) => {
      const parsedOptions = normalizeOptions(options);
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const duration = parsedOptions?.duration ?? (type === "error" ? 5000 : 3500);

      const newToast: ToastItem = {
        id,
        type,
        message,
        title: parsedOptions?.title,
        duration,
        action: parsedOptions?.action,
        createdAt: Date.now(),
      };

      setToasts((prev) => [...prev.slice(-4), newToast]); // keep max 5 toasts
      return id;
    },
    [],
  );

  useEffect(() => {
    globalToastHandler = showToast;
    return () => {
      globalToastHandler = null;
    };
  }, [showToast]);

  const success = useCallback(
    (message: string, options?: ToastOptionsInput) => showToast(message, "success", options),
    [showToast],
  );
  const error = useCallback(
    (message: string, options?: ToastOptionsInput) => showToast(message, "error", options),
    [showToast],
  );
  const warning = useCallback(
    (message: string, options?: ToastOptionsInput) => showToast(message, "warning", options),
    [showToast],
  );
  const info = useCallback(
    (message: string, options?: ToastOptionsInput) => showToast(message, "info", options),
    [showToast],
  );

  const contextValue = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      success,
      error,
      warning,
      info,
    }),
    [toasts, showToast, dismissToast, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      toasts: [],
      showToast: toast.show,
      dismissToast: () => {},
      success: toast.success,
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
    };
  }
  return context;
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[200] flex w-full max-w-[380px] flex-col gap-2 sm:right-6 sm:top-6"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  );
}

const typeStyles: Record<
  ToastType,
  {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    stripClass: string;
    iconClass: string;
    badgeClass: string;
    defaultTitle: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    stripClass: "bg-emerald-600 dark:bg-emerald-500",
    iconClass: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    defaultTitle: "ดำเนินการสำเร็จ",
  },
  error: {
    icon: AlertCircle,
    stripClass: "bg-primary dark:bg-red-500",
    iconClass: "text-primary dark:text-red-400",
    badgeClass: "bg-red-50 text-primary border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
    defaultTitle: "เกิดข้อผิดพลาด",
  },
  warning: {
    icon: AlertTriangle,
    stripClass: "bg-amber-500 dark:bg-amber-400",
    iconClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    defaultTitle: "ข้อควรระวัง",
  },
  info: {
    icon: Info,
    stripClass: "bg-blue-600 dark:bg-blue-500",
    iconClass: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    defaultTitle: "แจ้งเตือนข้อมูล",
  },
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: () => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const remainingRef = useRef(item.duration);
  const startTimeRef = useRef(0);

  const style = typeStyles[item.type];
  const Icon = style.icon;

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(onDismiss, 180);
  }, [onDismiss]);

  useEffect(() => {
    if (isPaused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      remainingRef.current -= Date.now() - startTimeRef.current;
      return;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      handleClose();
    }, Math.max(remainingRef.current, 500));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPaused, handleClose]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="alert"
      className={`pointer-events-auto relative flex overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest text-on-surface shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] transition-all duration-200 ${
        exiting ? "scale-95 opacity-0 translate-x-4" : "animate-in slide-in-from-top-3 fade-in duration-200"
      }`}
    >
      {/* Left colored accent strip */}
      <div className={`w-1.5 shrink-0 ${style.stripClass}`} />

      {/* Content */}
      <div className="flex flex-1 items-start gap-3 p-3.5 pl-3">
        <div className="mt-0.5 shrink-0">
          <Icon size={18} className={style.iconClass} />
        </div>

        <div className="min-w-0 flex-1">
          {item.title ? (
            <p className="text-[13px] font-bold leading-tight text-on-surface">
              {item.title}
            </p>
          ) : null}
          <p
            className={`text-[12px] font-medium leading-snug text-on-surface ${
              item.title ? "mt-0.5 text-on-surface-variant" : ""
            }`}
          >
            {item.message}
          </p>

          {item.action && (
            <button
              type="button"
              onClick={() => {
                item.action?.onClick();
                handleClose();
              }}
              className="mt-2 inline-flex items-center text-[11px] font-bold text-primary hover:underline"
            >
              {item.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          aria-label="ปิดการแจ้งเตือน"
          onClick={handleClose}
          className="ml-1 -mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-[3px] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <X size={14} />
        </button>
      </div>

      {/* Animated countdown line at the bottom */}
      <div
        className={`absolute bottom-0 left-0 right-0 h-0.5 opacity-40 ${style.stripClass}`}
        style={{
          animation: `toast-progress ${item.duration}ms linear forwards`,
          animationPlayState: isPaused ? "paused" : "running",
        }}
      />
    </div>
  );
}
