export function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = globalThis.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function subscriptionUsesVapidKey(
  subscriptionKey: ArrayBuffer | ArrayBufferView | null,
  expectedKey: Uint8Array,
) {
  if (!subscriptionKey) return false;
  const current = ArrayBuffer.isView(subscriptionKey)
    ? new Uint8Array(
        subscriptionKey.buffer,
        subscriptionKey.byteOffset,
        subscriptionKey.byteLength,
      )
    : new Uint8Array(subscriptionKey);
  if (current.byteLength !== expectedKey.byteLength) return false;
  return current.every((value, index) => value === expectedKey[index]);
}

