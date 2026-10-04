export type PdfDeliveryResult = "shared" | "downloaded" | "cancelled";

type PdfShareResult = "shared" | "cancelled" | "unsupported";

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
    if (shared === "shared" || shared === "cancelled") return shared;
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
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    console.warn("Unable to open the PDF share sheet; downloading instead.", error);
    return "unsupported";
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
