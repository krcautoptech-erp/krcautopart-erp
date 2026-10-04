type PdfRuntimeEnvironment = Record<string, string | undefined>;

export function isServerlessPdfRuntime(environment: PdfRuntimeEnvironment): boolean {
  return Boolean(environment.VERCEL_ENV || environment.AWS_LAMBDA_FUNCTION_NAME);
}

export function resolveChromiumPackUrl(environment: PdfRuntimeEnvironment): string {
  const explicitUrl = environment.CHROMIUM_PACK_URL?.trim();
  if (explicitUrl) {
    const parsed = new URL(explicitUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("Chromium pack URL must use HTTPS.");
    }
    return parsed.toString();
  }

  const deploymentHost = environment.VERCEL_URL || environment.VERCEL_PROJECT_PRODUCTION_URL;
  if (!deploymentHost) {
    throw new Error("Chromium pack URL is unavailable for this serverless runtime.");
  }

  return `https://${deploymentHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}/chromium-pack.tar`;
}
