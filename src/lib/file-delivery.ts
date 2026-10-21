export const FILE_SHARE_READY_EVENT = "krc:file-share-ready";

export type FileDeliveryResult = "shared" | "downloaded" | "cancelled" | "share-ready";

type FileShareResult = "shared" | "cancelled" | "unsupported" | "share-ready";

let pendingShare: { blob: Blob; filename: string; data: ShareData } | null = null;

export type FileDeliveryAdapter = {
  download: (blob: Blob, filename: string) => Promise<"downloaded">;
  isMobileShareDevice: boolean;
  share?: (blob: Blob, filename: string) => Promise<FileShareResult>;
};

export function isMobileFileShareDevice(device: {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
}): boolean {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent);
  const iPadDesktopMode = device.platform === "MacIntel" && device.maxTouchPoints > 1;
  return mobileUserAgent || iPadDesktopMode;
}

export async function deliverFileBlob(
  blob: Blob,
  filename: string,
  adapter: FileDeliveryAdapter,
): Promise<FileDeliveryResult> {
  if (adapter.isMobileShareDevice && adapter.share) {
    const shared = await adapter.share(blob, filename);
    if (shared === "shared" || shared === "cancelled" || shared === "share-ready") {
      return shared;
    }
  }

  return adapter.download(blob, filename);
}

function downloadFileBlob(blob: Blob, filename: string): Promise<"downloaded"> {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
  return Promise.resolve("downloaded");
}

async function shareFileBlob(blob: Blob, filename: string): Promise<FileShareResult> {
  pendingShare = null;
  const file = new File([blob], filename, { type: blob.type.split(";")[0] || "application/octet-stream" });
  const shareData: ShareData = { files: [file], title: filename };

  if (typeof navigator.canShare !== "function" || !navigator.canShare(shareData)) {
    return "unsupported";
  }

  try {
    await navigator.share(shareData);
    pendingShare = null;
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      pendingShare = null;
      return "cancelled";
    }
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "SecurityError")
    ) {
      pendingShare = { blob, filename, data: shareData };
      window.dispatchEvent(new Event(FILE_SHARE_READY_EVENT));
      return "share-ready";
    }
    console.warn("Unable to open the file share sheet; downloading instead.", error);
    pendingShare = null;
    return "unsupported";
  }
}

export async function retryPendingFileShare(): Promise<FileDeliveryResult> {
  const prepared = pendingShare;
  if (!prepared) return "cancelled";

  try {
    await navigator.share(prepared.data);
    pendingShare = null;
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      pendingShare = null;
      return "cancelled";
    }
    console.warn("Unable to retry the file share sheet; downloading instead.", error);
    pendingShare = null;
    return downloadFileBlob(prepared.blob, prepared.filename);
  }
}

export function canUseMobileFileShare(): boolean {
  if (typeof navigator === "undefined") return false;
  return isMobileFileShareDevice({
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  }) && typeof navigator.share === "function" && typeof navigator.canShare === "function";
}

export function createBrowserFileDeliveryAdapter(): FileDeliveryAdapter {
  const isMobileShareDevice = canUseMobileFileShare();
  return {
    download: downloadFileBlob,
    isMobileShareDevice,
    share: isMobileShareDevice ? shareFileBlob : undefined,
  };
}

