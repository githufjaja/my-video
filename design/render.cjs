// HTML → PNG для карток, банерів та інфографіки.
//   node render.cjs <файл.html> <вихід.png> [ширина=1200] [висота=1200] [масштаб=2]
// Шрифти беруться з node_modules/@fontsource (див. templates/*.html), тож текст завжди точний.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    // у хмарному середовищі Claude Code браузер лежить у /opt/pw-browsers
    const root = "/opt/pw-browsers";
    const dir = fs.existsSync(root) && fs.readdirSync(root).find(d => /^chromium-\d+$/.test(d));
    if (!dir) throw e;
    return chromium.launch({ executablePath: path.join(root, dir, "chrome-linux", "chrome") });
  }
}

(async () => {
  const [src, out, w = "1200", h = "1200", scale = "2"] = process.argv.slice(2);
  if (!src || !out) {
    console.error("usage: node render.cjs <file.html> <out.png> [width] [height] [scale]");
    process.exit(1);
  }
  const b = await launch();
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("requestfailed", r => errors.push("failed: " + r.url()));
  await p.goto("file://" + path.resolve(src), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: out });
  await b.close();
  if (errors.length) console.warn("warnings:\n  " + errors.join("\n  "));
  console.log("saved", out, `${w * scale}×${h * scale}`);
})();
