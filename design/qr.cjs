// QR-коди для макетів.
//   node qr.cjs make <url> <вихід.svg|.png>   — створити QR
//   node qr.cjs check <картинка.png>          — знайти QR на картинці й показати, куди він веде
const QR = require("qrcode");
const fs = require("fs");

const [cmd, a, b] = process.argv.slice(2);

if (cmd === "make" && a && b) {
  const opt = { margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } };
  const done = e => { if (e) throw e; console.log("saved", b, "→", a); };
  if (/\.svg$/i.test(b)) QR.toString(a, Object.assign({ type: "svg" }, opt), (e, s) => { if (e) throw e; fs.writeFileSync(b, s); done(); });
  else QR.toFile(b, a, Object.assign({ width: 1000 }, opt), done);
} else if (cmd === "check" && a) {
  const { PNG } = require("pngjs");
  const jsQR = require("jsqr");
  const img = PNG.sync.read(fs.readFileSync(a));
  const r = jsQR(new Uint8ClampedArray(img.data), img.width, img.height);
  if (!r) { console.log("QR не знайдено"); process.exit(2); }
  console.log("QR веде на:", r.data);
} else {
  console.error("usage: node qr.cjs make <url> <out.svg|png> | node qr.cjs check <image.png>");
  process.exit(1);
}
