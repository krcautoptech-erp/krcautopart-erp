import { createECDH, timingSafeEqual } from "node:crypto";

type VapidEnvironment = Record<string, string | undefined>;

export type VapidConfiguration = {
  privateKey: string;
  publicKey: string;
  publicKeyMatchesEnvironment: boolean;
  subject: string;
};

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function deriveVapidPublicKey(privateKey: string): string {
  const decoded = decodeBase64Url(privateKey.trim());
  if (decoded.length !== 32) {
    throw new Error("VAPID_PRIVATE_KEY must decode to 32 bytes.");
  }
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(decoded);
  return ecdh.getPublicKey(undefined, "uncompressed").toString("base64url");
}

function validateSubject(subject: string): string {
  let parsed: URL;
  try {
    parsed = new URL(subject);
  } catch {
    throw new Error("VAPID_SUBJECT must be a valid mailto: or HTTPS URL.");
  }
  const validProtocol = parsed.protocol === "mailto:" || parsed.protocol === "https:";
  const unsafeLocalHost = parsed.protocol === "https:" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname.toLowerCase());
  if (!validProtocol || unsafeLocalHost) {
    throw new Error("VAPID_SUBJECT must be a public mailto: or HTTPS URL.");
  }
  return subject;
}

export function resolveVapidConfiguration(
  environment: VapidEnvironment,
): VapidConfiguration {
  const privateKey = environment.VAPID_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error("VAPID_PRIVATE_KEY is required.");
  const subjectValue = environment.VAPID_SUBJECT?.trim();
  if (!subjectValue) throw new Error("VAPID_SUBJECT is required.");

  const publicKey = deriveVapidPublicKey(privateKey);
  const configuredPublicKey = environment.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  let publicKeyMatchesEnvironment = !configuredPublicKey;
  if (configuredPublicKey) {
    try {
      const configured = decodeBase64Url(configuredPublicKey);
      const derived = decodeBase64Url(publicKey);
      publicKeyMatchesEnvironment = configured.length === derived.length &&
        timingSafeEqual(configured, derived);
    } catch {
      publicKeyMatchesEnvironment = false;
    }
  }

  return {
    privateKey,
    publicKey,
    publicKeyMatchesEnvironment,
    subject: validateSubject(subjectValue),
  };
}
