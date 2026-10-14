// Вбудовує QR-студію (design/qr-studio.html) у сайт: site/worker.js → https://dflust.com/fancyqr
//   node tools/build-qr-studio.cjs
// Запускати після кожної правки design/qr-studio.html, потім node --check site/worker.js.
// Бібліотеки беруться з власного домену (/lib/…, з перевіркою SHA-256), а не з CDN.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "design/qr-studio.html"), "utf8");
const workerPath = path.join(root, "site/worker.js");
const worker = fs.readFileSync(workerPath, "utf8");

const page = src
  .replace("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js", "/lib/qrcode.js")
  .replace("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js", "/lib/jsqr.js");
if (!page.includes('"/lib/qrcode.js"') || !page.includes('"/lib/jsqr.js"')) {
  console.error("Не знайшов теги бібліотек у design/qr-studio.html — оновіть цей скрипт.");
  process.exit(1);
}

const doc =
  '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<meta name="robots" content="noindex">' +
  "<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}" +
  "body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n" +
  page + "\n</body></html>";

const literal = "`" + doc.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
const BEGIN = "// BEGIN QR_STUDIO (згенеровано: node tools/build-qr-studio.cjs — руками не правити)";
const END = "// END QR_STUDIO";
const block = BEGIN + "\nconst QR_STUDIO_HTML = " + literal + ";\n" + END;

const at = worker.indexOf(BEGIN), end = worker.indexOf(END);
const out = at !== -1 && end > at
  ? worker.slice(0, at) + block + worker.slice(end + END.length)
  : worker.trimEnd() + "\n\n" + block + "\n";
fs.writeFileSync(workerPath, out);
console.log("QR-студію вбудовано в site/worker.js (" + Math.round(doc.length / 1024) + " КБ)");
