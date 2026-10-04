export const PDF_SHARE_READY_EVENT = "krc:pdf-share-ready";

export type PdfDeliveryResult = "shared" | "downloaded" | "cancelled" | "share-ready";

type PdfShareResult = "shared" | "cancelled" | "unsupported" | "share-ready";

let pendingShare: { blob: Blob; filename: string; data: ShareData } | null = null;

export type PdfDeliveryAdapter = {
  download: (blob: Blob, filename: string) => Promise<"downloaded">;
  isMobileShareDevice: boolean;
  share?: (blob: Blob, filename: string) => Promise<PdfShareResult>;
};

export function isMobilePdfShareDevice(device: {
  maxTouchPoints: number;
  platform: string;
  userAgent: string;
}): boolean {
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent);
  const iPadDesktopMode = device.platform === "MacIntel" && device.maxTouchPoints > 1;
  return mobileUserAgent || iPadDesktopMode;
}

export async function deliverPdfBlob(
  blob: Blob,
  filename: string,
  adapter: PdfDeliveryAdapter,
): Promise<PdfDeliveryResult> {
  if (adapter.isMobileShareDevice && adapter.share) {
    const shared = await adapter.share(blob, filename);
    if (shared === "shared" || shared === "cancelled" || shared === "share-ready") {
      return shared;
    }
  }

  return adapter.download(blob, filename);
}

function downloadPdfBlob(blob: Blob, filename: string): Promise<"downloaded"> {
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

async function sharePdfBlob(blob: Blob, filename: string): Promise<PdfShareResult> {
  const file = new File([blob], filename, { type: "application/pdf" });
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
      window.dispatchEvent(new Event(PDF_SHARE_READY_EVENT));
      return "share-ready";
    }
    console.warn("Unable to open the PDF share sheet; downloading instead.", error);
    pendingShare = null;
    return "unsupported";
  }
}

export async function retryPendingPdfShare(): Promise<PdfDeliveryResult> {
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
    console.warn("Unable to retry the PDF share sheet; downloading instead.", error);
    pendingShare = null;
    return downloadPdfBlob(prepared.blob, prepared.filename);
  }
}

export function canUseMobilePdfShare(): boolean {
  if (typeof navigator === "undefined") return false;
  return isMobilePdfShareDevice({
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  }) && typeof navigator.share === "function" && typeof navigator.canShare === "function";
}

export function createBrowserPdfDeliveryAdapter(): PdfDeliveryAdapter {
  const isMobileShareDevice = canUseMobilePdfShare();
  return {
    download: downloadPdfBlob,
    isMobileShareDevice,
    share: isMobileShareDevice ? sharePdfBlob : undefined,
  };
}
