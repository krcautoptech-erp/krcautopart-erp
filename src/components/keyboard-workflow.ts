import type { KeyboardEvent } from "react";

type EnterState = {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  targetTag?: string;
  targetType?: string;
};

const nativeActivationTypes = new Set(["button", "checkbox", "radio", "submit"]);

export function shouldRunEnterAction(event: EnterState) {
  if (event.key !== "Enter" || event.isComposing || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.targetTag === "TEXTAREA" || event.targetTag === "BUTTON" || event.targetTag === "SELECT") return false;
  return !(event.targetTag === "INPUT" && nativeActivationTypes.has(event.targetType ?? ""));
}

export function runEnterAction<T extends HTMLElement>(event: KeyboardEvent<T>, action: () => void) {
  const target = event.target as HTMLInputElement;
  if (!shouldRunEnterAction({
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    isComposing: event.nativeEvent.isComposing,
    targetTag: target.tagName,
    targetType: target.type,
  })) return;
  event.preventDefault();
  action();
}

export function focusKeyboardTarget(name: string) {
  window.requestAnimationFrame(() => {
    const targets = document.querySelectorAll<HTMLElement>(`[data-keyboard-target="${CSS.escape(name)}"]`);
    Array.from(targets).find((target) => target.offsetParent !== null)?.focus();
  });
}
