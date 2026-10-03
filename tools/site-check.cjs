// Перевірка сторінки сайту перед здачею власнику.
//   node tools/site-check.cjs <файл.html | http://localhost:8787/> [папка-для-скріншотів]
// Робить: скріншоти комп'ютер (1440×900) і телефон (390×844, кілька екранів), шукає помилки
// в консолі та горизонтальну прокрутку, міряє плавність (FPS) з процесором, сповільненим у 4 рази
// (як середній телефон). Норма: FPS ≥ 50, без помилок, без горизонтальної прокрутки.
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "..", "design", "node_modules", "playwright"));

async function launch() {
  try { return await chromium.launch(); } catch (e) {
    const root = "/opt/pw-browsers";
    const dir = fs.existsSync(root) && fs.readdirSync(root).find(d => /^chromium-\d+$/.test(d));
    if (!dir) throw e;
    return chromium.launch({ executablePath: path.join(root, dir, "chrome-linux", "chrome") });
  }
}

(async () => {
  const target = process.argv[2];
  const outDir = process.argv[3] || "out/site-check";
  if (!target) { console.error("usage: node tools/site-check.cjs <file.html|url> [out-dir]"); process.exit(1); }
  const url = /^https?:/.test(target) ? target : "file://" + path.resolve(target);
  fs.mkdirSync(outDir, { recursive: true });
  const b = await launch();
  let fail = false;
  for (const [tag, w, h, dpr] of [["desktop", 1440, 900, 1], ["phone", 390, 844, 2]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const p = await ctx.newPage();
    const errors = [], blocked = new Set();
    p.on("pageerror", e => errors.push("JS: " + e.message));
    // зовнішні ресурси (Google Fonts, CDN), які не пускає мережа пісочниці, — не помилка сайту
    p.on("requestfailed", r => { if (!/^(file|https?:\/\/(localhost|127\.0\.0\.1))/.test(r.url())) blocked.add(new URL(r.url()).host); });
    p.on("console", m => m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_PROXY/.test(m.text()) && errors.push("console: " + m.text()));
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await p.goto(url, { waitUntil: "load" });
    await p.waitForTimeout(1200);
    const total = await p.evaluate(() => document.documentElement.scrollHeight);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const fps = await p.evaluate(() => new Promise(done => {
      let n = 0, worst = 0, last = performance.now(); const t0 = last;
      const H = document.documentElement.scrollHeight - innerHeight;
      const f = now => { n++; worst = Math.max(worst, now - last); last = now;
        window.scrollTo(0, ((now - t0) / 3000) * H * 0.7);
        if (now - t0 < 3000) requestAnimationFrame(f); else done({ fps: Math.round(n / 3), worst: Math.round(worst) }); };
      requestAnimationFrame(f);
    }));
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const shots = [];
    const screens = Math.min(6, Math.ceil(total / h));
    for (let i = 0; i < screens; i++) {
      await p.evaluate(y => window.scrollTo(0, y), i * h);
      await p.evaluate(() => document.querySelectorAll(".rv,[data-reveal]").forEach(e => e.classList.add("in")));
      await p.waitForTimeout(500);
      const file = path.join(outDir, `${tag}-${i + 1}.png`);
      await p.screenshot({ path: file });
      shots.push(file);
    }
    const bad = fps.fps < 50 || overflow || errors.length;
    fail = fail || bad;
    console.log(`${bad ? "✗" : "✓"} ${tag}: FPS ${fps.fps} (найгірший кадр ${fps.worst} мс) · гориз. прокрутка: ${overflow ? "Є" : "немає"} · помилок: ${errors.length} · висота ${total}px`);
    errors.slice(0, 5).forEach(e => console.log("   " + e));
    if (blocked.size) console.log("   (не завантажились через мережу пісочниці, на живому сайті ок: " + [...blocked].join(", ") + ")");
    console.log("   скріншоти: " + shots.join(", "));
    await ctx.close();
  }
  await b.close();
  process.exit(fail ? 2 : 0);
})();
