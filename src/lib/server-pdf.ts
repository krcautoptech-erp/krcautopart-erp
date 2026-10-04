import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

/**
 * Renders HTML to a high-fidelity vector PDF buffer using the local headless browser.
 * Operates safely with zero external font/layout distortion.
 */
export async function renderHtmlToPdfBuffer(
  html: string,
  _options?: ServerPdfOptions,
): Promise<Buffer> {
  const browserPath = findBrowserExecutable();
  if (!browserPath) {
    throw new Error(
      "No supported headless browser (Chrome/Edge/Chromium) found on this server.",
    );
  }

  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const tempDir = os.tmpdir();
  const tempHtmlPath = path.join(tempDir, `krc_doc_${timestamp}_${randomSuffix}.html`);
  const tempPdfPath = path.join(tempDir, `krc_doc_${timestamp}_${randomSuffix}.pdf`);

  try {
    const processedHtml = inlineLocalAssets(html);
    await fs.promises.writeFile(tempHtmlPath, processedHtml, "utf-8");

    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      `--print-to-pdf=${tempPdfPath}`,
      tempHtmlPath,
    ];

    await execFileAsync(browserPath, args, { timeout: 30000 });

    if (!fs.existsSync(tempPdfPath)) {
      throw new Error("PDF generation failed: Output file not created");
    }

    return await fs.promises.readFile(tempPdfPath);
  } finally {
    try {
      if (fs.existsSync(tempHtmlPath)) await fs.promises.unlink(tempHtmlPath);
    } catch {
      // ignore cleanup error
    }
    try {
      if (fs.existsSync(tempPdfPath)) await fs.promises.unlink(tempPdfPath);
    } catch {
      // ignore cleanup error
    }
  }
}
