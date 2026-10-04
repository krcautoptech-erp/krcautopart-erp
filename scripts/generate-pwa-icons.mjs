import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "public", "logo", "origin-clean.png");
const output = path.join(root, "public", "pwa");
const standardSizes = [48, 72, 96, 128, 144, 152, 180, 192, 384, 512];

for (const size of standardSizes) {
  const logo = await sharp(source)
    .resize(Math.round(size * 0.88), Math.round(size * 0.88), { fit: "inside" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#00000000" },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, `icon-${size}.png`));
}

const appleIcon = await sharp(source)
  .resize(Math.round(180 * 0.88), Math.round(180 * 0.88), { fit: "inside" })
  .png()
  .toBuffer();
await sharp({
  create: { width: 180, height: 180, channels: 4, background: "#ffffff" },
})
  .composite([{ input: appleIcon, gravity: "centre" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(output, "apple-touch-icon.png"));

for (const size of [192, 512]) {
  const logo = await sharp(source)
    .resize(Math.round(size * 0.62), Math.round(size * 0.62), { fit: "inside" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#be0f1a" },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, `icon-${size}-maskable.png`));
}

const badge = await sharp(source)
  .resize(76, 76, { fit: "inside" })
  .png({ compressionLevel: 9 })
  .toBuffer();
await sharp({
  create: { width: 96, height: 96, channels: 4, background: "#00000000" },
})
  .composite([{ input: badge, gravity: "centre" }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(output, "badge-96.png"));
