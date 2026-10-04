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

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local");
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
  const mailDomain = parsed.protocol === "mailto:"
    ? parsed.pathname.split("@").at(-1)?.toLowerCase() ?? ""
    : "";
  const unsafeLocalHost = parsed.protocol === "https:"
    ? isLocalHostname(parsed.hostname)
    : !mailDomain || isLocalHostname(mailDomain);
  if (!validProtocol || unsafeLocalHost) {
    throw new Error("VAPID_SUBJECT must be a public mailto: or HTTPS URL.");
  }
  return subject;
}

function resolveVercelSubject(environment: VapidEnvironment): string | null {
  for (const rawHost of [
    environment.VERCEL_PROJECT_PRODUCTION_URL,
    environment.VERCEL_URL,
  ]) {
    const value = rawHost?.trim();
    if (!value) continue;
    try {
      const parsed = new URL(value.startsWith("https://") ? value : `https://${value}`);
      return validateSubject(parsed.origin);
    } catch {
      // Ignore malformed provider metadata and continue to the next candidate.
    }
  }
  return null;
}

function resolveSubject(environment: VapidEnvironment): string {
  const configured = environment.VAPID_SUBJECT?.trim();
  if (configured) {
    try {
      return validateSubject(configured);
    } catch {
      const fallback = resolveVercelSubject(environment);
      if (fallback) return fallback;
      throw new Error("VAPID_SUBJECT must be a valid public mailto: or HTTPS URL.");
    }
  }
  const fallback = resolveVercelSubject(environment);
  if (fallback) return fallback;
  throw new Error("VAPID_SUBJECT is required outside Vercel.");
}

export function resolveVapidConfiguration(
  environment: VapidEnvironment,
): VapidConfiguration {
  const privateKey = environment.VAPID_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error("VAPID_PRIVATE_KEY is required.");
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
    subject: resolveSubject(environment),
  };
}
