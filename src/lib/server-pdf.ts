import fs from "node:fs";
import path from "node:path";
import type { Browser, LaunchOptions } from "puppeteer-core";
import {
  isServerlessPdfRuntime,
  resolveChromiumPackUrl,
} from "./server-pdf-runtime.ts";

const POSSIBLE_EXECUTABLES = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // Windows Chrome & Edge
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter((p): p is string => Boolean(p));

export function findBrowserExecutable(): string | null {
  for (const execPath of POSSIBLE_EXECUTABLES) {
    try {
      if (fs.existsSync(execPath)) {
        return execPath;
      }
    } catch {
      // Continue searching
    }
  }
  return null;
}

export interface ServerPdfOptions {
  paperSize?: "A4" | "A5" | "letter";
  orientation?: "portrait" | "landscape";
  title?: string;
}

const fontBase64Cache = new Map<string, string>();

export function inlineLocalAssets(html: string): string {
  const publicDir = path.join(process.cwd(), "public");

  // 1. Strip all responsive attributes so browser never searches for srcset variants
  html = html.replace(/\s*srcset="[^"]*"/gi, "");
  html = html.replace(/\s*srcset='[^']*'/gi, "");
  html = html.replace(/\s*sizes="[^"]*"/gi, "");
  html = html.replace(/\s*sizes='[^']*'/gi, "");

  // 2. Inlining Fonts
  const fontMap: Record<string, string> = {
    "/fonts/Sarabun-Regular.ttf": "fonts/Sarabun-Regular.ttf",
    "/fonts/Sarabun-Medium.ttf": "fonts/Sarabun-Medium.ttf",
    "/fonts/Sarabun-SemiBold.ttf": "fonts/Sarabun-SemiBold.ttf",
    "/fonts/Sarabun-Bold.ttf": "fonts/Sarabun-Bold.ttf",
    "/fonts/NotoSansThai-Regular.ttf": "fonts/NotoSansThai-Regular.ttf",
    "/fonts/NotoSansThai-Bold.ttf": "fonts/NotoSansThai-Bold.ttf",
    "/fonts/Inter-VariableFont_opsz,wght.ttf": "fonts/Inter-VariableFont_opsz,wght.ttf",
    "/fonts/Inter-Italic-VariableFont_opsz,wght.ttf": "fonts/Inter-Italic-VariableFont_opsz,wght.ttf",
  };

  for (const [urlPath, relPath] of Object.entries(fontMap)) {
    if (html.includes(urlPath)) {
      let b64 = fontBase64Cache.get(urlPath);
      if (!b64) {
        const fullPath = path.join(publicDir, relPath);
        if (fs.existsSync(fullPath)) {
          b64 = fs.readFileSync(fullPath).toString("base64");
          fontBase64Cache.set(urlPath, b64);
        }
      }
      if (b64) {
        html = html.replaceAll(urlPath, `data:font/truetype;charset=utf-8;base64,${b64}`);
      }
    }
  }

  // 3. Inlining Local Images (e.g. /_next/image?url=%2Flogo%2Forigin-2.png... or /logo/origin-2.png)
  html = html.replace(/src="([^"]+)"/g, (match, srcValue: string) => {
    if (srcValue.startsWith("data:")) return match;

    let targetPath = srcValue;
    if (targetPath.includes("/_next/image?url=")) {
      try {
        const parsed = new URL(targetPath, "http://localhost");
        const realUrl = parsed.searchParams.get("url");
        if (realUrl) targetPath = realUrl;
      } catch {
        // keep targetPath
      }
    }

    try {
      targetPath = decodeURIComponent(targetPath);
    } catch {
      // ignore
    }

    if (targetPath.startsWith("/")) {
      const localFile = path.join(publicDir, targetPath.replace(/^\//, ""));
      if (fs.existsSync(localFile)) {
        const ext = path.extname(localFile).toLowerCase().replace(".", "");
        const mime =
          ext === "svg"
            ? "image/svg+xml"
            : ext === "jpg" || ext === "jpeg"
              ? "image/jpeg"
              : "image/png";
        const imgB64 = fs.readFileSync(localFile).toString("base64");
        return `src="data:${mime};base64,${imgB64}"`;
      }

      // Fallback: If it's a logo path that doesn't exist, check standard logos
      if (targetPath.toLowerCase().includes("logo")) {
        const fallbackLogos = ["origin-clean.png", "origin-2.png", "origin.png"];
        for (const filename of fallbackLogos) {
          const fl = path.join(process.cwd(), "public", "logo", filename);
          if (fs.existsSync(fl)) {
            const imgB64 = fs.readFileSync(fl).toString("base64");
            return `src="data:image/png;base64,${imgB64}"`;
          }
        }
      }
    }

    return match;
  });

  return html;
}

let serverlessExecutablePathPromise: Promise<string> | null = null;

async function launchPdfBrowser(): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer-core");
  let launchOptions: LaunchOptions;

  if (isServerlessPdfRuntime(process.env)) {
    const [{ default: chromium }, packUrl] = await Promise.all([
      import("@sparticuz/chromium-min"),
      Promise.resolve(resolveChromiumPackUrl(process.env)),
    ]);

    serverlessExecutablePathPromise ??= chromium.executablePath(packUrl);
    launchOptions = {
      args: chromium.args,
      executablePath: await serverlessExecutablePathPromise,
      headless: "shell",
    };
  } else {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
      throw new Error(
        "No supported headless browser (Chrome/Edge/Chromium) found on this server.",
      );
    }
    launchOptions = {
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    };
  }

  return puppeteer.launch(launchOptions);
}

/**
 * Renders HTML to a high-fidelity vector PDF buffer. Local development uses the
 * installed Chrome/Edge while serverless production uses a deployment-hosted
 * Chromium pack, keeping the function bundle below the provider limit.
 */
export async function renderHtmlToPdfBuffer(
  html: string,
  options: ServerPdfOptions = {},
): Promise<Buffer> {
  const browser = await launchPdfBrowser();

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const requestUrl = request.url();
      if (requestUrl === "about:blank" || requestUrl.startsWith("data:")) {
        void request.continue();
      } else {
        void request.abort();
      }
    });

    await page.setContent(inlineLocalAssets(html), {
      waitUntil: "load",
      timeout: 20_000,
    });
    await page.emulateMediaType("print");
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const pdf = await page.pdf({
      format: options.paperSize ?? "A4",
      landscape: options.orientation === "landscape",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true,
      timeout: 30_000,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
