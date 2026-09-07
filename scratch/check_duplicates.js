const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "../src/data/asico-products.json");
const rawData = fs.readFileSync(jsonPath, "utf-8");
const products = JSON.parse(rawData);

const seen = new Set();
const dups = [];

for (const prod of products) {
  const pn = prod.partNumber || "";
  if (seen.has(pn)) {
    dups.push(pn);
  } else {
    seen.add(pn);
  }
}

console.log("Total items in JSON:", products.length);
console.log("Unique part numbers:", seen.size);
console.log("Duplicate part numbers found:", dups);
