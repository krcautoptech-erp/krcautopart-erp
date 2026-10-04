import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromiumBinDirectory = path.join(
  projectRoot,
  "node_modules",
  "@sparticuz",
  "chromium",
  "bin",
);
const outputDirectory = path.join(projectRoot, "public");
const outputFile = path.join(outputDirectory, "chromium-pack.tar");

if (!fs.existsSync(chromiumBinDirectory)) {
  console.log("Skipping Chromium pack: @sparticuz/chromium is not installed.");
  process.exit(0);
}

fs.mkdirSync(outputDirectory, { recursive: true });
execFileSync("tar", ["-cf", outputFile, "-C", chromiumBinDirectory, "."], {
  stdio: "inherit",
});
console.log(`Created ${path.relative(projectRoot, outputFile)}`);
