export const SIGNATURE_WIDTH = 1200;
export const SIGNATURE_HEIGHT = 400;
export const MAX_SIGNATURE_FILE_SIZE = 2 * 1024 * 1024;
export const SIGNATURE_BUCKET = "approval-signatures";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export function removeLightSignatureBackground(pixels: Uint8ClampedArray) {
  for (let index = 0; index < pixels.length; index += 4) {
    const darkest = Math.min(pixels[index], pixels[index + 1], pixels[index + 2]);
    const lightest = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
    if (lightest - darkest > 24 || darkest < 210) continue;
    pixels[index + 3] = Math.round(
      pixels[index + 3] * Math.max(0, (245 - darkest) / 35),
    );
  }
}

export function getPngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

export function validateNormalizedSignature(bytes: Uint8Array, size: number) {
  if (size > MAX_SIGNATURE_FILE_SIZE) return "ไฟล์ลายเซ็นต้องมีขนาดไม่เกิน 2 MB";
  const dimensions = getPngDimensions(bytes);
  if (!dimensions) return "ไฟล์ลายเซ็นต้องเป็น PNG";
  if (
    dimensions.width !== SIGNATURE_WIDTH ||
    dimensions.height !== SIGNATURE_HEIGHT
  ) {
    return `ไฟล์ลายเซ็นต้องมีขนาด ${SIGNATURE_WIDTH} × ${SIGNATURE_HEIGHT} พิกเซล`;
  }
  return null;
}
