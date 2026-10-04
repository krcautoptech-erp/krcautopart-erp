import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(projectRoot, "node_modules", "web-push", "src", "web-push-lib.js");

if (!fs.existsSync(target)) {
  console.log("Skipping web-push patch: package is not installed.");
  process.exit(0);
}

let source = fs.readFileSync(target, "utf8");
const alreadyPatched = !source.includes("url.parse(") && source.includes("new URL(");

if (!alreadyPatched) {
  const before = source;
  source = source
    .replace("const url = require('url');\n", "")
    .replace("const parsedUrl = url.parse(subscription.endpoint);", "const parsedUrl = new URL(subscription.endpoint);")
    .replace("const urlParts = url.parse(requestDetails.endpoint);", "const urlParts = new URL(requestDetails.endpoint);")
    .replace("httpsOptions.path = urlParts.path;", "httpsOptions.path = urlParts.pathname + urlParts.search;");

  if (source === before || source.includes("url.parse(")) {
    throw new Error("Unable to apply the WHATWG URL patch to web-push 3.6.7.");
  }
  fs.writeFileSync(target, source, "utf8");
}

console.log("Verified web-push uses the WHATWG URL API.");
