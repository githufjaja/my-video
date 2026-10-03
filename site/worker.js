/**
 * qr-redirect v15
 *
 * Можливості:
 *   • динамічні QR-посилання з редиректом
 *   • резервування кодів наперед (до 200 за раз, з міткою партії та папкою)
 *   • папки для вільних кодів + масове переміщення
 *   • резервна копія всіх посилань і клієнтів у JSON + відновлення порціями
 *   • пошук клієнта та фільтр списку посилань
 *   • «оплачено до» для кожного клієнта + зміна посилання на кабінет
 *   • лендинг на головній та промо-рядок на заглушці
 *   • конвертер посилань Google Карт у форму відгуку
 *   • статистика сканувань з дедуплікацією (унікальні за добу)
 *   • кабінети клієнтів: свій токен, лише свої посилання, лише читання
 *   • експорт статистики у CSV
 *   • картки з QR: шаблон + коди → готові PDF для друку (векторний QR)
 *   • візитки vCard: сторінка-візитка + кнопка «Зберегти контакт» (.vcf)
 *   • безпека: токен лише в заголовку, ліміт спроб входу, перевірка SHA-256
 *     сторонніх бібліотек, у сховище фото — лише справжні картинки
 *   • унікальні сканування за cookie відвідувача (а не IP), боти не рахуються
 *   • самоактивація: тип партії + «Продано» → покупець сам налаштовує картку
 *     (відгук, чайові, посилання, візитка) і отримує своє посилання для змін
 *   • журнал змін по кожному коду, блокування коду, скидання власника
 *   • індекс у метаданих KV + пагінація (тисячі кодів без лімітів)
 *   • інтерфейс українською та англійською
 *
 * Біндінги:  LINKS (KV), DB (D1), IMG (R2, необов'язково)
 * Секрети:   ADMIN_TOKEN, GOOGLE_API_KEY (необов'язково)
 *
 * Адмінка:   https://dflust.com/admin
 * Кабінет:   https://dflust.com/c/<токен клієнта>
 *
 * Після першого деплою v12+: Адмінка → Резервна копія → «Оновити індекс» (один раз).
 * ADMIN_TOKEN — щонайменше 32 випадкові символи.
 */

const RESERVED = ["admin", "api", "lib", "c", "v", "e", "p", "img", "print", "favicon.ico", "robots.txt"];

// ─────────────────── Налаштування сайту ───────────────────
// Заповни свої контакти — вони з'являться на головній сторінці.
// Порожнє поле просто не показується.

const SITE = {
  brand: "dflust",
  tagline: {
    uk: "QR-картки та NFC-візитки для бізнесу",
    en: "QR cards and NFC business cards",
  },
  phone: "+380996406200",
  viber: "",                 // https://invite.viber.com/...  (порожньо — кнопки не буде)
  telegram: "https://t.me/demonoflust0",
  instagram: "https://instagram.com/demon.of.lust",
  // Промо-рядок унизу сторінки-заглушки. promo:false — вимкнути.
  promo: true,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.slice(1));

    if (path === "admin") return html(ADMIN_HTML, 200, PRIVATE_HEADERS);
    if (path.startsWith("lib/")) return serveLib(request, ctx, path.slice(4));
    if (path.startsWith("c/")) return html(CLIENT_HTML, 200, PRIVATE_HEADERS);
    if (path.startsWith("img/")) return serveImage(env, path.slice(4));
    if (path.startsWith("v/")) return serveVcf(env, url, path.slice(2));
    if (path.startsWith("api/")) return handleApi(request, env, url, path.slice(4));
    if (path.startsWith("p/")) return handlePublic(request, env, url, path.slice(2));
    if (path.startsWith("e/")) {
      const ec = path.slice(2);
      const er = /^[a-zA-Z0-9_-]+$/.test(ec) ? parseLink(await env.LINKS.get(ec)) : null;
      if (!er || !OWNER_KINDS[er.kind]) return html(notFoundPage(request), 404);
      return html(ownerPage(request, url.origin, ec, er, "edit"), 200, PRIVATE_HEADERS);
    }
    if (path === "") return html(rootPage(request));

    const raw = await env.LINKS.get(path);
    const link = parseLink(raw);
    if (!link) return html(notFoundPage(request), 404);

    // cookie відвідувача — для чесних «унікальних» (замість IP)
    const known = readVid(request);
    const vid = known || randomCode(16);
    ctx.waitUntil(logScan(env, path, request, vid));
    const out = res => {
      if (!known) {
        res.headers.append(
          "Set-Cookie",
          "dfv=" + vid + "; Max-Age=31536000; Path=/; Secure; HttpOnly; SameSite=Lax"
        );
      }
      return res;
    };

    if (link.blocked) return out(html(blockedPage(request), 410));

    const target = link.url || "";
    if (!target) {
      // продано, але ще не налаштовано → покупець активує сам
      if (link.sold && OWNER_KINDS[link.kind]) {
        return out(html(ownerPage(request, url.origin, path, link, "activate"), 200, PRIVATE_HEADERS));
      }
      return out(html(soonPage(request, link.title, url.origin), 200));
    }

    if (target.indexOf("menu:") === 0) {
      const raw = await env.LINKS.get("__menu:" + target.slice(5));
      let menu = null;
      try {
        menu = raw ? JSON.parse(raw) : null;
      } catch (e) {}
      if (!menu) return out(html(soonPage(request, link.title, url.origin), 200));
      return out(html(menuPage(menu, request)));
    }

    if (target.indexOf("card:") === 0) {
      const card = await readVcard(env, target.slice(5));
      if (!card) return out(html(soonPage(request, link.title, url.origin), 200));
      return out(html(cardPage(card, target.slice(5), request, url.origin)));
    }

    if (!isWebUrl(target)) return out(html(soonPage(request, link.title, url.origin), 200));

    if (needsBounce(target)) return out(html(bouncePage(target, request)));

    return out(new Response(null, {
      status: 302,
      headers: {
        Location: target,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Referrer-Policy": "no-referrer",
      },
    }));
  },
};

// ─────────────────── Безпека: дрібні помічники ───────────────────

const PUBLIC_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
};

const PRIVATE_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function isWebUrl(u) {
  return /^https?:\/\/[^\s"'<>\\]+$/i.test(String(u || ""));
}

function isInternalTarget(u) {
  return /^(menu|card):[A-Za-z0-9_-]+$/.test(String(u || ""));
}

function safeBg(v) {
  v = String(v || "").trim();
  if (/^\/img\/[A-Za-z0-9._-]+$/.test(v)) return v;
  if (/^https:\/\/[^\s"'()<>\\]+$/i.test(v)) return v.slice(0, 500);
  return "";
}

function readVid(request) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)dfv=([a-z0-9]{8,32})/);
  return m ? m[1] : "";
}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b))),
  ]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < p.length; i++) d |= p[i] ^ q[i];
  return d === 0;
}

function sniffImage(u8) {
  if (u8.length < 12) return null;
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return ["image/jpeg", "jpg"];
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return ["image/png", "png"];
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return ["image/gif", "gif"];
  if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
      u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return ["image/webp", "webp"];
  return null;
}

// ліміт невдалих входів: 20 за 15 хвилин з однієї IP (кеш дата-центру)
function rlKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || "0";
  return new Request(new URL(request.url).origin + "/__rl/" + encodeURIComponent(ip));
}

async function tooManyFails(request) {
  try {
    const r = await caches.default.match(rlKey(request));
    return !!r && parseInt(await r.text(), 10) >= 20;
  } catch (e) {
    return false;
  }
}

async function noteFail(request) {
  try {
    const k = rlKey(request);
    const r = await caches.default.match(k);
    const n = (r ? parseInt(await r.text(), 10) || 0 : 0) + 1;
    await caches.default.put(k, new Response(String(n), { headers: { "cache-control": "max-age=900" } }));
  } catch (e) {}
}

// ─────────────── Мова сторінок для відвідувачів ───────────────

function visitorLang(request) {
  const al = (request.headers.get("accept-language") || "").toLowerCase();
  return al.startsWith("en") ? "en" : "uk";
}

// ─────────────────── Формат зберігання ───────────────────

function parseLink(raw) {
  if (!raw) return null;
  if (raw.charAt(0) === "{") {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o.url === "string") return o;
    } catch (e) {}
  }
  return { url: raw };
}

function isSystemKey(name) {
  return name.indexOf("__") === 0;
}

// ─────────── Індекс: метадані в KV + пагінація ───────────

function linkMeta(rec) {
  const m = {
    u: rec.url || "",
    t: rec.title || "",
    o: rec.owner || "",
    f: rec.folder || "",
    c: rec.created || 0,
    k: rec.kind || "",
    s: rec.sold ? 1 : 0,
    a: rec.activated || 0,
    b: rec.blocked ? 1 : 0,
  };
  // ліміт метаданих KV — 1024 байти; якщо не влазить, list дочитає запис через get
  return new TextEncoder().encode(JSON.stringify(m)).length <= 1000 ? m : { u: null };
}

async function putLink(env, key, rec) {
  await env.LINKS.put(key, JSON.stringify(rec), { metadata: linkMeta(rec) });
}

async function listAllKeys(env, prefix) {
  const out = [];
  let cursor = null;
  do {
    const opts = {};
    if (cursor) opts.cursor = cursor;
    if (prefix) opts.prefix = prefix;
    const res = await env.LINKS.list(opts);
    out.push(...res.keys);
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  return out;
}

async function allLinks(env) {
  const out = [];
  for (const k of await listAllKeys(env)) {
    if (isSystemKey(k.name)) continue;
    const m = k.metadata;
    let rec;
    if (m && typeof m.u === "string") {
      rec = {
        url: m.u, title: m.t || "", owner: m.o || "", folder: m.f || "", created: m.c || 0,
        kind: m.k || "", sold: !!m.s, activated: m.a || 0, blocked: !!m.b,
      };
    } else {
      rec = parseLink(await env.LINKS.get(k.name));
      if (!rec) continue;
    }
    out.push({ code: k.name, rec });
  }
  return out;
}

// ─────────── Самоактивація: типи, журнал ───────────

const OWNER_KINDS = { review: 1, tip: 1, link: 1, vcard: 1 };
const ALL_KINDS = ["", "review", "tip", "link", "vcard"];

function isMapsInput(s) {
  try {
    s = String(s || "").trim();
    const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
    return /^(maps\.app\.goo\.gl|goo\.gl|g\.page|g\.co|search\.google\.com|(www\.|maps\.)?google\.[a-z.]{2,8})$/i.test(u.hostname);
  } catch (e) {
    return false;
  }
}

async function addLog(env, code, who, what, request) {
  try {
    const k = "__log:" + code;
    let arr = [];
    try {
      arr = JSON.parse((await env.LINKS.get(k)) || "[]");
    } catch (e) {}
    if (!Array.isArray(arr)) arr = [];
    arr.unshift({
      ts: Date.now(),
      who,
      what: String(what || "").slice(0, 300),
      cc: (request && request.cf && request.cf.country) || "",
    });
    await env.LINKS.put(k, JSON.stringify(arr.slice(0, 30)));
  } catch (e) {}
}

async function readTemplates(env) {
  try {
    const v = JSON.parse((await env.LINKS.get("__templates")) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

// ─────────────── Обхід застосунку Google Карт ───────────────

function needsBounce(target) {
  return /^https?:\/\/(www\.)?(google|maps\.google)\.[a-z.]+\/maps/i.test(target);
}

function bouncePage(target, request) {
  const en = visitorLang(request) === "en";
  const safe = target.replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const js = JSON.stringify(target);
  const t1 = en ? "Opening the review form…" : "Відкриваємо форму відгуку…";
  const t2 = en ? "Open manually" : "Відкрити вручну";

  return `<!doctype html>
<html lang="${en ? "en" : "uk"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${en ? "Opening…" : "Відкриваємо…"}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;
       color:#e5e9f0;font:15px/1.6 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
       text-align:center;padding:24px}
  .s{width:26px;height:26px;margin:0 auto 16px;border:2px solid #2a2f3a;
     border-top-color:#4d7cfe;border-radius:50%;animation:r .8s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  p{color:#8b93a1;margin:0 0 20px;font-size:14px}
  a{display:inline-block;background:#4d7cfe;color:#fff;text-decoration:none;
    padding:12px 22px;border-radius:9px;font-size:15px;font-weight:500}
</style></head>
<body>
<div>
  <div class="s"></div>
  <p>${t1}</p>
  <a href="${safe}" rel="noopener">${t2}</a>
</div>
<script>
  var t = ${js};
  setTimeout(function () { try { location.replace(t); } catch (e) { location.href = t; } }, 60);
</script>
</body></html>`;
}

// ───────── Сторонні бібліотеки з власного домену + перевірка SHA-256 ─────────
// Файл віддається, лише якщо його хеш збігається з еталоном із npm.
// Підмінять пакет на CDN — адмінка просто не отримає чужий код.

const LIBS = {
  "qrcode.js": {
    sha: "18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780",
    urls: [
      "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js",
      "https://unpkg.com/qrcode-generator@1.4.4/qrcode.js",
    ],
  },
  "jspdf.js": {
    sha: "98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875",
    urls: [
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
      "https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js",
    ],
  },
  "jszip.js": {
    sha: "acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e",
    urls: [
      "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
      "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
    ],
  },
};

async function sha256hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function serveLib(request, ctx, name) {
  const lib = LIBS[name];
  if (!lib) return new Response("not found", { status: 404 });

  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + "/lib/" + name + "?h=" + lib.sha.slice(0, 12));

  const hit = await cache.match(key);
  if (hit) return hit;

  for (const src of lib.urls) {
    try {
      const r = await fetch(src);
      if (!r.ok) continue;
      const buf = await r.arrayBuffer();
      if ((await sha256hex(buf)) !== lib.sha) continue;

      const res = new Response(buf, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {}
  }

  return new Response("/* library unavailable or failed integrity check */", {
    status: 502,
    headers: { "content-type": "application/javascript; charset=utf-8" },
  });
}

// ─────────────────────── Статистика ───────────────────────

// унікальність = код + cookie відвідувача + доба; без cookie — IP + UA
async function fingerprint(request, code, vid) {
  const day = Math.floor(Date.now() / 86400000);
  let who;
  if (vid) who = "v:" + vid;
  else who = (request.headers.get("cf-connecting-ip") || "") + "|" + (request.headers.get("user-agent") || "");
  const data = new TextEncoder().encode(code + "|" + who + "|" + day);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|whatsapp|curl|wget|python-requests/i;

async function logScan(env, code, request, vid) {
  if (!env.DB) return;
  try {
    const cf = request.cf || {};
    const ua = request.headers.get("user-agent") || "";
    if (!ua || BOT_UA.test(ua)) return; // превʼю месенджерів і боти — не сканування
    const fp = await fingerprint(request, code, vid);

    let uniq = 1;
    try {
      const seen = await env.DB.prepare("SELECT 1 AS x FROM scans WHERE fp = ? LIMIT 1")
        .bind(fp)
        .first();
      if (seen) uniq = 0;
    } catch (e) {}

    await env.DB.prepare(
      "INSERT INTO scans (code, ts, country, city, device, fp, uniq) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        code,
        Date.now(),
        cf.country || "??",
        cf.city || "",
        /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop",
        fp,
        uniq
      )
      .run();
  } catch (e) {}
}

async function scanCounts(env) {
  if (!env.DB) return {};
  try {
    const { results } = await env.DB.prepare(
      "SELECT code, COUNT(*) AS n, SUM(uniq) AS u FROM scans GROUP BY code"
    ).all();
    const map = {};
    for (const r of results) map[r.code] = { total: r.n, unique: r.u || 0 };
    return map;
  } catch (e) {
    return {};
  }
}

async function scanStats(env, code) {
  if (!env.DB) return { error: "no_db" };

  const since = Date.now() - 30 * 86400000;

  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS n, SUM(uniq) AS u FROM scans WHERE code = ?"
  )
    .bind(code)
    .first();
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS n, SUM(uniq) AS u FROM scans WHERE code = ? AND ts > ?"
  )
    .bind(code, Date.now() - 86400000)
    .first();
  const daily = await env.DB.prepare(
    `SELECT date(ts / 1000, 'unixepoch') AS day, COUNT(*) AS n, SUM(uniq) AS u
     FROM scans WHERE code = ? AND ts > ?
     GROUP BY day ORDER BY day DESC LIMIT 14`
  )
    .bind(code, since)
    .all();
  const geo = await env.DB.prepare(
    `SELECT country, COUNT(*) AS n FROM scans WHERE code = ?
     GROUP BY country ORDER BY n DESC LIMIT 6`
  )
    .bind(code)
    .all();
  const dev = await env.DB.prepare(
    "SELECT device, COUNT(*) AS n FROM scans WHERE code = ? GROUP BY device"
  )
    .bind(code)
    .all();

  return {
    ok: true,
    code,
    total: total?.n || 0,
    unique: total?.u || 0,
    today: today?.n || 0,
    todayUnique: today?.u || 0,
    daily: daily.results.reverse(),
    geo: geo.results,
    devices: dev.results,
  };
}

// codes === null — уся статистика (лише адмін), інакше — перелік кодів
async function exportCsv(env, codes, lang) {
  if (!env.DB) return "\uFEFFno data\n";

  const sel = "SELECT code, ts, country, city, device, uniq FROM scans";
  let rows = [];

  if (codes === null) {
    const { results } = await env.DB.prepare(sel + " ORDER BY ts DESC LIMIT 50000").all();
    rows = results;
  } else {
    // D1 приймає до 100 параметрів у запиті — ріжемо по 90 кодів
    for (let i = 0; i < codes.length; i += 90) {
      const part = codes.slice(i, i + 90);
      const { results } = await env.DB.prepare(
        sel + " WHERE code IN (" + part.map(() => "?").join(",") + ") ORDER BY ts DESC LIMIT 50000"
      )
        .bind(...part)
        .all();
      rows.push(...results);
    }
    rows.sort((a, b) => b.ts - a.ts);
  }

  const esc = v => {
    const s = String(v == null ? "" : v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const en = lang === "en";
  const head = en
    ? "code;date;time;country;city;device;unique"
    : "код;дата;час;країна;місто;пристрій;унікальний";
  const yes = en ? "yes" : "так";
  const no = en ? "no" : "ні";

  const out = [head];
  for (const r of rows) {
    const d = new Date(r.ts);
    out.push(
      [
        esc(r.code),
        d.toISOString().slice(0, 10),
        d.toISOString().slice(11, 19),
        esc(r.country),
        esc(r.city),
        esc(r.device),
        r.uniq ? yes : no,
      ].join(";")
    );
  }
  return "\uFEFF" + out.join("\n") + "\n";
}

// ────────────── Google Maps → посилання на відгук ──────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function expandUrl(raw, maxHops = 8) {
  let current = raw;
  const chain = [raw];

  for (let i = 0; i < maxHops; i++) {
    let res;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": UA, "Accept-Language": MAPS_LANG },
      });
    } catch (e) {
      break;
    }

    const loc = res.headers.get("location");
    if (!loc) break;

    let next;
    try {
      next = new URL(loc, current).toString();
    } catch (e) {
      break;
    }

    try {
      const u = new URL(next);
      if (/consent\.(google|youtube)\./i.test(u.hostname)) {
        const cont = u.searchParams.get("continue");
        if (cont) next = cont;
      }
    } catch (e) {}

    current = next;
    chain.push(current);
  }

  return { finalUrl: current, chain: chain.join("\n") };
}

// мова відповіді Google — українська, щоб адреса була «вулиця Корзо, Ужгород»
const MAPS_LANG = "uk-UA,uk;q=0.9,en;q=0.5";

function htmlDecode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (m, n) => { try { return String.fromCodePoint(+n); } catch (e) { return m; } })
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return m; } })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function metaContent(body, attr, val) {
  const tag = String(body || "").match(new RegExp("<meta[^>]+" + attr + '="' + val + '"[^>]*>', "i"));
  if (!tag) return "";
  const c = tag[0].match(/content="([^"]*)"/i);
  return c ? htmlDecode(c[1]) : "";
}

function looksLikeAddress(s) {
  return /,/.test(s) && /\d/.test(s) && !/[★☆]/.test(s) && s.length < 220;
}

// «вулиця Корзо, 5, Ужгород, Закарпатська область, 88000, Україна» → без індексу й країни
function tidyAddress(s) {
  return htmlDecode(s)
    .replace(/,\s*(Україна|Украина|Ukraine)\s*$/i, "")
    .replace(/,\s*\d{5}(?=,|$)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

// Google кладе в мета-теги «Назва · Адреса» — дістаємо обидві частини
function placeFromHtml(body) {
  const cands = [
    metaContent(body, "property", "og:title"),
    metaContent(body, "itemprop", "name"),
    metaContent(body, "property", "og:description"),
    metaContent(body, "itemprop", "description"),
    metaContent(body, "name", "description"),
  ];
  let name = "";
  let address = "";
  for (const c of cands) {
    const parts = c.split(/\s+·\s+/).map(x => x.trim()).filter(Boolean);
    if (!parts.length) continue;
    if (!name && parts.length > 1 && !looksLikeAddress(parts[0]) && !/[★☆]/.test(parts[0])) name = parts[0];
    if (!address) {
      for (const p of parts.slice(1)) {
        if (looksLikeAddress(p)) { address = p; break; }
      }
    }
  }
  return { name, address: address ? tidyAddress(address) : "" };
}

// точні назва й адреса за Place ID (лише якщо є GOOGLE_API_KEY)
async function placeDetails(env, placeId) {
  if (!env.GOOGLE_API_KEY || !placeId) return null;
  try {
    const r = await fetch(
      "https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + "?languageCode=uk",
      { headers: { "X-Goog-Api-Key": env.GOOGLE_API_KEY, "X-Goog-FieldMask": "displayName,formattedAddress" } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return {
      name: (d.displayName && d.displayName.text) || "",
      address: d.formattedAddress ? tidyAddress(d.formattedAddress) : "",
    };
  } catch (e) {
    return null;
  }
}

// координати місця з посилання Google: «!3d48.62!4d22.29» (точка закладу) або «@48.62,22.29»
function findCoords(text) {
  const m = String(text || "").match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
            String(text || "").match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// адреса за координатами без ключа Google — OpenStreetMap (Nominatim)
async function reverseGeocode(ll) {
  if (!ll) return "";
  try {
    const r = await fetch(
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=uk" +
        "&lat=" + ll.lat + "&lon=" + ll.lng,
      { headers: { "User-Agent": "dflust-qr/1.0 (https://dflust.com)", "Accept-Language": "uk" } }
    );
    if (!r.ok) return "";
    const a = (await r.json()).address || {};
    const street = a.road || a.pedestrian || a.square || a.footway || a.neighbourhood || "";
    const city = a.city || a.town || a.village || a.hamlet || a.municipality || "";
    const parts = [];
    if (street) parts.push(street + (a.house_number ? ", " + a.house_number : ""));
    if (city) parts.push(city);
    return parts.join(", ").slice(0, 160);
  } catch (e) {
    return "";
  }
}

async function resolveReviewLink(env, input) {
  let raw = (input || "").trim();
  if (!raw) return { error: "empty_link" };
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  // посилання з Apple Карт не містить нічого від Google — відгук за ним не знайти
  if (/^https?:\/\/([a-z0-9-]+\.)*(maps\.apple\.com|maps\.apple|apple\.co)\//i.test(raw)) return { error: "apple_maps" };

  if (/writereview|!12e1|g\.page\/r\//i.test(raw)) {
    const pid = pick(raw, /[?&]placeid=([A-Za-z0-9_-]{10,})/i);
    const det = await placeDetails(env, pid);
    return {
      ok: true,
      review: raw,
      source: "ready",
      name: cleanPlaceName(det && det.name),
      address: (det && det.address) || "",
      appSafe: /writereview/i.test(raw),
    };
  }

  const { finalUrl, chain } = await expandUrl(raw);
  let haystack = chain;
  // iPhone-посилання (g_st=it) розкриваються в «maps?q=Назва, адреса&ftid=…» — без /place/ і координат
  const fromQuery = placeFromQuery(finalUrl);
  let name = placeName(finalUrl) || fromQuery.name;
  let address = fromQuery.address;

  try {
    const res = await fetch(finalUrl, {
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept-Language": MAPS_LANG },
    });
    const body = (await res.text()).slice(0, 600000);
    haystack += "\n" + res.url + "\n" + body;
    const fromHtml = placeFromHtml(body);
    address = address || fromHtml.address;
    name = name || placeName(res.url) || fromHtml.name ||
      pick(body, /<meta content="([^"]{2,120})" itemprop="name"/);
  } catch (e) {}

  const placeId = findPlaceId(haystack);
  const ftid = findFtid(haystack);

  // немає адреси ні в Google, ні в мета-тегах — беремо за координатами з OSM
  const coords = findCoords(chain + "\n" + finalUrl) || findCoords(haystack);
  const addrFallback = async () => address || (await reverseGeocode(coords));

  if (placeId) {
    const det = await placeDetails(env, placeId);
    return {
      ok: true,
      review: "https://search.google.com/local/writereview?placeid=" + placeId,
      placeId,
      name: cleanPlaceName((det && det.name) || name),
      address: (det && det.address) || (await addrFallback()),
      source: "placeid",
      appSafe: true,
    };
  }

  if (ftid) {
    return {
      ok: true,
      review: reviewByFtid(ftid),
      ftid,
      name: cleanPlaceName(name),
      address: await addrFallback(),
      source: "ftid",
      appSafe: false,
    };
  }

  const cid = pick(haystack, /[?&]cid=(\d+)/) || pick(haystack, /ludocid[=:"]+(\d+)/);
  if (cid) {
    try {
      const hex = BigInt(cid).toString(16);
      return {
        ok: true,
        review: reviewByFtid("0x0:0x" + hex),
        ftid: "0x0:0x" + hex,
        name: cleanPlaceName(name),
        address: await addrFallback(),
        source: "cid",
        appSafe: false,
      };
    } catch (e) {}
  }

  if (env.GOOGLE_API_KEY && name) {
    try {
      const api = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_API_KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
        },
        body: JSON.stringify({ textQuery: name, languageCode: "uk" }),
      });
      const data = await api.json();
      const p = data.places && data.places[0];
      if (p && p.id) {
        return {
          ok: true,
          review: "https://search.google.com/local/writereview?placeid=" + p.id,
          placeId: p.id,
          name: cleanPlaceName((p.displayName && p.displayName.text) || name),
          address: p.formattedAddress ? tidyAddress(p.formattedAddress) : address,
          source: "places_api",
          appSafe: true,
        };
      }
    } catch (e) {}
  }

  return { error: "resolve_failed" };
}

function findPlaceId(text) {
  return (
    pick(text, /place_id[:=]"?(ChI[A-Za-z0-9_-]{15,})/) ||
    pick(text, /"(ChI[A-Za-z0-9_-]{20,})"/) ||
    pick(text, /\\"(ChI[A-Za-z0-9_-]{20,})\\"/) ||
    pick(text, /\b(ChI[A-Za-z0-9_-]{24,})/)
  );
}

function findFtid(text) {
  return (
    pick(text, /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) ||
    pick(text, /[?&]ftid=(0x[0-9a-f]+:0x[0-9a-f]+)/i) ||
    pick(text, /(0x[0-9a-f]{8,}:0x[0-9a-f]{8,})/i)
  );
}

function reviewByFtid(ftid) {
  return "https://www.google.com/maps/place//data=!4m3!3m2!1s" + ftid + "!12e1";
}

// Google інколи кодує назву двічі (%25D0%2594…) — розкодовуємо, доки змінюється
function deepDecode(s, plusIsSpace) {
  s = String(s || "");
  for (let i = 0; i < 4; i++) {
    // після першого проходу розкодовуємо далі, лише поки лишаються «%XX»
    if (i > 0 && !/%[0-9a-f]{2}/i.test(s)) break;
    let d;
    try {
      // у шляху Google «+» — це пробіл на кожному рівні кодування;
      // справжній плюс у назві закодований як %2B і переживе заміну
      d = decodeURIComponent(plusIsSpace ? s.replace(/\+/g, " ") : s);
    } catch (e) {
      break;
    }
    if (d === s) break;
    s = d;
  }
  return s;
}

function cleanPlaceName(s) {
  s = deepDecode(s)
    .replace(/&[#a-z0-9]+;/gi, m => htmlDecode(m))
    .replace(/\s+/g, " ")
    .trim();
  // «Відділ+продажу+DAYTONA» без жодного пробілу — плюси замість пробілів
  if (!/\s/.test(s) && /\+/.test(s)) s = s.replace(/\+/g, " ");
  // якщо після розкодування лишилось «%D0%…» — це не назва
  if (/%[0-9A-F]{2}/i.test(s)) return "";
  // загальна сторінка Google замість закладу — теж не назва
  if (/^google(\s+(maps|карти|карты))?$/i.test(s)) return "";
  return s.slice(0, 120);
}

// «?q=Honey, вулиця Капушанська, 61, Ужгород, Закарпатська область, 88000» → назва й адреса
function placeFromQuery(u) {
  let q = "";
  try {
    q = new URL(u).searchParams.get("q") || "";
  } catch (e) {}
  const parts = q.split(",").map(x => x.trim()).filter(Boolean);
  if (parts.length < 2 || /^-?\d{1,3}\.\d+$/.test(parts[0])) return { name: "", address: "" };
  // у місця без назви q починається одразу з вулиці — тоді назви немає
  const street = /^(вул\.?|вулиця|просп\.?|проспект|пров\.?|провулок|пл\.?|площа|бульв\.?|бульвар|наб\.?|набережна|шосе|ул\.?|улица|street|st\.?|avenue|ave\.?|road|rd\.?)(\s|$)|^\d/i;
  // «Kapushanska St» — англійська адреса, тип вулиці в кінці
  const streetEnd = /\s(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|sq|square)\.?$/i;
  // plus-код точки без закладу: «8X5W+R2»
  const plus = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{0,3}(\s|$)/i;
  if (plus.test(parts[0])) parts[0] = parts[0].replace(plus, "").trim();
  const hasName = !!parts[0] && !street.test(parts[0]) && !streetEnd.test(parts[0]);
  const rest = (hasName ? parts.slice(1) : parts).filter(p => p && !/област|oblast|region/i.test(p));
  return {
    name: hasName ? cleanPlaceName(parts[0]) : "",
    address: rest.length ? tidyAddress(rest.join(", ")) : "",
  };
}

function placeName(u) {
  const m = deepDecode(u, true).match(/\/place\/([^/@?]+)/);
  return m ? cleanPlaceName(m[1]) : null;
}

function pick(text, re) {
  const m = (text || "").match(re);
  return m ? m[1] : null;
}

// ─────────────────────── Авторизація ───────────────────────

// токен — лише в заголовку Authorization (не в адресі: не потрапляє в історію й логи)
async function authenticate(env, url, request) {
  const t = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t || t.length > 200) return null;

  if (env.ADMIN_TOKEN && (await sameSecret(t, env.ADMIN_TOKEN))) return { role: "admin" };

  if (!/^[a-z0-9]{16,64}$/.test(t)) return null;
  const raw = await env.LINKS.get("__client:" + t);
  if (raw) {
    let name = "";
    try {
      name = (JSON.parse(raw) || {}).name || "";
    } catch (e) {}
    return { role: "client", token: t, name };
  }
  return null;
}

const CLIENT_ACTIONS = ["check", "list", "stats", "export"];

// ─────────────────────────── API ───────────────────────────

async function handleApi(request, env, url, action) {
  if (await tooManyFails(request)) return json({ error: "too_many" }, 429);
  const who = await authenticate(env, url, request);
  if (!who) {
    await noteFail(request);
    return json({ error: "unauthorized" }, 401);
  }
  if (who.role === "client" && CLIENT_ACTIONS.indexOf(action) === -1) {
    return json({ error: "forbidden" }, 403);
  }

  const code = url.searchParams.get("code");
  const target = url.searchParams.get("url");
  const lang = url.searchParams.get("lang") === "en" ? "en" : "uk";

  if (action === "check") {
    return json({
      ok: true,
      role: who.role,
      name: who.name || "",
      d1: !!env.DB,
      places: !!env.GOOGLE_API_KEY,
      r2: !!env.IMG,
      weak: who.role === "admin" && String(env.ADMIN_TOKEN || "").length < 24,
    });
  }

  if (action === "list") {
    const [links, counts] = await Promise.all([allLinks(env), scanCounts(env)]);
    const items = [];

    for (const { code: c, rec } of links) {
      if (who.role === "client" && rec.owner !== who.token) continue;
      const n = counts[c] || { total: 0, unique: 0 };
      items.push({
        code: c,
        url: rec.url || "",
        draft: !rec.url,
        title: rec.title || "",
        owner: rec.owner || "",
        folder: who.role === "admin" ? rec.folder || "" : "",
        kind: rec.kind || "",
        sold: who.role === "admin" ? !!rec.sold : false,
        activated: !!rec.activated,
        blocked: !!rec.blocked,
        scans: n.total,
        unique: n.unique,
      });
    }

    items.sort((a, b) => b.scans - a.scans || a.code.localeCompare(b.code));
    return json({ ok: true, count: items.length, items });
  }

  if (action === "stats") {
    if (!code) return json({ error: "need_code" }, 400);
    if (!(await mayTouch(env, who, code))) return json({ error: "forbidden" }, 403);
    return json(await scanStats(env, code));
  }

  if (action === "export") {
    let codes = null; // null = уся статистика (лише адмін)
    if (code) {
      if (!(await mayTouch(env, who, code))) return json({ error: "forbidden" }, 403);
      codes = [code];
    } else if (who.role === "client") {
      codes = (await allLinks(env)).filter(x => x.rec.owner === who.token).map(x => x.code);
    }
    const csv = await exportCsv(env, codes, lang);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition":
          'attachment; filename="scans-' + (code || "all") + '.csv"',
      },
    });
  }

  // ── лише адмін ──

  if (action === "init") {
    if (!env.DB) return json({ error: "no_db_binding" }, 400);
    await env.DB.exec(
      "CREATE TABLE IF NOT EXISTS scans (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, ts INTEGER NOT NULL, country TEXT, city TEXT, device TEXT)"
    );
    for (const sql of [
      "ALTER TABLE scans ADD COLUMN fp TEXT",
      "ALTER TABLE scans ADD COLUMN uniq INTEGER DEFAULT 1",
    ]) {
      try {
        await env.DB.exec(sql);
      } catch (e) {}
    }
    await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_scans_code ON scans (code)");
    await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_scans_ts ON scans (ts)");
    await env.DB.exec("CREATE INDEX IF NOT EXISTS idx_scans_fp ON scans (fp)");
    return json({ ok: true, message: "database ready" });
  }

  if (action === "resolve") {
    return json(await resolveReviewLink(env, url.searchParams.get("maps")));
  }

  if (action === "reserve") {
    const n = Math.min(Math.max(parseInt(url.searchParams.get("count") || "1", 10) || 1, 1), 200);
    const title = (url.searchParams.get("title") || "").trim().slice(0, 120);
    const owner = url.searchParams.get("owner") || "";
    const folder = (url.searchParams.get("folder") || "").trim().slice(0, 40);
    const kindIn = url.searchParams.get("kind") || "";
    const kind = ALL_KINDS.indexOf(kindIn) !== -1 ? kindIn : "";
    const made = [];
    let guard = 0;

    while (made.length < n && guard++ < n * 5) {
      const key = randomCode();
      if (await env.LINKS.get(key)) continue; // не затираємо наявний код
      await putLink(env, key, {
        url: "",
        title,
        owner,
        folder,
        kind,
        sold: false,
        created: Date.now(),
      });
      made.push({ code: key, short: `${url.origin}/${key}` });
    }
    return json({ ok: true, count: made.length, items: made });
  }

  if (action === "set" || action === "new") {
    let key = code;
    if (action === "new") {
      let guard = 0;
      do {
        key = randomCode();
      } while ((await env.LINKS.get(key)) && guard++ < 10);
    } else {
      if (!key) return json({ error: "need_code" }, 400);
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) return json({ error: "bad_code" }, 400);
      if (RESERVED.indexOf(key.toLowerCase()) !== -1)
        return json({ error: "reserved_code" }, 400);
      if (isSystemKey(key)) return json({ error: "bad_code" }, 400);
    }

    const dest = (target || "").trim();
    if (dest && !isWebUrl(dest) && !isInternalTarget(dest)) return json({ error: "bad_url" }, 400);

    const prev = parseLink(await env.LINKS.get(key)) || {};
    const rec = Object.assign({}, prev, {
      url: dest,
      title: url.searchParams.get("title") || prev.title || "",
      owner: url.searchParams.has("owner")
        ? url.searchParams.get("owner")
        : prev.owner || "",
      folder: url.searchParams.has("folder")
        ? (url.searchParams.get("folder") || "").trim().slice(0, 40)
        : prev.folder || "",
      created: prev.created || Date.now(),
    });

    await putLink(env, key, rec);
    if (prev.url !== rec.url) await addLog(env, key, "admin", "url → " + (rec.url || "—"), request);
    return json({
      ok: true,
      code: key,
      url: rec.url,
      draft: !rec.url,
      short: `${url.origin}/${key}`,
    });
  }

  if (action === "img_upload") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);
    if (!env.IMG) return json({ error: "no_r2" }, 400);

    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty_file" }, 400);
    if (buf.byteLength > 12 * 1024 * 1024) return json({ error: "too_big" }, 400);

    // тип визначаємо за вмістом файлу, а не за тим, що надіслав браузер
    const kind = sniffImage(new Uint8Array(buf.slice(0, 16)));
    if (!kind) return json({ error: "bad_image" }, 400);
    const [type, ext] = kind;

    const key = randomCode(10) + "." + ext;
    await env.IMG.put(key, buf, { httpMetadata: { contentType: type } });
    return json({ ok: true, url: `${url.origin}/img/${key}`, path: "/img/" + key });
  }

  if (action === "menu_get") {
    if (!code) return json({ error: "need_code" }, 400);
    const raw = await env.LINKS.get("__menu:" + code);
    let menu = null;
    try {
      menu = raw ? JSON.parse(raw) : null;
    } catch (e) {}
    return json({ ok: true, code, menu: menu || null });
  }

  if (action === "menu_save") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "bad_menu" }, 400);
    }

    const key = (body.code || "").trim();
    if (!key) return json({ error: "need_code" }, 400);
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) return json({ error: "bad_code" }, 400);
    if (RESERVED.indexOf(key.toLowerCase()) !== -1) return json({ error: "reserved_code" }, 400);

    const menu = {
      title: (body.title || "").slice(0, 120),
      note: (body.note || "").slice(0, 200),
      text: (body.text || "").slice(0, 20000),
      title_en: (body.title_en || "").slice(0, 120),
      note_en: (body.note_en || "").slice(0, 200),
      text_en: (body.text_en || "").slice(0, 20000),
      theme: MENU_THEMES[body.theme] ? body.theme : "cream",
      bg: safeBg(body.bg),
      updated: Date.now(),
    };
    await env.LINKS.put("__menu:" + key, JSON.stringify(menu));

    const prev = parseLink(await env.LINKS.get(key)) || {};
    await putLink(env, key, Object.assign({}, prev, {
      url: "menu:" + key,
      title: menu.title || prev.title || "",
      owner: body.owner !== undefined ? body.owner : (prev.owner || ""),
      folder: prev.folder || "",
      created: prev.created || Date.now(),
    }));

    return json({ ok: true, code: key, short: `${url.origin}/${key}` });
  }

  if (action === "menu_del") {
    if (!code) return json({ error: "need_code" }, 400);
    await env.LINKS.delete("__menu:" + code);
    const prev = parseLink(await env.LINKS.get(code));
    if (prev && prev.url.indexOf("menu:") === 0) {
      prev.url = "";
      await putLink(env, code, prev);
    }
    return json({ ok: true, deleted: code });
  }

  // ── візитки vCard ──

  if (action === "vcard_get") {
    if (!code) return json({ error: "need_code" }, 400);
    return json({ ok: true, code, card: await readVcard(env, code) });
  }

  if (action === "vcard_save") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "need_post" }, 400);
    }
    const key = String(body.code || "").trim();
    if (!key) return json({ error: "need_code" }, 400);
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) return json({ error: "bad_code" }, 400);
    if (RESERVED.indexOf(key.toLowerCase()) !== -1) return json({ error: "reserved_code" }, 400);

    const card = cleanVcard(body);
    if (!card.name) return json({ error: "need_name" }, 400);
    await env.LINKS.put("__vcard:" + key, JSON.stringify(card));

    const prev = parseLink(await env.LINKS.get(key)) || {};
    await putLink(env, key, Object.assign({}, prev, {
      url: "card:" + key,
      title: prev.title || card.name,
      owner: prev.owner || "",
      folder: prev.folder || "",
      created: prev.created || Date.now(),
    }));
    return json({ ok: true, code: key, short: `${url.origin}/${key}` });
  }

  if (action === "vcard_del") {
    if (!code) return json({ error: "need_code" }, 400);
    await env.LINKS.delete("__vcard:" + code);
    const prev = parseLink(await env.LINKS.get(code));
    if (prev && (prev.url || "").indexOf("card:") === 0) {
      prev.url = "";
      await putLink(env, code, prev);
    }
    return json({ ok: true, deleted: code });
  }

  // ── самоактивація: тип, «продано», скидання, блокування, журнал ──

  if (action === "mark") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "need_post" }, 400);
    }
    const codes = Array.isArray(body.codes) ? body.codes.slice(0, 300) : [];
    const setKind = typeof body.kind === "string" && ALL_KINDS.indexOf(body.kind) !== -1;
    const setSold = typeof body.sold === "boolean";
    let changed = 0;
    for (const c of codes) {
      if (typeof c !== "string" || isSystemKey(c)) continue;
      const link = parseLink(await env.LINKS.get(c));
      if (!link) continue;
      if (setKind) link.kind = body.kind;
      if (setSold) link.sold = body.sold;
      await putLink(env, c, link);
      changed++;
    }
    return json({ ok: true, changed });
  }

  if (action === "owner_reset") {
    if (!code) return json({ error: "need_code" }, 400);
    const link = parseLink(await env.LINKS.get(code));
    if (!link) return json({ error: "need_code" }, 400);
    if ((link.url || "").indexOf("card:") === 0) await env.LINKS.delete("__vcard:" + code);
    link.url = "";
    delete link.edit;
    link.activated = 0;
    link.sold = true;
    await putLink(env, code, link);
    await addLog(env, code, "admin", "reset owner", request);
    return json({ ok: true });
  }

  if (action === "block") {
    if (!code) return json({ error: "need_code" }, 400);
    const link = parseLink(await env.LINKS.get(code));
    if (!link) return json({ error: "need_code" }, 400);
    link.blocked = url.searchParams.get("on") === "1";
    await putLink(env, code, link);
    await addLog(env, code, "admin", link.blocked ? "blocked" : "unblocked", request);
    return json({ ok: true, blocked: link.blocked });
  }

  if (action === "log") {
    if (!code) return json({ error: "need_code" }, 400);
    let items = [];
    try {
      items = JSON.parse((await env.LINKS.get("__log:" + code)) || "[]");
    } catch (e) {}
    return json({ ok: true, code, items: Array.isArray(items) ? items : [] });
  }

  if (action === "move") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "need_post" }, 400);
    }
    const codes = Array.isArray(body.codes) ? body.codes.slice(0, 300) : [];
    const folder = String(body.folder || "").trim().slice(0, 40);
    let moved = 0;
    for (const c of codes) {
      if (typeof c !== "string" || isSystemKey(c)) continue;
      const link = parseLink(await env.LINKS.get(c));
      if (!link) continue;
      link.folder = folder;
      await putLink(env, c, link);
      moved++;
    }
    return json({ ok: true, moved, folder });
  }

  if (action === "migrate") {
    let done = 0;
    let left = 0;
    for (const k of await listAllKeys(env)) {
      if (isSystemKey(k.name)) continue;
      if (k.metadata && "u" in k.metadata) continue;
      if (done >= 300) {
        left++;
        continue;
      }
      const rec = parseLink(await env.LINKS.get(k.name));
      if (!rec) continue;
      await putLink(env, k.name, rec);
      done++;
    }
    return json({ ok: true, migrated: done, left });
  }

  // ── шаблони карток ──

  if (action === "tpl_list") {
    return json({ ok: true, items: await readTemplates(env) });
  }

  if (action === "tpl_save") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);
    let b;
    try {
      b = await request.json();
    } catch (e) {
      return json({ error: "need_post" }, 400);
    }
    const num = (v, lo, hi, d) => {
      const n = parseFloat(v);
      return isFinite(n) ? Math.min(Math.max(n, lo), hi) : d;
    };
    const img = String(b.img || "");
    if (!/^\/img\/[A-Za-z0-9._-]+$/.test(img)) return json({ error: "need_img" }, 400);

    const rec = {
      id: /^[a-z0-9]{4,16}$/.test(b.id || "") ? b.id : randomCode(8),
      name: String(b.name || "").trim().slice(0, 80) || "Шаблон",
      img,
      w: num(b.w, 5, 1000, 90),
      h: num(b.h, 5, 1000, 90),
      x: num(b.x, 0, 100, 0),
      y: num(b.y, 0, 100, 0),
      s: num(b.s, 1, 100, 20),
      cap: !!b.cap,
      updated: Date.now(),
    };
    const items = (await readTemplates(env)).filter(t => t.id !== rec.id);
    items.push(rec);
    items.sort((a, c) => a.name.localeCompare(c.name));
    await env.LINKS.put("__templates", JSON.stringify(items));
    return json({ ok: true, id: rec.id, items });
  }

  if (action === "tpl_del") {
    const id = url.searchParams.get("id");
    const items = (await readTemplates(env)).filter(t => t.id !== id);
    await env.LINKS.put("__templates", JSON.stringify(items));
    return json({ ok: true, items });
  }

  if (action === "delete") {
    if (!code) return json({ error: "need_code" }, 400);
    await env.LINKS.delete(code);
    await env.LINKS.delete("__menu:" + code);
    await env.LINKS.delete("__vcard:" + code);
    await env.LINKS.delete("__log:" + code);
    if (env.DB) {
      try {
        await env.DB.prepare("DELETE FROM scans WHERE code = ?").bind(code).run();
      } catch (e) {}
    }
    return json({ ok: true, deleted: code });
  }

  // ── клієнти ──

  if (action === "clients") {
    const keys = await listAllKeys(env, "__client:");
    const items = [];
    for (const k of keys) {
      const t = k.name.slice("__client:".length);
      let name = "";
      let created = 0;
      let paidUntil = "";
      try {
        const o = JSON.parse(await env.LINKS.get(k.name)) || {};
        name = o.name || "";
        created = o.created || 0;
        paidUntil = o.paidUntil || "";
      } catch (e) {}
      items.push({ token: t, name, created, paidUntil, cabinet: `${url.origin}/c/${t}` });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return json({ ok: true, items });
  }

  if (action === "client_new") {
    const name = (url.searchParams.get("name") || "").trim();
    if (!name) return json({ error: "need_name" }, 400);
    const t = randomCode(24);
    await env.LINKS.put(
      "__client:" + t,
      JSON.stringify({
        name,
        created: Date.now(),
        paidUntil: url.searchParams.get("paid") || "",
      })
    );
    return json({ ok: true, token: t, name, cabinet: `${url.origin}/c/${t}` });
  }

  if (action === "client_pay") {
    const tk = url.searchParams.get("client");
    if (!tk) return json({ error: "need_client" }, 400);
    const raw = await env.LINKS.get("__client:" + tk);
    if (!raw) return json({ error: "need_client" }, 400);
    let o = {};
    try {
      o = JSON.parse(raw) || {};
    } catch (e) {}
    o.paidUntil = url.searchParams.get("paid") || "";
    await env.LINKS.put("__client:" + tk, JSON.stringify(o));
    return json({ ok: true, paidUntil: o.paidUntil });
  }

  if (action === "client_rotate") {
    const old = url.searchParams.get("client");
    if (!old) return json({ error: "need_client" }, 400);
    const raw = await env.LINKS.get("__client:" + old);
    if (!raw) return json({ error: "need_client" }, 400);

    const fresh = randomCode(24);
    await env.LINKS.put("__client:" + fresh, raw);
    await env.LINKS.delete("__client:" + old);

    for (const { code: c, rec } of await allLinks(env)) {
      if (rec.owner !== old) continue;
      const full = parseLink(await env.LINKS.get(c));
      if (!full) continue;
      full.owner = fresh;
      await putLink(env, c, full);
    }
    return json({ ok: true, token: fresh, cabinet: `${url.origin}/c/${fresh}` });
  }

  if (action === "backup") {
    const clients = [];
    for (const k of await listAllKeys(env, "__client:")) {
      let o = {};
      try {
        o = JSON.parse(await env.LINKS.get(k.name)) || {};
      } catch (e) {}
      const tk = k.name.slice("__client:".length);
      clients.push({
        token: tk,
        name: o.name || "",
        created: o.created || 0,
        paidUntil: o.paidUntil || "",
        cabinet: `${url.origin}/c/${tk}`,
      });
    }

    const links = [];
    for (const { code: c, rec } of await allLinks(env)) {
      // ключ власника є лише в повному записі
      const l = rec.activated ? parseLink(await env.LINKS.get(c)) || rec : rec;
      links.push({
        code: c,
        url: l.url || "",
        title: l.title || "",
        owner: l.owner || "",
        folder: l.folder || "",
        kind: l.kind || "",
        sold: !!l.sold,
        activated: l.activated || 0,
        blocked: !!l.blocked,
        edit: l.edit || "",
        created: l.created || 0,
        short: `${url.origin}/${c}`,
      });
    }

    const menus = [];
    for (const k of await listAllKeys(env, "__menu:")) {
      try {
        const m = JSON.parse(await env.LINKS.get(k.name));
        if (m) menus.push({ code: k.name.slice("__menu:".length), menu: m });
      } catch (e) {}
    }

    const vcards = [];
    for (const k of await listAllKeys(env, "__vcard:")) {
      try {
        const v = JSON.parse(await env.LINKS.get(k.name));
        if (v) vcards.push({ code: k.name.slice("__vcard:".length), card: v });
      } catch (e) {}
    }

    const body = JSON.stringify(
      {
        format: "qr-redirect-backup",
        version: 15,
        exported: new Date().toISOString(),
        origin: url.origin,
        links,
        clients,
        templates: await readTemplates(env),
        menus,
        vcards,
      },
      null,
      2
    );

    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          'attachment; filename="dflust-backup-' +
          new Date().toISOString().slice(0, 10) +
          '.json"',
      },
    });
  }

  if (action === "restore") {
    if (request.method !== "POST") return json({ error: "need_post" }, 400);

    let data;
    try {
      data = await request.json();
    } catch (e) {
      return json({ error: "bad_backup" }, 400);
    }
    if (!data || !Array.isArray(data.links)) return json({ error: "bad_backup" }, 400);

    const overwrite = url.searchParams.get("overwrite") === "1";
    let nLinks = 0;
    let nClients = 0;
    let skipped = 0;

    for (const c of data.clients || []) {
      if (!c || !c.token) continue;
      const k = "__client:" + c.token;
      if (!overwrite && (await env.LINKS.get(k))) {
        skipped++;
        continue;
      }
      await env.LINKS.put(
        k,
        JSON.stringify({
          name: c.name || "",
          created: c.created || Date.now(),
          paidUntil: c.paidUntil || "",
        })
      );
      nClients++;
    }

    if (Array.isArray(data.templates) && data.templates.length) {
      const have = await readTemplates(env);
      const ids = new Set(have.map(t => t.id));
      const merged = overwrite
        ? have.filter(t => !data.templates.some(n => n && n.id === t.id))
        : have.slice();
      for (const t of data.templates) {
        if (!t || !t.id || !t.img) continue;
        if (!overwrite && ids.has(t.id)) continue;
        merged.push(t);
      }
      await env.LINKS.put("__templates", JSON.stringify(merged));
    }

    for (const l of data.links.slice(0, 300)) {
      if (!l || !l.code) continue;
      if (isSystemKey(l.code)) continue;
      if (RESERVED.indexOf(String(l.code).toLowerCase()) !== -1) continue;
      if (!overwrite && (await env.LINKS.get(l.code))) {
        skipped++;
        continue;
      }
      const lu = String(l.url || "");
      await putLink(env, l.code, {
        url: isWebUrl(lu) || isInternalTarget(lu) ? lu : "",
        title: l.title || "",
        owner: l.owner || "",
        folder: l.folder || "",
        kind: ALL_KINDS.indexOf(l.kind || "") !== -1 ? l.kind || "" : "",
        sold: !!l.sold,
        activated: l.activated || 0,
        blocked: !!l.blocked,
        edit: /^[0-9a-f]{64}$/.test(l.edit || "") ? l.edit : undefined,
        created: l.created || Date.now(),
      });
      nLinks++;
    }

    let nExtra = 0;
    const okCode = c => typeof c === "string" && /^[a-zA-Z0-9_-]+$/.test(c);

    for (const m of (Array.isArray(data.menus) ? data.menus : []).slice(0, 200)) {
      if (!m || !okCode(m.code) || !m.menu) continue;
      const k = "__menu:" + m.code;
      if (!overwrite && (await env.LINKS.get(k))) {
        skipped++;
        continue;
      }
      const menu = Object.assign({}, m.menu, { bg: safeBg(m.menu.bg) });
      await env.LINKS.put(k, JSON.stringify(menu));
      nExtra++;
    }

    for (const v of (Array.isArray(data.vcards) ? data.vcards : []).slice(0, 200)) {
      if (!v || !okCode(v.code) || !v.card) continue;
      const k = "__vcard:" + v.code;
      if (!overwrite && (await env.LINKS.get(k))) {
        skipped++;
        continue;
      }
      await env.LINKS.put(k, JSON.stringify(cleanVcard(v.card)));
      nExtra++;
    }

    return json({ ok: true, links: nLinks, clients: nClients, extra: nExtra, skipped });
  }

  if (action === "client_del") {
    const t = url.searchParams.get("client");
    if (!t) return json({ error: "need_client" }, 400);
    await env.LINKS.delete("__client:" + t);

    for (const { code: c, rec } of await allLinks(env)) {
      if (rec.owner !== t) continue;
      const full = parseLink(await env.LINKS.get(c));
      if (!full) continue;
      full.owner = "";
      await putLink(env, c, full);
    }
    return json({ ok: true, deleted: t });
  }

  return json({ error: "unknown_action" }, 404);
}

async function mayTouch(env, who, code) {
  if (who.role === "admin") return true;
  const link = parseLink(await env.LINKS.get(code));
  return !!link && link.owner === who.token;
}

function randomCode(length = 6) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function html(body, status = 200, extra) {
  return new Response(body, {
    status,
    headers: Object.assign(
      {
        "content-type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
      PUBLIC_HEADERS,
      extra || {}
    ),
  });
}

// ─────────────────── Прості сторінки ───────────────────

// статичні зразки QR для лендингу
const QR_CARD_RECTS = `<rect x="0" y="0" width="7" height="1"/><rect x="8" y="0" width="3" height="1"/><rect x="12" y="0" width="1" height="1"/><rect x="14" y="0" width="1" height="1"/><rect x="18" y="0" width="7" height="1"/><rect x="0" y="1" width="1" height="1"/><rect x="6" y="1" width="1" height="1"/><rect x="8" y="1" width="2" height="1"/><rect x="12" y="1" width="2" height="1"/><rect x="16" y="1" width="1" height="1"/><rect x="18" y="1" width="1" height="1"/><rect x="24" y="1" width="1" height="1"/><rect x="0" y="2" width="1" height="1"/><rect x="2" y="2" width="3" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="8" y="2" width="1" height="1"/><rect x="10" y="2" width="5" height="1"/><rect x="18" y="2" width="1" height="1"/><rect x="20" y="2" width="3" height="1"/><rect x="24" y="2" width="1" height="1"/><rect x="0" y="3" width="1" height="1"/><rect x="2" y="3" width="3" height="1"/><rect x="6" y="3" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/><rect x="13" y="3" width="4" height="1"/><rect x="18" y="3" width="1" height="1"/><rect x="20" y="3" width="3" height="1"/><rect x="24" y="3" width="1" height="1"/><rect x="0" y="4" width="1" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/><rect x="10" y="4" width="1" height="1"/><rect x="12" y="4" width="3" height="1"/><rect x="16" y="4" width="1" height="1"/><rect x="18" y="4" width="1" height="1"/><rect x="20" y="4" width="3" height="1"/><rect x="24" y="4" width="1" height="1"/><rect x="0" y="5" width="1" height="1"/><rect x="6" y="5" width="1" height="1"/><rect x="10" y="5" width="2" height="1"/><rect x="13" y="5" width="2" height="1"/><rect x="18" y="5" width="1" height="1"/><rect x="24" y="5" width="1" height="1"/><rect x="0" y="6" width="7" height="1"/><rect x="8" y="6" width="1" height="1"/><rect x="10" y="6" width="1" height="1"/><rect x="12" y="6" width="1" height="1"/><rect x="14" y="6" width="1" height="1"/><rect x="16" y="6" width="1" height="1"/><rect x="18" y="6" width="7" height="1"/><rect x="9" y="7" width="1" height="1"/><rect x="13" y="7" width="1" height="1"/><rect x="15" y="7" width="1" height="1"/><rect x="0" y="8" width="1" height="1"/><rect x="3" y="8" width="9" height="1"/><rect x="14" y="8" width="4" height="1"/><rect x="20" y="8" width="1" height="1"/><rect x="22" y="8" width="3" height="1"/><rect x="1" y="9" width="4" height="1"/><rect x="7" y="9" width="1" height="1"/><rect x="12" y="9" width="1" height="1"/><rect x="14" y="9" width="2" height="1"/><rect x="19" y="9" width="5" height="1"/><rect x="1" y="10" width="1" height="1"/><rect x="3" y="10" width="5" height="1"/><rect x="10" y="10" width="1" height="1"/><rect x="12" y="10" width="1" height="1"/><rect x="15" y="10" width="1" height="1"/><rect x="18" y="10" width="1" height="1"/><rect x="20" y="10" width="2" height="1"/><rect x="24" y="10" width="1" height="1"/><rect x="0" y="11" width="1" height="1"/><rect x="5" y="11" width="1" height="1"/><rect x="7" y="11" width="2" height="1"/><rect x="12" y="11" width="1" height="1"/><rect x="15" y="11" width="1" height="1"/><rect x="17" y="11" width="1" height="1"/><rect x="19" y="11" width="1" height="1"/><rect x="21" y="11" width="4" height="1"/><rect x="6" y="12" width="1" height="1"/><rect x="8" y="12" width="2" height="1"/><rect x="11" y="12" width="1" height="1"/><rect x="16" y="12" width="1" height="1"/><rect x="18" y="12" width="2" height="1"/><rect x="24" y="12" width="1" height="1"/><rect x="0" y="13" width="1" height="1"/><rect x="2" y="13" width="2" height="1"/><rect x="5" y="13" width="1" height="1"/><rect x="8" y="13" width="3" height="1"/><rect x="12" y="13" width="4" height="1"/><rect x="20" y="13" width="1" height="1"/><rect x="23" y="13" width="1" height="1"/><rect x="0" y="14" width="2" height="1"/><rect x="6" y="14" width="1" height="1"/><rect x="8" y="14" width="1" height="1"/><rect x="13" y="14" width="5" height="1"/><rect x="20" y="14" width="5" height="1"/><rect x="0" y="15" width="1" height="1"/><rect x="2" y="15" width="1" height="1"/><rect x="4" y="15" width="1" height="1"/><rect x="7" y="15" width="1" height="1"/><rect x="12" y="15" width="1" height="1"/><rect x="18" y="15" width="2" height="1"/><rect x="21" y="15" width="2" height="1"/><rect x="24" y="15" width="1" height="1"/><rect x="0" y="16" width="1" height="1"/><rect x="3" y="16" width="1" height="1"/><rect x="6" y="16" width="1" height="1"/><rect x="8" y="16" width="6" height="1"/><rect x="15" y="16" width="6" height="1"/><rect x="22" y="16" width="2" height="1"/><rect x="8" y="17" width="2" height="1"/><rect x="11" y="17" width="1" height="1"/><rect x="13" y="17" width="1" height="1"/><rect x="15" y="17" width="2" height="1"/><rect x="20" y="17" width="1" height="1"/><rect x="22" y="17" width="2" height="1"/><rect x="0" y="18" width="7" height="1"/><rect x="8" y="18" width="1" height="1"/><rect x="10" y="18" width="1" height="1"/><rect x="12" y="18" width="2" height="1"/><rect x="16" y="18" width="1" height="1"/><rect x="18" y="18" width="1" height="1"/><rect x="20" y="18" width="1" height="1"/><rect x="24" y="18" width="1" height="1"/><rect x="0" y="19" width="1" height="1"/><rect x="6" y="19" width="1" height="1"/><rect x="8" y="19" width="4" height="1"/><rect x="13" y="19" width="1" height="1"/><rect x="15" y="19" width="2" height="1"/><rect x="20" y="19" width="1" height="1"/><rect x="23" y="19" width="1" height="1"/><rect x="0" y="20" width="1" height="1"/><rect x="2" y="20" width="3" height="1"/><rect x="6" y="20" width="1" height="1"/><rect x="8" y="20" width="1" height="1"/><rect x="10" y="20" width="3" height="1"/><rect x="14" y="20" width="7" height="1"/><rect x="23" y="20" width="2" height="1"/><rect x="0" y="21" width="1" height="1"/><rect x="2" y="21" width="3" height="1"/><rect x="6" y="21" width="1" height="1"/><rect x="8" y="21" width="1" height="1"/><rect x="10" y="21" width="1" height="1"/><rect x="12" y="21" width="4" height="1"/><rect x="17" y="21" width="2" height="1"/><rect x="23" y="21" width="2" height="1"/><rect x="0" y="22" width="1" height="1"/><rect x="2" y="22" width="3" height="1"/><rect x="6" y="22" width="1" height="1"/><rect x="9" y="22" width="1" height="1"/><rect x="11" y="22" width="3" height="1"/><rect x="15" y="22" width="1" height="1"/><rect x="20" y="22" width="5" height="1"/><rect x="0" y="23" width="1" height="1"/><rect x="6" y="23" width="1" height="1"/><rect x="9" y="23" width="1" height="1"/><rect x="11" y="23" width="2" height="1"/><rect x="14" y="23" width="2" height="1"/><rect x="18" y="23" width="3" height="1"/><rect x="22" y="23" width="3" height="1"/><rect x="0" y="24" width="7" height="1"/><rect x="8" y="24" width="1" height="1"/><rect x="10" y="24" width="5" height="1"/><rect x="16" y="24" width="1" height="1"/><rect x="18" y="24" width="1" height="1"/><rect x="21" y="24" width="1" height="1"/><rect x="24" y="24" width="1" height="1"/>`;

const QR_REVIEW_RECTS = `<rect x="0" y="0" width="7" height="1"/><rect x="11" y="0" width="1" height="1"/><rect x="14" y="0" width="1" height="1"/><rect x="18" y="0" width="7" height="1"/><rect x="0" y="1" width="1" height="1"/><rect x="6" y="1" width="1" height="1"/><rect x="9" y="1" width="4" height="1"/><rect x="14" y="1" width="1" height="1"/><rect x="16" y="1" width="1" height="1"/><rect x="18" y="1" width="1" height="1"/><rect x="24" y="1" width="1" height="1"/><rect x="0" y="2" width="1" height="1"/><rect x="2" y="2" width="3" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="10" y="2" width="4" height="1"/><rect x="18" y="2" width="1" height="1"/><rect x="20" y="2" width="3" height="1"/><rect x="24" y="2" width="1" height="1"/><rect x="0" y="3" width="1" height="1"/><rect x="2" y="3" width="3" height="1"/><rect x="6" y="3" width="1" height="1"/><rect x="8" y="3" width="2" height="1"/><rect x="11" y="3" width="1" height="1"/><rect x="15" y="3" width="1" height="1"/><rect x="18" y="3" width="1" height="1"/><rect x="20" y="3" width="3" height="1"/><rect x="24" y="3" width="1" height="1"/><rect x="0" y="4" width="1" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="9" y="4" width="1" height="1"/><rect x="11" y="4" width="4" height="1"/><rect x="18" y="4" width="1" height="1"/><rect x="20" y="4" width="3" height="1"/><rect x="24" y="4" width="1" height="1"/><rect x="0" y="5" width="1" height="1"/><rect x="6" y="5" width="1" height="1"/><rect x="8" y="5" width="1" height="1"/><rect x="16" y="5" width="1" height="1"/><rect x="18" y="5" width="1" height="1"/><rect x="24" y="5" width="1" height="1"/><rect x="0" y="6" width="7" height="1"/><rect x="8" y="6" width="1" height="1"/><rect x="10" y="6" width="1" height="1"/><rect x="12" y="6" width="1" height="1"/><rect x="14" y="6" width="1" height="1"/><rect x="16" y="6" width="1" height="1"/><rect x="18" y="6" width="7" height="1"/><rect x="8" y="7" width="1" height="1"/><rect x="10" y="7" width="3" height="1"/><rect x="15" y="7" width="1" height="1"/><rect x="1" y="8" width="2" height="1"/><rect x="6" y="8" width="1" height="1"/><rect x="12" y="8" width="5" height="1"/><rect x="18" y="8" width="2" height="1"/><rect x="21" y="8" width="1" height="1"/><rect x="4" y="9" width="1" height="1"/><rect x="7" y="9" width="1" height="1"/><rect x="12" y="9" width="2" height="1"/><rect x="15" y="9" width="2" height="1"/><rect x="18" y="9" width="2" height="1"/><rect x="21" y="9" width="1" height="1"/><rect x="23" y="9" width="2" height="1"/><rect x="2" y="10" width="2" height="1"/><rect x="6" y="10" width="2" height="1"/><rect x="9" y="10" width="1" height="1"/><rect x="11" y="10" width="2" height="1"/><rect x="15" y="10" width="2" height="1"/><rect x="18" y="10" width="5" height="1"/><rect x="24" y="10" width="1" height="1"/><rect x="1" y="11" width="1" height="1"/><rect x="3" y="11" width="2" height="1"/><rect x="8" y="11" width="2" height="1"/><rect x="13" y="11" width="1" height="1"/><rect x="15" y="11" width="2" height="1"/><rect x="18" y="11" width="2" height="1"/><rect x="21" y="11" width="1" height="1"/><rect x="1" y="12" width="1" height="1"/><rect x="4" y="12" width="1" height="1"/><rect x="6" y="12" width="1" height="1"/><rect x="8" y="12" width="1" height="1"/><rect x="13" y="12" width="1" height="1"/><rect x="16" y="12" width="1" height="1"/><rect x="18" y="12" width="2" height="1"/><rect x="24" y="12" width="1" height="1"/><rect x="1" y="13" width="5" height="1"/><rect x="11" y="13" width="3" height="1"/><rect x="15" y="13" width="1" height="1"/><rect x="18" y="13" width="2" height="1"/><rect x="23" y="13" width="2" height="1"/><rect x="0" y="14" width="2" height="1"/><rect x="6" y="14" width="1" height="1"/><rect x="8" y="14" width="1" height="1"/><rect x="14" y="14" width="3" height="1"/><rect x="21" y="14" width="2" height="1"/><rect x="24" y="14" width="1" height="1"/><rect x="2" y="15" width="1" height="1"/><rect x="5" y="15" width="1" height="1"/><rect x="7" y="15" width="3" height="1"/><rect x="11" y="15" width="3" height="1"/><rect x="16" y="15" width="1" height="1"/><rect x="19" y="15" width="3" height="1"/><rect x="0" y="16" width="4" height="1"/><rect x="5" y="16" width="2" height="1"/><rect x="8" y="16" width="1" height="1"/><rect x="13" y="16" width="8" height="1"/><rect x="23" y="16" width="1" height="1"/><rect x="8" y="17" width="1" height="1"/><rect x="11" y="17" width="1" height="1"/><rect x="13" y="17" width="1" height="1"/><rect x="15" y="17" width="2" height="1"/><rect x="20" y="17" width="1" height="1"/><rect x="24" y="17" width="1" height="1"/><rect x="0" y="18" width="7" height="1"/><rect x="10" y="18" width="2" height="1"/><rect x="16" y="18" width="1" height="1"/><rect x="18" y="18" width="1" height="1"/><rect x="20" y="18" width="1" height="1"/><rect x="24" y="18" width="1" height="1"/><rect x="0" y="19" width="1" height="1"/><rect x="6" y="19" width="1" height="1"/><rect x="9" y="19" width="1" height="1"/><rect x="11" y="19" width="1" height="1"/><rect x="14" y="19" width="3" height="1"/><rect x="20" y="19" width="1" height="1"/><rect x="24" y="19" width="1" height="1"/><rect x="0" y="20" width="1" height="1"/><rect x="2" y="20" width="3" height="1"/><rect x="6" y="20" width="1" height="1"/><rect x="9" y="20" width="2" height="1"/><rect x="12" y="20" width="2" height="1"/><rect x="15" y="20" width="6" height="1"/><rect x="23" y="20" width="2" height="1"/><rect x="0" y="21" width="1" height="1"/><rect x="2" y="21" width="3" height="1"/><rect x="6" y="21" width="1" height="1"/><rect x="10" y="21" width="1" height="1"/><rect x="13" y="21" width="1" height="1"/><rect x="15" y="21" width="3" height="1"/><rect x="20" y="21" width="1" height="1"/><rect x="22" y="21" width="2" height="1"/><rect x="0" y="22" width="1" height="1"/><rect x="2" y="22" width="3" height="1"/><rect x="6" y="22" width="1" height="1"/><rect x="8" y="22" width="2" height="1"/><rect x="11" y="22" width="1" height="1"/><rect x="15" y="22" width="2" height="1"/><rect x="19" y="22" width="3" height="1"/><rect x="23" y="22" width="2" height="1"/><rect x="0" y="23" width="1" height="1"/><rect x="6" y="23" width="1" height="1"/><rect x="8" y="23" width="1" height="1"/><rect x="10" y="23" width="2" height="1"/><rect x="13" y="23" width="5" height="1"/><rect x="19" y="23" width="2" height="1"/><rect x="0" y="24" width="7" height="1"/><rect x="9" y="24" width="1" height="1"/><rect x="13" y="24" width="1" height="1"/><rect x="16" y="24" width="1" height="1"/><rect x="18" y="24" width="1" height="1"/><rect x="21" y="24" width="1" height="1"/><rect x="24" y="24" width="1" height="1"/>`;

const QR_CARD_SVG =
  '<svg class="qr" viewBox="-2 -2 29 29" shape-rendering="crispEdges" aria-hidden="true">' +
  '<rect x="-2" y="-2" width="29" height="29" fill="#fff"/><g fill="#06102E">' +
  QR_CARD_RECTS + "</g></svg>";

function qrReviewSvg(cls) {
  return (
    '<svg class="' + cls + '" viewBox="0 0 25 25" shape-rendering="crispEdges" aria-hidden="true">' +
    '<rect width="25" height="25" fill="#fff"/><g fill="#1F2328">' +
    QR_REVIEW_RECTS + "</g></svg>"
  );
}

const NFC_SVG = `<svg class="nfc" viewBox="-3 1 52 38" aria-hidden="true">
                    <rect x="16" y="4" width="14" height="32" rx="3"/>
                    <path d="M10 12a12 12 0 0 0 0 16"/><path d="M4 7a20 20 0 0 0 0 26"/>
                    <path d="M36 12a12 12 0 0 1 0 16"/><path d="M42 7a20 20 0 0 1 0 26"/>
                  </svg>`;

const TAP_ICON_PATHS = `<rect x="17" y="5" width="13" height="30" rx="3"/>
                    <path d="M11 13a11 11 0 0 0 0 14"/><path d="M5 8a19 19 0 0 0 0 24"/>
                    <path d="M33 13a11 11 0 0 1 0 14"/><path d="M39 8a19 19 0 0 1 0 24"/>`;

const CIRCUIT_BASE = `<path d="M0 26h52l16 16h58"/><path d="M0 58h30l18-18h52"/>
                <path d="M0 104h46l20 20h54"/><path d="M0 146h26l20-20h64"/>
                <path d="M0 182h58l18 18h46"/>
                <path d="M340 20h-46l-18 18h-58"/><path d="M340 56h-28l-22 22h-50"/>
                <path d="M340 96h-52l-16-16h-46"/><path d="M340 134h-34l-20 20h-58"/>
                <path d="M340 176h-48l-16-16h-40"/>
                <path d="M84 0v18l14 14v30"/><path d="M148 0v26l-16 16v24"/>
                <path d="M226 0v16l18 18v26"/><path d="M286 0v30l-14 14"/>`;

const STAR_PATH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z"/></svg>';

function rootPage(request) {
  const en = visitorLang(request) === "en";

  const L = en
    ? {
        h1: "The card people <em>don't throw away.</em>",
        lead:
          "A customer holds up a phone — and your menu, review form or contacts open in a second.",
        call: "Call",
        write: "Message on ",
        menu: "MENU",
        menuSub: "Scan or tap<br>your phone",
        captC: "Table sticker: one code on the table. Change a dish or a price and I switch the address — nothing gets reprinted.",
        stQ: "Liked it?<br>Tell us about it!",
        stCta: "Leave your review on Google",
        stScan: "Scan the<br>QR code",
        captA: "NFC business card: your contacts are saved to the phone in one tap, with no app and no typing.",
        captA2: "The back sells for you: what you make, a QR to your page and your phone number. The card works in both directions.",
        captB: "Review sticker: goes by the till, on a table or the door — a guest scans the QR code and lands straight in the review form.",
        frontT: "Smart<br>business card",
        frontSub: "tap your phone or scan the code",
        tap: "Want one<br>like this?",
        i1: "NFC business cards",
        i4: "Paper cards with a QR",
        i2: "Google review stickers",
        i3: "QR menus for cafes",
        nav: ["What I make", "Prices", "How it works", "Contact"],
        status: "codes online",
        start: "Get in touch",
        heroTag: "NFC · QR · Uzhhorod",
        micro: "no apps / no reprints / Uzhhorod and remote across Ukraine",
        sample: "sample",
        live: "live",
        destT: "Where the code leads",
        dests: ["Menu", "Google reviews", "Contacts", "Instagram", "Telegram", "Website", "any link"],
        whatTag: "what I make",
        whatH: "Things that <em>work</em> for you.",
        whatP: "One tap of a phone and the person is exactly where you send them. The address can be changed any time, with no reprint.",
        demo: "sample dashboard",
        demoDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        priceTag: "prices",
        priceH: "Clear prices, <em>no surprises.</em>",
        priceP: "A template design is included. A larger run brings the price per item down.",
        calcQ: "How many NFC business cards?",
        calcEach: "per card",
        calcTotal: "total",
        pcs: "pcs",
        priceOnce: "One-off",
        priceSub: "Maintenance subscription",
        subTag: "subscription",
        subH: "Codes that <em>keep working.</em>",
        subP: "I switch the address whenever you ask, keep the codes running and open your analytics page. Paying for a year up front is 10% cheaper.",
        subMonth: "Monthly",
        subYear: "Yearly · −10%",
        perMo: "UAH/mo",
        perYr: "UAH/yr",
        fromW: "from",
        yrTotal: "per year",
        eqMo: "≈ {x} UAH/mo",
        save: "you save {x} UAH",
        dragHint: "drag the divider",
        priceNote: "A template design is included in the price. A custom one costs 1 200 UAH once and is then reused on all your materials. A larger run brings the price per item down. Not ready for a subscription? Take the one-off option — the address change is then billed separately.",
        tiers: [[1, "1 000", "1 000 UAH"], [5, "900", "4 500 UAH"], [10, "800", "8 000 UAH"]],
        cur: "UAH",
        prices: [
          ["NFC business card", "template design included", "1 000 UAH"],
          ["NFC business cards, from 5", "900 UAH each · 5 pcs — 4 500", "900 UAH/pc"],
          ["NFC business cards, from 10", "800 UAH each · 10 pcs — 8 000", "800 UAH/pc"],
          ["Paper cards with a QR code", "100 pcs — 900 · 250 — 1 600 · 500 — 2 600 · 1 000 — 3 500", "from 900 UAH"],
          ["Custom design", "from scratch, when the templates do not fit", "1 200 UAH"],
          ["Your ready logo or layout", "placed on a sticker or business card", "500 UAH"],
          ["NFC Google review sticker", "NFC + QR · 10 × 10 cm · set of 3 — 2 700", "1 000 UAH"],
          ["QR-only review sticker", "no NFC · 10 × 10 cm · set of 3 — 1 500", "800 UAH"],
          ["Table sticker with a QR menu", "10 tables — 900", "120 UAH"],
          ["QR menu setup", "collecting the menu, layout, testing", "1 600 UAH"],
          ["Address change without a subscription", "one operation", "300 UAH"]
        ],
        subs: [
          ["Package S", "up to 3 codes", 500, false],
          ["Package M", "up to 10 codes", 800, false],
          ["Package L", "10+ codes · several locations", 1300, true]
        ],
        here: "Uzhhorod and remotely across Ukraine",
        specs: [
          ["NFC business card", "Your contacts are saved to the phone in one tap. Nobody has to copy your number or look you up later.", "card, keyring, sticker"],
          ["Review sticker", "Goes by the till, on a table or the door and reads at a glance. A guest holds up a phone and lands straight in the review form, with no searching for the place. More fresh reviews and a higher rating make the place easier to find on Google Maps and in nearby search.", "10 × 10 cm sticker · NFC + QR or QR only"],
          ["QR menu", "One code on the table. Changed a dish or a price — I switch the address, nothing gets reprinted.", "sticker, table tent, card"],
          ["Scan analytics", "A private page showing how many people scanned the code today and in total. Opens by link, no password.", "part of the subscription"]
        ],
        howTag: "how it works",
        howH: "Three steps, <em>then it just works.</em>",
        steps: [
          ["We agree", "You tell me where the code should lead: menu, site, reviews, contacts."],
          ["I make it", "Design for your place, printing and writing the tag. Handed over ready to use."],
          ["I keep it running", "Monthly subscription: I switch the address whenever you ask, keep the codes working and open your analytics page."]
        ],
        endTag: "what next",
        endH: "Tell me <em>where</em> the code should lead.",
        endP: "I will suggest a format, make the design and write the tag. You get the finished items with a working code.",
        endBrand: "NFC and QR for businesses that want to be found.",
        stay: "stay in touch",
        foot: ["no reprints when the address changes", "no apps needed"]
      }
    : {
        h1: "Картка, яку <em>не викидають.</em>",
        lead:
          "Клієнт підносить телефон — і за секунду відкрите ваше меню, форма відгуку або контакти.",
        call: "Зателефонувати",
        write: "Написати в ",
        menu: "МЕНЮ",
        menuSub: "Скануйте або<br>прикладіть телефон",
        captC: "Настільна наклейка: один код на столі. Змінили страву чи ціну — я переключаю адресу, друкувати заново не треба.",
        stQ: "Сподобалось?<br>Розкажіть нам<br>про це!",
        stCta: "Залиште свій відгук у Google",
        stScan: "Відскануйте<br>QR-код",
        captA: "NFC-візитка: контакти зберігаються в телефон одним дотиком, без застосунків і без набирання номера.",
        captA2: "Зворот продає за вас: що ви робите, QR на вашу сторінку і номер телефону. Картка працює в обидва боки.",
        captB: "Наліпка для відгуків: біля каси, на столику чи дверях — гість сканує QR-код і одразу потрапляє у форму відгуку.",
        frontT: "Розумна<br>візитка",
        frontSub: "приклади телефон або відскануй код",
        tap: "Хочеш таку ж?",
        i1: "NFC-візитки",
        i4: "Паперові візитки з QR",
        i2: "Наліпки для Google-відгуків",
        i3: "QR-меню для кафе",
        nav: ["Що роблю", "Ціни", "Як це працює", "Контакти"],
        status: "коди працюють",
        start: "Зв'язатися",
        heroTag: "NFC · QR · Ужгород",
        micro: "без застосунків / без передруку / Ужгород і дистанційно по Україні",
        sample: "зразок",
        live: "наживо",
        destT: "Куди веде код",
        dests: ["Меню", "Google-відгуки", "Контакти", "Instagram", "Telegram", "Сайт", "будь-яке посилання"],
        whatTag: "що роблю",
        whatH: "Носії, які <em>працюють</em> за вас.",
        whatP: "Один дотик телефону — і людина вже там, куди ви її ведете. Адресу можна змінити будь-коли, без передруку.",
        demo: "приклад кабінету",
        demoDays: ["пн", "вт", "ср", "чт", "пт", "сб", "нд"],
        priceTag: "ціни",
        priceH: "Прозорі ціни, <em>без сюрпризів.</em>",
        priceP: "Шаблонний дизайн входить у вартість. Більший тираж — нижча ціна за штуку.",
        calcQ: "Скільки NFC-візиток потрібно?",
        calcEach: "за штуку",
        calcTotal: "разом",
        pcs: "шт",
        priceOnce: "Разово",
        priceSub: "Підписка на обслуговування",
        subTag: "підписка",
        subH: "Коди, які <em>не зупиняються.</em>",
        subP: "Змінюю адресу за вашим запитом, стежу, щоб коди працювали, відкриваю кабінет зі статистикою. Оплата за рік наперед — на 10% дешевше.",
        subMonth: "Щомісяця",
        subYear: "За рік наперед · −10%",
        perMo: "грн/міс",
        perYr: "грн/рік",
        fromW: "від",
        yrTotal: "за рік",
        eqMo: "≈ {x} грн/міс",
        save: "економія {x} грн",
        dragHint: "потягніть розділювач",
        priceNote: "Шаблонний дизайн входить у вартість. Індивідуальний — 1 200 грн, один раз і далі на всі ваші носії. Більший тираж — нижча ціна за штуку. Не готові до підписки — беріть разовий варіант, тоді зміна адреси оплачується окремо.",
        tiers: [[1, "1 000", "1 000 грн"], [5, "900", "4 500 грн"], [10, "800", "8 000 грн"]],
        cur: "грн",
        prices: [
          ["NFC-візитка", "шаблонний дизайн входить", "1 000 грн"],
          ["NFC-візитки, від 5 шт", "900 грн за штуку · 5 шт — 4 500", "900 грн/шт"],
          ["NFC-візитки, від 10 шт", "800 грн за штуку · 10 шт — 8 000", "800 грн/шт"],
          ["Паперові візитки з QR", "100 шт — 900 · 250 — 1 600 · 500 — 2 600 · 1 000 — 3 500", "від 900 грн"],
          ["Індивідуальний дизайн", "дизайн з нуля, якщо не підходять шаблони", "1 200 грн"],
          ["Ваш готовий логотип або макет", "розміщуємо на наліпці чи візитці", "500 грн"],
          ["NFC-наліпка для Google-відгуків", "NFC + QR · 10 × 10 см · комплект із 3 шт — 2 700", "1 000 грн"],
          ["Наліпка для відгуків лише з QR", "без NFC · 10 × 10 см · комплект із 3 шт — 1 500", "800 грн"],
          ["Настільна наклейка з QR-меню", "10 столів — 900", "120 грн"],
          ["Налаштування QR-меню", "збір меню, верстка, перевірка", "1 600 грн"],
          ["Зміна адреси без підписки", "разова операція", "300 грн"]
        ],
        subs: [
          ["Пакет S", "до 3 кодів", 500, false],
          ["Пакет M", "до 10 кодів", 800, false],
          ["Пакет L", "від 10 кодів · кілька локацій", 1300, true]
        ],
        here: "Ужгород і дистанційно по Україні",
        specs: [
          ["NFC-візитка", "Ваші контакти зберігаються в телефон одним дотиком. Людина не переписує номер і не шукає вас потім у пошуку.", "картка, брелок, наліпка"],
          ["Наліпка для відгуків", "Клеїться біля каси, на столик чи двері — зрозуміла з першого погляду. Гість підносить телефон — і одразу потрапляє у форму відгуку, без пошуку вашого закладу. Більше свіжих відгуків і вища оцінка — заклад помітніший у Google Картах і в пошуку поруч.", "наліпка 10 × 10 см · NFC + QR або лише QR"],
          ["QR-меню", "Один код на столі. Змінили страву чи ціну — я переключаю адресу, друкувати заново не треба.", "наліпка, тейбл-тент, картка"],
          ["Статистика сканувань", "Особистий кабінет, де видно, скільки людей відсканувало код за добу і за весь час. Доступ за посиланням, без паролів.", "входить в обслуговування"]
        ],
        howTag: "як це працює",
        howH: "Три кроки — <em>і все працює.</em>",
        steps: [
          ["Домовляємось", "Ви кажете, куди має вести код: меню, сайт, відгуки, контакти."],
          ["Роблю носії", "Дизайн під ваш заклад, друк і запис мітки. Віддаю готове до роботи."],
          ["Обслуговую", "Щомісячна підписка: змінюю адресу за вашим запитом, стежу, щоб коди працювали, відкриваю кабінет зі статистикою."]
        ],
        endTag: "що далі",
        endH: "Напишіть, <em>куди</em> має вести код.",
        endP: "Підкажу формат, зроблю дизайн і запишу мітку. Ви отримуєте готові носії з робочим кодом.",
        endBrand: "NFC і QR для бізнесу, який хочуть знаходити.",
        stay: "на зв'язку",
        foot: ["зміна адреси без передруку", "без застосунків"]
      };

  const esc = v =>
    String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  const prettyPhone = p =>
    /^\+380\d{9}$/.test(p)
      ? p.slice(0, 4) + " " + p.slice(4, 6) + " " + p.slice(6, 9) + " " + p.slice(9, 11) + " " + p.slice(11)
      : p;

  // ── кнопки ──
  const msg = [];
  if (SITE.telegram) msg.push([SITE.telegram, "Telegram"]);
  if (SITE.viber) msg.push([SITE.viber, "Viber"]);
  if (SITE.instagram) msg.push([SITE.instagram, "Instagram"]);

  let cta = "";
  if (SITE.phone)
    cta += '<a class="btn main" href="tel:' + esc(SITE.phone) + '">' + L.call + "</a>";
  if (msg.length)
    cta +=
      '<a class="btn ' + (SITE.phone ? "alt" : "main") + '" href="' + esc(msg[0][0]) +
      '" rel="noopener">' + L.write + msg[0][1] + "</a>";

  const firstHref = SITE.phone ? "tel:" + SITE.phone : msg.length ? msg[0][0] : "#contact";

  const socials = msg
    .map(m => '<a href="' + esc(m[0]) + '" rel="noopener">' + m[1].slice(0, 2).toLowerCase() + "</a>")
    .join("");

  const SPEC_ICONS = [
    '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
    '<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9z"/>',
    '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/>',
    '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
  ];
  const DEMO = [38, 52, 44, 61, 70, 88, 57];
  const demo =
    '<div class="demo"><div class="mono dl">' + L.demo + '</div><div class="bars">' +
    DEMO.map((h, i) =>
      '<div class="bar' + (i === 5 ? " hi" : "") + '"><i style="--h:' + h + '%"></i><span>' + L.demoDays[i] + "</span></div>"
    ).join("") + "</div></div>";

  const specs = L.specs
    .map((x, i) =>
      '<article class="spec glass rv' + (i === 1 ? " wide" : "") + '" style="--d:' + i * 70 + 'ms">' +
      '<div class="sico"><svg viewBox="0 0 24 24">' + SPEC_ICONS[i] + "</svg></div>" +
      "<h3>" + x[0] + "</h3><p>" + x[1] + '</p><div class="mono meta">' + x[2] + "</div>" +
      (i === 3 ? demo : "") + "</article>"
    )
    .join("");

  const row = x =>
    '<div class="price"><b>' + x[0] + "<i>" + x[1] + "</i></b><span>" + x[2] + "</span></div>";

  const tiersBtns = L.tiers
    .map((t, i) => '<button type="button" data-i="' + i + '"' + (i === 0 ? ' class="on"' : "") + ">" + t[0] + " " + L.pcs + "</button>")
    .join("");

  // 1300 → «1 300» (нерозривний пробіл між тисячами)
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  const subCard = (x, year) => {
    const from = x[3] ? L.fromW + " " : "";
    const m = x[2], y = m * 12 * 0.9;
    return '<div class="pc' + (year ? " yr" : "") + '"><div class="mono">' + x[0] + "</div>" +
      (year
        ? "<b>" + from + fmt(y) + "<small>" + L.perYr + "</small></b>" +
          '<div class="mono eq">' + L.eqMo.replace("{x}", fmt(m * 0.9)) + ' · <span class="sv">' + L.save.replace("{x}", fmt(m * 12 - y)) + "</span></div>"
        : "<b>" + from + fmt(m) + "<small>" + L.perMo + "</small></b>" +
          '<div class="mono eq">' + fmt(m * 12) + " " + L.perYr + "</div>") +
      "<p>" + x[1] + "</p></div>";
  };
  const subsM = L.subs.map(x => subCard(x, false)).join("");
  const subsY = L.subs.map(x => subCard(x, true)).join("");

  const steps = L.steps
    .map((x, i) =>
      '<div class="step glass rv" style="--d:' + i * 110 + 'ms"><div class="mono num">0' + (i + 1) +
      "</div><b>" + x[0] + "</b><span>" + x[1] + "</span></div>"
    )
    .join("");

  const dests = L.dests
    .map((d, i) => '<div class="dest rv" style="--d:' + i * 50 + 'ms"><i>' + esc(d.slice(0, 2).toUpperCase()) + "</i><span>" + esc(d) + "</span></div>")
    .join("");

  return `<!doctype html>
<html lang="${en ? "en" : "uk"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#05061A">
<title>${esc(SITE.brand)} — ${esc(en ? SITE.tagline.en : SITE.tagline.uk)}</title>
<meta name="description" content="${esc(en ? SITE.tagline.en : SITE.tagline.uk)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Manrope:wght@400;500;600;700&family=Playfair+Display:ital,wght@1,500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --paper:#05061A; --ink:#EDF3FF; --muted:#7D89A8; --dim:#AFBCDC;
    --rule:rgba(160,180,255,.10); --glass:rgba(11,14,40,.82);
    --spot:#8A3CFF; --signal:#22E8F0; --star:#F5A524;
    --display:"Unbounded","Segoe UI",system-ui,sans-serif;
    --text:"Manrope","Segoe UI",system-ui,sans-serif;
    --serif:"Playfair Display",Georgia,serif;
    --mono:"JetBrains Mono",ui-monospace,Menlo,monospace;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:80px}
  body{margin:0;color:var(--ink);font:400 16.5px/1.6 var(--text);background:var(--paper);overflow-x:hidden}
  a{color:inherit}
  em{font-family:var(--serif);font-style:italic;font-weight:500;letter-spacing:-.01em}
  .mono{font-family:var(--mono);font-size:12px;letter-spacing:.02em;color:var(--muted)}

  /* ── неонові потоки на фоні ── */
  #flow{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;transform:translateZ(0)}
  .veil{position:fixed;inset:0;z-index:0;pointer-events:none;
        background:radial-gradient(70% 60% at 50% 0%,rgba(5,6,26,0) 0%,rgba(5,6,26,.55) 100%),
                   radial-gradient(40% 30% at 15% 10%,rgba(138,60,255,.18),transparent 70%),
                   radial-gradient(40% 30% at 90% 20%,rgba(34,232,240,.12),transparent 70%)}
  main,header,footer{position:relative;z-index:1}

  .sheet{max-width:1180px;margin:0 auto;padding:0 28px}
  .glass{background:var(--glass);border:1px solid var(--rule);border-radius:18px;
         box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 30px 60px -30px rgba(0,0,0,.6)}

  /* ── навігація ── */
  .nav{position:sticky;top:0;z-index:20;background:rgba(5,6,26,.92);border-bottom:1px solid var(--rule)}
  .nav .sheet{display:flex;align-items:center;gap:30px;height:64px}
  .mark{display:flex;align-items:center;gap:10px;text-decoration:none;font:700 17px var(--text);letter-spacing:-.02em}
  .logo{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;
        background:linear-gradient(135deg,var(--spot),var(--signal));box-shadow:0 0 18px rgba(34,232,240,.35)}
  .logo svg{width:15px;fill:none;stroke:#05061A;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
  .links{display:flex;gap:26px;font-size:14px;color:var(--muted)}
  .links a{text-decoration:none;transition:color .2s}
  .links a:hover{color:var(--ink)}
  .nav .right{margin-left:auto;display:flex;align-items:center;gap:12px}
  .pill{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:999px;
        padding:6px 12px;background:rgba(10,14,40,.6)}
  .dot{width:7px;height:7px;border-radius:50%;background:var(--signal);box-shadow:0 0 10px var(--signal);
       animation:pulse 2.4s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  .btn{display:inline-flex;align-items:center;gap:8px;text-decoration:none;font:700 15px var(--text);
       padding:13px 24px;border-radius:999px;transition:transform .2s,box-shadow .2s,background .2s;white-space:nowrap}
  .btn.main{background:var(--signal);color:#05061A;box-shadow:0 0 0 1px rgba(34,232,240,.5),0 0 28px rgba(34,232,240,.35)}
  .btn.main:hover{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(34,232,240,.7),0 0 40px rgba(34,232,240,.55)}
  .btn.alt{border:1px solid rgba(160,180,255,.22);background:rgba(10,14,40,.55);color:var(--ink)}
  .btn.alt:hover{border-color:rgba(34,232,240,.6);background:rgba(34,232,240,.08)}
  .btn.sm{padding:8px 16px;font-size:13.5px}
  .btn:focus-visible,.links a:focus-visible{outline:2px solid var(--signal);outline-offset:3px}

  /* ── перший екран ── */
  .hero{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;padding:72px 0 40px}
  .intro{position:sticky;top:24vh}
  .tag{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:8px;
       padding:5px 11px;background:rgba(10,14,40,.6);margin-bottom:26px}
  h1{font:600 clamp(40px,5.6vw,68px)/1.02 var(--text);letter-spacing:-.045em;margin:0 0 24px}
  h1 em{display:block;font-size:1.04em;background:linear-gradient(95deg,#fff 10%,#BFA2FF 55%,var(--signal));
        -webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.1em}
  .lead{font-size:18px;color:var(--dim);max-width:38ch;margin:0 0 32px}
  .cta{display:flex;gap:12px;flex-wrap:wrap}
  .micro{margin-top:22px}

  /* ── доріжка прокручування: зразок «прилипає», поки триває переворот ── */
  .track{height:330vh}
  .pin{position:sticky;top:12vh;padding:16px}
  .phead{display:flex;justify-content:space-between;align-items:center;padding:4px 6px 14px;border-bottom:1px solid var(--rule);margin-bottom:18px}
  .phead .run{color:var(--signal)}
  .stage{position:relative;aspect-ratio:1/1;perspective:1400px}
  .stage::before{content:"";position:absolute;inset:8%;border-radius:50%;
                 background:radial-gradient(closest-side,rgba(138,60,255,.28),rgba(34,232,240,.10) 60%,transparent)}
  .face{position:absolute;inset:0;display:grid;place-items:center;
        backface-visibility:hidden;transition:opacity .2s linear;will-change:transform,opacity}
  .f2,.f3,.f4{opacity:0}
  .pfoot{display:flex;justify-content:space-between;gap:16px;align-items:center;border-top:1px solid var(--rule);margin-top:18px;padding:14px 6px 4px}
  .prog{display:flex;gap:6px}
  .prog i{width:18px;height:3px;border-radius:2px;background:rgba(160,180,255,.18);transition:background .3s,width .3s}
  .prog i.on{background:var(--signal);width:30px;box-shadow:0 0 8px var(--signal)}

  /* неонова NFC-візитка */
  .bcard{position:relative;overflow:hidden;width:100%;aspect-ratio:17/11;border-radius:12px;
         container-type:inline-size;background:#080B26;color:#fff;
         border:1.5px solid rgba(64,236,255,.55);
         box-shadow:0 0 0 1px rgba(150,60,255,.35),0 0 26px rgba(80,210,255,.45),0 22px 46px -18px rgba(10,6,40,.85)}
  .glow{position:absolute;inset:0;
        background:radial-gradient(58% 80% at 4% -8%,rgba(150,34,232,.85) 0%,rgba(150,34,232,0) 62%),
                   radial-gradient(52% 74% at 104% 42%,rgba(0,208,255,.62) 0%,rgba(0,208,255,0) 66%),
                   radial-gradient(70% 90% at 50% 120%,rgba(92,26,190,.5) 0%,rgba(92,26,190,0) 70%)}
  .circuit{position:absolute;inset:0;width:100%;height:100%;opacity:.55}
  .circuit path{fill:none;stroke:#3FD8F0;stroke-width:1}
  .circuit circle{fill:#5FE6FF}
  .bcard .body{position:absolute;left:0;right:0;top:0;height:67%;
               padding:6.5cqw 6cqw 0;display:flex;justify-content:space-between;align-items:flex-start;gap:4cqw}
  .badge{display:inline-block;background:#22E8F0;color:#06102E;border-radius:999px;
         padding:1.1cqw 3.2cqw;font-family:var(--display);font-weight:800;
         font-size:2.4cqw;letter-spacing:.02em;margin-bottom:2.2cqw;box-shadow:0 0 14px rgba(34,232,240,.65)}
  .bcard .t{font-family:var(--display);font-weight:800;font-size:5.9cqw;line-height:1.05;
            letter-spacing:-.025em;text-transform:uppercase;
            text-shadow:0 0 22px rgba(120,235,255,.75),0 0 46px rgba(120,80,255,.5)}
  .fsub{margin-top:3.6cqw;font-size:3.4cqw;line-height:1.35;color:#BFE9FF;max-width:22ch}
  .bitems{margin-top:3.2cqw;display:flex;flex-direction:column;gap:1.9cqw}
  .bitems div{display:flex;align-items:center;gap:2.4cqw;font-size:3.05cqw;font-weight:500;color:#EAF6FF;line-height:1.2}
  .bitems svg{width:4.1cqw;flex-shrink:0;fill:none;stroke:#22E8F0;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .bcard .right{display:flex;flex-direction:column;align-items:center;gap:3.4cqw;flex-shrink:0}
  .nfc{width:15cqw;height:auto;filter:drop-shadow(0 0 8px rgba(130,235,255,.8))}
  .nfc path,.nfc rect{stroke:#fff;fill:none;stroke-width:2.4;stroke-linecap:round}
  .qr{width:19cqw;background:#fff;border-radius:2.4cqw;padding:1.6cqw;display:block;box-shadow:0 0 16px rgba(120,235,255,.5)}
  .strip{position:absolute;left:0;right:0;bottom:0;height:23%;background:#22E8F0;
         display:flex;align-items:center;padding-left:6cqw;color:#06102E;
         font-family:var(--display);font-weight:800;letter-spacing:-.01em;font-size:4.3cqw;
         box-shadow:0 -10px 26px rgba(34,232,240,.35)}

  /* наліпка для відгуків з QR */
  .swrap{height:92%;aspect-ratio:1/1.1;container-type:inline-size}
  .sticker{width:100%;height:100%;border-radius:6cqw;background:#fff;overflow:hidden;display:flex;flex-direction:column;
           box-shadow:0 22px 50px -16px rgba(0,0,0,.65),0 0 26px rgba(90,150,255,.18)}
  .stop{position:relative;background:#1E5BC6;display:flex;align-items:flex-start;gap:4.5cqw;padding:6cqw 5.5cqw 10cqw}
  .sg{flex:none;width:22cqw;height:22cqw;border-radius:50%;background:#fff;display:grid;place-items:center}
  .sg svg{width:62%}
  .stxt{color:#fff;font-family:var(--text)}
  .sq{font-weight:800;font-size:6.6cqw;line-height:1.08;letter-spacing:-.02em}
  .sq span{color:#FBBC05}
  .scta{font-weight:700;font-size:3.6cqw;margin-top:2.2cqw}
  .sstars{color:#FBBC05;font-size:6.4cqw;letter-spacing:1.2cqw;line-height:1;margin-top:1.8cqw}
  .swave{position:absolute;left:0;bottom:-1px;width:100%;height:9cqw;display:block}
  .sbot{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.6cqw;padding:1cqw 0 5cqw}
  .sscan{font-family:var(--text);font-weight:800;font-size:5.2cqw;line-height:1.1;text-align:center;color:#111}
  .sqr{position:relative;width:34cqw;height:34cqw;padding:3cqw}
  .sqr i{position:absolute;width:7cqw;height:7cqw;border:1.1cqw solid #111}
  .sqr i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0;border-top-left-radius:2.4cqw}
  .sqr i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0;border-top-right-radius:2.4cqw}
  .sqr i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0;border-bottom-left-radius:2.4cqw}
  .sqr i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0;border-bottom-right-radius:2.4cqw}
  .sqrimg{width:100%;height:100%;display:block}

  /* настільна наклейка з меню */
  .cwrap{height:92%;aspect-ratio:1;container-type:inline-size}
  .ccard{width:100%;height:100%;border-radius:6cqw;background:#F4F0E6;
         border:4.6cqw solid #1A4FB8;box-shadow:0 22px 50px -16px rgba(0,0,0,.65),0 0 30px rgba(90,150,255,.16);
         display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4cqw;padding:9cqw;text-align:center}
  .chead{font-family:var(--display);font-weight:800;font-size:13cqw;line-height:1;letter-spacing:-.03em;color:#1A4FB8}
  .ctap span{font-size:3.6cqw;font-weight:700;color:#1A4FB8;line-height:1.25;text-align:left}
  .cqr{width:33cqw;display:block;border-radius:1.4cqw;border:0}
  .ctap{display:flex;align-items:center;justify-content:center;gap:2.4cqw}
  .ctap svg{width:9cqw}
  .ctap svg path,.ctap svg rect{stroke:#1A4FB8;fill:none;stroke-width:2.4;stroke-linecap:round}

  .capt{margin:0;max-width:44ch;font-size:14px;line-height:1.55;color:var(--dim);min-height:4.6em}

  /* ── куди веде код ── */
  .dests{padding:30px 0 10px;border-top:1px solid var(--rule)}
  .dests .mono{margin-bottom:18px}
  .drow{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}
  .dest{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
  .dest i{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;font:500 13px var(--mono);font-style:normal;
          color:var(--dim);border:1px solid var(--rule);background:rgba(12,16,44,.7);transition:all .3s}
  .dest:hover i{color:#05061A;background:var(--signal);border-color:var(--signal);box-shadow:0 0 22px rgba(34,232,240,.5)}
  .dest span{font-size:12.5px;color:var(--muted)}

  /* ── секції ── */
  section.band{padding:110px 0 20px}
  .sh{display:grid;grid-template-columns:1.3fr 1fr;gap:40px;align-items:end;margin-bottom:44px}
  .sh .tag{margin-bottom:18px}
  h2{font:600 clamp(30px,4.2vw,50px)/1.06 var(--text);letter-spacing:-.04em;margin:0}
  h2 em{color:#CDB8FF}
  .sh p{margin:0;color:var(--muted);font-size:15px;max-width:42ch;justify-self:end}

  .specs{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .spec{padding:26px;position:relative;overflow:hidden;transition:border-color .3s,transform .3s}
  .spec:hover{border-color:rgba(34,232,240,.35);transform:translateY(-3px)}
  .spec::after{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s;
               background:radial-gradient(260px circle at var(--mx,50%) var(--my,0%),rgba(34,232,240,.12),transparent 60%)}
  .spec:hover::after{opacity:1}
  .spec.wide{grid-column:span 2}
  .spec:nth-child(4){grid-column:span 2;display:grid;grid-template-columns:1fr 1.15fr;column-gap:24px;align-content:start}
  .spec:nth-child(4)>*{grid-column:1}
  .spec:nth-child(4) .demo{grid-column:2;grid-row:1/5;align-self:center}
  .sico{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:18px;
        background:linear-gradient(135deg,rgba(138,60,255,.25),rgba(34,232,240,.18));border:1px solid rgba(160,180,255,.15)}
  .sico svg{width:22px;fill:none;stroke:var(--signal);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .spec h3{font:600 20px var(--text);letter-spacing:-.02em;margin:0 0 8px}
  .spec p{margin:0;color:var(--dim);font-size:15px}
  .spec .meta{margin-top:16px;color:var(--signal);opacity:.8}
  .demo{border:1px solid var(--rule);border-radius:14px;padding:16px 18px;background:rgba(5,6,26,.5)}
  .bars{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;height:120px;margin-top:12px}
  .bar{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}
  .bar i{display:block;width:100%;border-radius:5px 5px 2px 2px;height:0;transition:height 1s cubic-bezier(.2,.8,.2,1);
         background:linear-gradient(180deg,rgba(160,180,255,.35),rgba(160,180,255,.08))}
  .bar.hi i{background:linear-gradient(180deg,var(--signal),rgba(138,60,255,.5));box-shadow:0 0 18px rgba(34,232,240,.4)}
  .bar span{font:11px var(--mono);color:var(--muted)}
  .in .bar i{height:var(--h)}

  /* ціни */
  .calc{display:grid;grid-template-columns:1.4fr 1fr;gap:0;padding:0;overflow:hidden;margin-bottom:16px}
  .calc .q{padding:28px}
  .calc .q b{display:block;font:600 18px var(--text);margin:6px 0 20px}
  .seg{display:inline-flex;gap:4px;padding:4px;border-radius:999px;border:1px solid var(--rule);background:rgba(5,6,26,.6)}
  .seg button{font:600 14px var(--text);color:var(--dim);background:none;border:0;border-radius:999px;padding:10px 20px;cursor:pointer;transition:all .25s}
  .seg button.on{background:var(--signal);color:#05061A;box-shadow:0 0 18px rgba(34,232,240,.4)}
  .seg button:focus-visible{outline:2px solid var(--signal);outline-offset:2px}
  .calc .res{padding:28px;border-left:1px solid var(--rule);background:linear-gradient(160deg,rgba(138,60,255,.16),rgba(34,232,240,.06))}
  .big{font:600 48px/1 var(--text);letter-spacing:-.04em;margin:8px 0 4px}
  .big small{font-size:16px;color:var(--muted);letter-spacing:0;margin-left:6px}
  /* підписка: місяць | рік з розділювачем, який тягнуть */
  @property --p{syntax:"<percentage>";inherits:true;initial-value:50%}
  .subbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
  .cmp{--p:50%;position:relative;padding:0;overflow:hidden;user-select:none;-webkit-user-select:none;touch-action:pan-y;cursor:ew-resize}
  .cmp.anim{transition:--p .6s cubic-bezier(.2,.8,.2,1)}
  .layer{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:22px 42px}
  .lm{position:relative;background:#090C28;clip-path:inset(0 calc(100% - var(--p)) 0 0)}
  .ly{position:absolute;inset:0;clip-path:inset(0 0 0 var(--p));
      background:radial-gradient(70% 90% at 100% 0%,rgba(138,60,255,.30),transparent 70%),radial-gradient(60% 80% at 0% 100%,rgba(34,232,240,.14),transparent 70%),#0C0A2E}
  .lab{grid-column:1/-1;color:var(--dim)}
  .ly .lab{text-align:right;color:var(--signal)}
  .pc{border:1px solid var(--rule);border-radius:14px;padding:20px;background:rgba(255,255,255,.025)}
  .pc b{display:block;font:600 30px/1.1 var(--text);letter-spacing:-.03em;margin:12px 0 6px;white-space:nowrap}
  .pc b small{font:500 13px var(--mono);color:var(--muted);margin-left:6px;letter-spacing:0}
  .pc .eq{min-height:1.5em}
  .pc .sv{color:var(--signal)}
  .pc p{margin:12px 0 0;color:var(--dim);font-size:14.5px}
  .pc.yr{border-color:rgba(34,232,240,.28);background:rgba(34,232,240,.04)}
  .hd{position:absolute;top:0;bottom:0;left:clamp(20px,var(--p),calc(100% - 20px));width:2px;margin-left:-1px;background:var(--signal);
      box-shadow:0 0 14px rgba(34,232,240,.8);outline:none}
  .hd span{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34px;height:40px;border-radius:10px;
           background:#fff;color:#05061A;display:grid;place-items:center;font:700 14px var(--mono);letter-spacing:0;
           box-shadow:0 6px 18px rgba(0,0,0,.45);transition:transform .2s}
  .cmp:active .hd span,.hd:focus-visible span{transform:translate(-50%,-50%) scale(1.08)}
  .hd:focus-visible span{outline:2px solid var(--signal);outline-offset:3px}
  .plist{padding:8px 26px}
  .price{display:grid;grid-template-columns:1fr auto;gap:10px 22px;align-items:baseline;padding:14px 0;border-bottom:1px solid var(--rule)}
  .price:last-child{border-bottom:0}
  .price b{font-weight:500;font-size:16px}
  .price i{display:block;font-style:normal;color:var(--muted);font-size:13px;margin-top:2px}
  .price span{font:500 15px var(--mono);white-space:nowrap;color:var(--signal)}
  .subhead{margin:28px 0 14px}
  .pnote{margin-top:18px;color:var(--muted);font-size:14px;max-width:80ch}

  /* кроки */
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;position:relative}
  .step{padding:26px}
  .step .num{color:var(--signal);margin-bottom:28px;display:flex;align-items:center;gap:10px}
  .step .num::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(34,232,240,.6),transparent);
                    transform-origin:left;transform:scaleX(0);transition:transform 1.2s .3s cubic-bezier(.2,.8,.2,1)}
  .step.in .num::after{transform:scaleX(1)}
  .step b{display:block;font:600 19px var(--text);letter-spacing:-.02em;margin-bottom:6px}
  .step span{color:var(--dim);font-size:15px}

  /* фінал */
  .end{display:grid;grid-template-columns:1fr 1.5fr;gap:16px;padding:120px 0 40px}
  .ebrand{padding:28px;display:flex;flex-direction:column;justify-content:space-between;gap:30px;position:relative;overflow:hidden}
  .ebrand .chev{position:absolute;right:-10px;top:10px;width:150px;opacity:.12;fill:none;stroke:#fff;stroke-width:10}
  .ebrand p{margin:0;color:var(--dim);max-width:24ch}
  .soc{display:flex;justify-content:space-between;align-items:center}
  .soc div{display:flex;gap:6px}
  .soc a{width:30px;height:30px;border-radius:8px;border:1px solid var(--rule);display:grid;place-items:center;
         font:500 11px var(--mono);text-decoration:none;color:var(--dim);transition:all .2s}
  .soc a:hover{color:#05061A;background:var(--signal)}
  .eacc{border-radius:18px;padding:34px;color:#05061A;position:relative;overflow:hidden;
        background:linear-gradient(120deg,#22E8F0 0%,#7BF1F6 40%,#B99BFF 100%);
        box-shadow:0 0 60px -10px rgba(34,232,240,.45)}
  .eacc .mono{color:rgba(5,6,26,.6)}
  .eacc h2{margin:10px 0 12px}
  .eacc h2 em{color:#3B0E8C}
  .eacc p{margin:0 0 26px;max-width:46ch;color:rgba(5,6,26,.75)}
  .eacc .btn.main{background:#05061A;color:#fff;box-shadow:none}
  .eacc .btn.alt{background:rgba(255,255,255,.35);border-color:rgba(5,6,26,.15);color:#05061A}
  .phone{font:600 clamp(24px,3.4vw,34px) var(--text);letter-spacing:-.03em;text-decoration:none;display:inline-block;margin-bottom:18px;color:#05061A}

  footer{border-top:1px solid var(--rule);padding:22px 0 40px}
  .stat{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  .stat span{display:inline-flex;align-items:center;gap:8px}

  /* поява при прокручуванні */
  .rv{opacity:0;transform:translateY(22px);
      transition:opacity .8s cubic-bezier(.2,.8,.2,1) var(--d,0ms),transform .8s cubic-bezier(.2,.8,.2,1) var(--d,0ms)}
  .rv.in{opacity:1;transform:none}
  .spec.rv.in:hover{transform:translateY(-3px)}

  @media (max-width:980px){
    .links{display:none}
    .hero{grid-template-columns:1fr;gap:30px;padding:44px 0 20px}
    .intro{position:static}
    .track{height:320vh}
    .pin{top:76px}
    .drow{grid-template-columns:repeat(4,1fr);row-gap:20px}
    .sh{grid-template-columns:1fr;gap:16px}
    .sh p{justify-self:start}
    .specs,.layer,.steps{grid-template-columns:1fr}
    .spec.wide,.spec:nth-child(4){grid-column:auto;display:block}
    .spec:nth-child(4) .demo{margin-top:18px}
    .calc{grid-template-columns:1fr}
    .calc .res{border-left:0;border-top:1px solid var(--rule)}
    .end{grid-template-columns:1fr;padding-top:80px}
    section.band{padding-top:80px}
  }
  @media (max-width:560px){
    .sheet{padding:0 16px}
    .nav .pill{display:none}
    .seg button{padding:9px 14px}
  }

  /* без анімації: зразки просто один під одним */
  .flat .track{height:auto}
  .flat .pin{position:static}
  .flat .stage{aspect-ratio:auto;perspective:none;display:grid;gap:26px;justify-items:center}
  .flat .stage::before{display:none}
  .flat .face{position:static;opacity:1;transform:none}
  .flat .swrap{height:auto;width:min(70%,300px)}
  .flat .cwrap{height:auto;width:min(62%,250px)}
  .flat .rv{opacity:1;transform:none;transition:none}
  .flat .bar i{height:var(--h);transition:none}
  .flat .dot{animation:none}
</style>
</head>
<body>
<canvas id="flow" aria-hidden="true"></canvas>
<div class="veil"></div>

<header class="nav">
  <div class="sheet">
    <a class="mark" href="#top"><span class="logo"><svg viewBox="0 0 24 24"><path d="M6 7l5 5-5 5M13 7l5 5-5 5"/></svg></span>${esc(SITE.brand)}</a>
    <nav class="links">
      <a href="#what">${L.nav[0]}</a><a href="#price">${L.nav[1]}</a><a href="#how">${L.nav[2]}</a><a href="#contact">${L.nav[3]}</a>
    </nav>
    <div class="right">
      <span class="pill mono"><i class="dot"></i>${L.status}</span>
      <a class="btn main sm" href="${esc(firstHref)}" rel="noopener">${L.start}</a>
    </div>
  </div>
</header>

<main class="sheet" id="top">

  <section class="hero">
    <div class="intro">
      <div class="tag mono"><i class="dot"></i>${L.heroTag}</div>
      <h1>${L.h1}</h1>
      <p class="lead">${L.lead}</p>
      <div class="cta">${cta}</div>
      <div class="mono micro">${L.micro}</div>
    </div>

    <div class="track" id="track">
      <div class="pin glass" id="pin">
        <div class="phead mono"><span>${esc(SITE.brand)}.com / <span id="num">1</span> ${en ? "of" : "з"} 4 · ${L.sample}</span><span class="run">● ${L.live}</span></div>

        <div class="stage" id="stage">

          <div class="face f1" id="f1">
            <div class="bcard">
              <div class="glow"></div>
              <svg class="circuit" viewBox="0 0 340 220" preserveAspectRatio="none" aria-hidden="true">
                ${CIRCUIT_BASE}
                <circle cx="126" cy="42" r="2.6"/><circle cx="100" cy="62" r="2.6"/>
                <circle cx="244" cy="60" r="2.6"/><circle cx="272" cy="44" r="2.6"/>
                <circle cx="120" cy="124" r="2.6"/><circle cx="228" cy="154" r="2.6"/>
                <circle cx="290" cy="80" r="2.6"/><circle cx="46" cy="126" r="2.6"/>
              </svg>
              <div class="body">
                <div>
                  <span class="badge">NFC</span>
                  <div class="t">${L.frontT}</div>
                  <div class="fsub">${L.frontSub}</div>
                </div>
                <div class="right">
                  ${NFC_SVG}
                  ${QR_CARD_SVG}
                </div>
              </div>
              <div class="strip">${esc(SITE.brand)}.com</div>
            </div>
          </div>

          <div class="face f2" id="f2">
            <div class="bcard">
              <div class="glow"></div>
              <svg class="circuit" viewBox="0 0 340 220" preserveAspectRatio="none" aria-hidden="true">
                ${CIRCUIT_BASE}
                <path d="M110 220v-22l16-16"/><path d="M196 220v-18l-14-14"/>
                <path d="M258 220v-26l16-16"/>
                <circle cx="126" cy="42" r="2.6"/><circle cx="100" cy="62" r="2.6"/>
                <circle cx="132" cy="66" r="2.6"/><circle cx="244" cy="60" r="2.6"/>
                <circle cx="272" cy="44" r="2.6"/><circle cx="120" cy="124" r="2.6"/>
                <circle cx="110" cy="126" r="2.6"/><circle cx="228" cy="154" r="2.6"/>
                <circle cx="182" cy="188" r="2.6"/><circle cx="126" cy="182" r="2.6"/>
                <circle cx="290" cy="80" r="2.6"/><circle cx="46" cy="126" r="2.6"/>
              </svg>
              <div class="body">
                <div>
                  <span class="badge">NFC</span>
                  <div class="t">${L.tap}</div>
                  <div class="bitems">
                    <div><svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/></svg>${L.i1}</div>
                    <div><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M6 20h15"/><path d="M7 8h6M7 12h4"/></svg>${L.i4}</div>
                    <div><svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9z"/></svg>${L.i2}</div>
                    <div><svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z"/></svg>${L.i3}</div>
                  </div>
                </div>
                <div class="right">
                  ${NFC_SVG}
                  ${QR_CARD_SVG}
                </div>
              </div>
              <div class="strip">${SITE.phone ? esc(prettyPhone(SITE.phone)) : esc(SITE.brand) + ".com"} · ${en ? "UZHHOROD" : "УЖГОРОД"}</div>
            </div>
          </div>

          <div class="face f3" id="f3">
            <div class="swrap">
              <div class="sticker">
                <div class="stop">
                  <div class="sg"><svg viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></div>
                  <div class="stxt">
                    <div class="sq">${L.stQ} <span>★</span></div>
                    <div class="scta">${L.stCta}</div>
                    <div class="sstars">★★★★★</div>
                  </div>
                  <svg class="swave" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14V9C22 2 40 1 60 5s30 5 40 1v8z" fill="#fff"/></svg>
                </div>
                <div class="sbot">
                  <div class="sscan">${L.stScan}</div>
                  <div class="sqr"><i></i><i></i><i></i><i></i>${qrReviewSvg("sqrimg")}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="face f4" id="f4">
            <div class="cwrap">
              <div class="ccard">
                <div class="chead">${L.menu}</div>
                ${qrReviewSvg("cqr")}
                <div class="ctap">
                  <svg viewBox="-2 2 48 36" aria-hidden="true">
                    ${TAP_ICON_PATHS}
                  </svg>
                  <span>${L.menuSub}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="pfoot">
          <p class="capt" id="capt">${L.captA}</p>
          <div class="prog" id="prog"><i class="on"></i><i></i><i></i><i></i></div>
        </div>
      </div>
    </div>
  </section>

  <section class="dests">
    <div class="mono">${L.destT}</div>
    <div class="drow">${dests}</div>
  </section>

  <section class="band" id="what">
    <div class="sh rv">
      <div><div class="tag mono"><i class="dot"></i>${L.whatTag}</div><h2>${L.whatH}</h2></div>
      <p>${L.whatP}</p>
    </div>
    <div class="specs">${specs}</div>
  </section>

  <section class="band" id="price">
    <div class="sh rv">
      <div><div class="tag mono"><i class="dot"></i>${L.priceTag}</div><h2>${L.priceH}</h2></div>
      <p>${L.priceP}</p>
    </div>

    <div class="calc glass rv">
      <div class="q">
        <div class="mono">NFC</div>
        <b>${L.calcQ}</b>
        <div class="seg" id="seg" role="group">${tiersBtns}</div>
      </div>
      <div class="res">
        <div class="mono">${L.calcEach}</div>
        <div class="big"><span id="each">${L.tiers[0][1]}</span><small>${L.cur}</small></div>
        <div class="mono">${L.calcTotal}: <span id="total" style="color:var(--signal)">${L.tiers[0][2]}</span></div>
      </div>
    </div>

    <div class="mono subhead">${L.priceOnce}</div>
    <div class="plist glass rv">${L.prices.map(row).join("")}</div>
    <div class="pnote">${L.priceNote}</div>
  </section>

  <section class="band" id="subs">
    <div class="sh rv">
      <div><div class="tag mono"><i class="dot"></i>${L.subTag}</div><h2>${L.subH}</h2></div>
      <p>${L.subP}</p>
    </div>
    <div class="subbar rv">
      <div class="seg" id="subseg" role="group" aria-label="${esc(L.priceSub)}">
        <button type="button" data-p="100">${L.subMonth}</button><button type="button" data-p="0">${L.subYear}</button>
      </div>
      <span class="mono">← ${L.dragHint} →</span>
    </div>
    <div class="cmp glass rv" id="cmp">
      <div class="layer lm"><div class="lab mono">${L.subMonth}</div>${subsM}</div>
      <div class="layer ly" aria-hidden="true"><div class="lab mono">${L.subYear}</div>${subsY}</div>
      <div class="hd" id="hd" role="slider" tabindex="0" aria-label="${esc(L.subMonth + " / " + L.subYear)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><span>‹›</span></div>
    </div>
  </section>

  <section class="band" id="how">
    <div class="sh rv">
      <div><div class="tag mono"><i class="dot"></i>${L.howTag}</div><h2>${L.howH}</h2></div>
      <p>${L.here}</p>
    </div>
    <div class="steps">${steps}</div>
  </section>

  <section class="end" id="contact">
    <div class="ebrand glass rv">
      <svg class="chev" viewBox="0 0 100 100" aria-hidden="true"><path d="M20 15l35 35-35 35M50 15l35 35-35 35"/></svg>
      <div>
        <a class="mark" href="#top"><span class="logo"><svg viewBox="0 0 24 24"><path d="M6 7l5 5-5 5M13 7l5 5-5 5"/></svg></span>${esc(SITE.brand)}</a>
        <p style="margin-top:44px">${L.endBrand}</p>
      </div>
      <div class="soc"><span class="mono">${L.stay}</span><div>${socials}</div></div>
    </div>
    <div class="eacc rv" style="--d:120ms">
      <div class="mono">${L.endTag}</div>
      <h2>${L.endH}</h2>
      <p>${L.endP}</p>
      ${SITE.phone ? '<a class="phone" href="tel:' + esc(SITE.phone) + '">' + esc(prettyPhone(SITE.phone)) + "</a>" : ""}
      <div class="cta">${cta}</div>
    </div>
  </section>

</main>

<footer>
  <div class="sheet stat mono">
    <span><i class="dot"></i>${L.here}</span>
    <span><i class="dot"></i>${L.foot[0]}</span>
    <span><i class="dot"></i>${L.foot[1]}</span>
    <span>© ${esc(SITE.brand)}.com</span>
  </div>
</footer>

<script>
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── калькулятор тиражу ──
  var TIERS = ${JSON.stringify(L.tiers)};
  var seg = document.getElementById("seg");
  if (seg) seg.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var t = TIERS[+b.getAttribute("data-i")];
    [].forEach.call(seg.children, function (x) { x.className = x === b ? "on" : ""; });
    document.getElementById("each").textContent = t[1];
    document.getElementById("total").textContent = t[2];
  });

  // ── підписка: тягнемо розділювач місяць | рік ──
  var cmp = document.getElementById("cmp");
  var hd = document.getElementById("hd");
  var subseg = document.getElementById("subseg");
  if (cmp && hd) {
    var setP = function (v, anim) {
      v = Math.max(0, Math.min(100, v));
      if (anim && !reduce) cmp.classList.add("anim"); else cmp.classList.remove("anim");
      cmp.style.setProperty("--p", v + "%");
      hd.setAttribute("aria-valuenow", Math.round(v));
      if (subseg) [].forEach.call(subseg.children, function (b) {
        var bp = +b.getAttribute("data-p");
        b.className = (bp === 100 && v >= 99) || (bp === 0 && v <= 1) ? "on" : "";
      });
    };
    var fromX = function (x) { var r = cmp.getBoundingClientRect(); return (x - r.left) / r.width * 100; };
    var dragging = false;
    cmp.addEventListener("pointerdown", function (e) {
      dragging = true;
      try { cmp.setPointerCapture(e.pointerId); } catch (x) {}
      setP(fromX(e.clientX), true);
    });
    cmp.addEventListener("pointermove", function (e) { if (dragging) setP(fromX(e.clientX), false); });
    var stop = function () { dragging = false; };
    cmp.addEventListener("pointerup", stop);
    cmp.addEventListener("pointercancel", stop);
    hd.addEventListener("keydown", function (e) {
      var v = parseFloat(cmp.style.getPropertyValue("--p")) || 50;
      var k = e.key;
      if (k === "ArrowLeft" || k === "ArrowDown") v -= 5;
      else if (k === "ArrowRight" || k === "ArrowUp") v += 5;
      else if (k === "Home") v = 0;
      else if (k === "End") v = 100;
      else return;
      e.preventDefault();
      setP(v, true);
    });
    if (subseg) subseg.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) setP(+b.getAttribute("data-p"), true);
    });
    // на телефоні картки йдуть стовпчиком — стартуємо з місячних цін, розділювач біля правого краю
    setP(window.innerWidth <= 980 ? 100 : 50, false);
  }

  // ── підсвітка карток за курсором ──
  [].forEach.call(document.querySelectorAll(".spec"), function (el) {
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX - r.left) + "px");
      el.style.setProperty("--my", (e.clientY - r.top) + "px");
    });
  });

  // ── поява при прокручуванні ──
  var rv = document.querySelectorAll(".rv, .spec, .step");
  if (reduce || !("IntersectionObserver" in window)) {
    [].forEach.call(rv, function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -12% 0px" });
    [].forEach.call(rv, function (el) { io.observe(el); });
  }

  // ── неонові потоки (canvas) ──
  // малюємо в половинній роздільності й 30 кадрів/с: браузер сам розтягує, світіння виходить м'якшим, а навантаження в рази менше
  var cv = document.getElementById("flow");
  var ctx = cv && cv.getContext && cv.getContext("2d");
  if (ctx && !reduce) {
    var small = window.innerWidth < 760;
    var SCALE = small ? 0.4 : 0.5, STEP = 1000 / (small ? 24 : 30);
    var W, H, t0 = performance.now(), lastDraw = 0, scrollY = 0, raf = 0;
    var RIBBONS = [
      { y0: 1.08, y1: -0.05, bend: 0.55, spread: 0.10, lines: small ? 10 : 16, c1: [138, 60, 255], c2: [34, 232, 240], speed: 0.00011, a: 0.85 },
      { y0: 0.95, y1: 0.20, bend: -0.35, spread: 0.07, lines: small ? 7 : 10, c1: [34, 232, 240], c2: [160, 120, 255], speed: 0.00008, a: 0.5 },
      { y0: 0.30, y1: 1.10, bend: 0.25, spread: 0.12, lines: small ? 5 : 8, c1: [90, 70, 255], c2: [34, 232, 240], speed: 0.00006, a: 0.3 }
    ];
    var size = function () {
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.max(1, Math.round(W * SCALE)); cv.height = Math.max(1, Math.round(H * SCALE));
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      for (var r = 0; r < RIBBONS.length; r++) {
        var R = RIBBONS[r];
        var g = ctx.createLinearGradient(0, H, W, 0);
        g.addColorStop(0, "rgba(" + R.c1 + ",0)");
        g.addColorStop(0.35, "rgba(" + R.c1 + "," + R.a + ")");
        g.addColorStop(0.7, "rgba(" + R.c2 + "," + R.a + ")");
        g.addColorStop(1, "rgba(" + R.c2 + ",0)");
        R.grad = g;
      }
      lastDraw = 0;
    };
    var draw = function (now) {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < STEP) return;
      lastDraw = now;
      var t = now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      var par = scrollY * 0.00025;
      for (var r = 0; r < RIBBONS.length; r++) {
        var R = RIBBONS[r];
        ctx.strokeStyle = R.grad;
        var mid = (R.lines - 1) / 2;
        for (var i = 0; i < R.lines; i++) {
          var k = i / (R.lines - 1) - 0.5;
          var ph = t * R.speed * 6.283 + i * 0.22 + r;
          var off = k * R.spread * H * (1 + 0.35 * Math.sin(ph));
          var y0 = (R.y0 + par) * H + off, y3 = (R.y1 + par) * H - off * 1.6;
          var cx1 = W * (0.35 + 0.05 * Math.sin(ph * 0.7)), cy1 = H * (R.y0 - R.bend + 0.06 * Math.cos(ph)) + off * 2.2;
          var cx2 = W * (0.62 + 0.05 * Math.cos(ph * 0.5)), cy2 = H * (R.y1 + R.bend * 0.6 + 0.05 * Math.sin(ph)) - off;
          ctx.beginPath();
          ctx.moveTo(-0.05 * W, y0);
          ctx.bezierCurveTo(cx1, cy1, cx2, cy2, 1.05 * W, y3);
          if (Math.abs(i - mid) < 1) {
            // ореол лише навколо центральних ліній
            ctx.globalAlpha = 0.25; ctx.lineWidth = 16; ctx.stroke();
            ctx.globalAlpha = 1; ctx.lineWidth = 2.2;
          } else {
            ctx.lineWidth = 1.1;
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
    size();
    var rz = 0;
    window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(size, 150); });
    window.addEventListener("scroll", function () { scrollY = window.scrollY; }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    });
    raf = requestAnimationFrame(draw);
  }

  // ── переворот зразків під час прокручування ──
  var track = document.getElementById("track");
  var pin = document.getElementById("pin");
  var FACES = ["f1", "f2", "f3", "f4"].map(function (id) { return document.getElementById(id); });
  var capt = document.getElementById("capt");
  var num = document.getElementById("num");
  var prog = document.getElementById("prog");
  if (!track || !pin || FACES.indexOf(null) >= 0) return;

  var CAPS = [${JSON.stringify(L.captA)}, ${JSON.stringify(L.captA2)}, ${JSON.stringify(L.captB)}, ${JSON.stringify(L.captC)}];

  if (reduce) {
    document.body.className = "flat";
    if (capt) capt.textContent = CAPS.join(" ");
    return;
  }

  var ticking = false, last = -1, shown = 0;

  function frame() {
    ticking = false;
    var r = track.getBoundingClientRect();
    var stickTop = parseFloat(getComputedStyle(pin).top) || 0;
    var span = r.height - pin.offsetHeight;
    var p = span > 20 ? (stickTop - r.top) / span : 0;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    if (Math.abs(p - last) < 0.004) return;
    last = p;

    var n = FACES.length;
    var pad = 0.1;
    var u = (p - pad) / (1 - pad * 2);
    if (u < 0) u = 0;
    if (u > 1) u = 1;

    var idx = u * (n - 1);
    var i = Math.min(Math.floor(idx), n - 2);
    var local = idx - i;

    // 30% спокою, 40% на переворот, 30% спокою
    var k = (local - 0.3) / 0.4;
    if (k < 0) k = 0;
    if (k > 1) k = 1;

    for (var j = 0; j < n; j++) {
      var el = FACES[j];
      if (j === i) {
        el.style.transform = "rotateY(" + (-k * 90) + "deg)";
        el.style.opacity = k < 0.5 ? 1 : 0;
      } else if (j === i + 1) {
        el.style.transform = "rotateY(" + ((1 - k) * 90) + "deg)";
        el.style.opacity = k < 0.5 ? 0 : 1;
      } else {
        el.style.opacity = 0;
      }
    }

    var stage = k < 0.5 ? i : i + 1;
    if (stage === shown && last > 0) return;
    shown = stage;
    if (capt) capt.textContent = CAPS[stage];
    if (num) num.textContent = stage + 1;
    if (prog) [].forEach.call(prog.children, function (x, m) { x.className = m === stage ? "on" : ""; });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  frame();
})();
</script>

</body>
</html>`;
}

function notFoundPage(request) {
  const en = visitorLang(request) === "en";
  return `<!doctype html><html lang="${en ? "en" : "uk"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${en ? "Not found" : "Не знайдено"}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;
color:#e5e9f0;font:15px/1.6 system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:44px;margin:0 0 8px;font-weight:600}p{margin:0;color:#8b93a1}</style></head>
<body><div><h1>404</h1><p>${
    en ? "This link does not exist" : "Такого посилання не існує"
  }</p></div></body></html>`;
}

function promoHtml(request, origin) {
  if (!SITE.promo) return "";
  const en = visitorLang(request) === "en";
  return (
    '<a class="promo" href="' + origin + '/">' +
    (en ? SITE.tagline.en : SITE.tagline.uk) +
    " — " + SITE.brand + "</a>"
  );
}

function soonPage(request, title, origin) {
  const en = visitorLang(request) === "en";
  const name = String(title || "").replace(/</g, "&lt;");
  return `<!doctype html><html lang="${en ? "en" : "uk"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${en ? "Coming soon" : "Незабаром"}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;
color:#e5e9f0;font:15px/1.6 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;
text-align:center;padding:24px}
.d{width:46px;height:46px;margin:0 auto 18px;border-radius:50%;
   background:#1d212a;border:1px solid #2a2f3a;display:grid;place-items:center;font-size:20px}
h1{font-size:19px;font-weight:600;margin:0 0 8px}
p{margin:0;color:#8b93a1;font-size:14px;max-width:320px}
.n{margin-top:14px;font-size:12.5px;color:#4d7cfe}
.promo{position:fixed;left:0;right:0;bottom:18px;display:block;text-align:center;
       font-size:12px;color:#5b6472;text-decoration:none}
.promo:hover{color:#8b93a1}</style></head>
<body><div>
<div class="d">⏳</div>
<h1>${en ? "Coming soon" : "Незабаром"}</h1>
<p>${
    en
      ? "This QR code works — the content will appear here shortly."
      : "Цей QR-код працює, вміст з’явиться тут найближчим часом."
  }</p>
${name ? '<div class="n">' + name + "</div>" : ""}
</div>
${promoHtml(request, origin || "")}
</body></html>`;
}

// ─────────────────── Фото страв (R2) ───────────────────

async function serveImage(env, key) {
  if (!env.IMG) return new Response("no image storage", { status: 404 });
  if (!/^[A-Za-z0-9._-]+$/.test(key)) return new Response("not found", { status: 404 });
  const obj = await env.IMG.get(key);
  if (!obj) return new Response("not found", { status: 404 });

  // віддаємо лише картинки; усе інше (напр. старі .bin) — 404
  const type = (obj.httpMetadata && obj.httpMetadata.contentType) || "";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return new Response("not found", { status: 404 });

  return new Response(obj.body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

// ─────────────────── Меню за QR ───────────────────

function parseMenu(text) {
  const sections = [];
  let cur = null;

  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.charAt(0) === "#") {
      cur = { name: line.slice(1).trim(), items: [] };
      sections.push(cur);
      continue;
    }

    if (!cur) {
      cur = { name: "", items: [] };
      sections.push(cur);
    }

    const parts = line.split("|").map(x => x.trim());
    const item = { name: parts[0] || "", price: parts[1] || "", note: "", weight: "", img: "" };
    const notes = [];

    for (const raw2 of parts.slice(2)) {
      if (!raw2) continue;
      if (/^(https?:\/\/|\/img\/)/i.test(raw2)) item.img = raw2;
      else if (/^\d+[\s]*(г|гр|мл|g|ml|шт)\.?$/i.test(raw2)) item.weight = raw2;
      else notes.push(raw2);
    }
    item.note = notes.join(" · ");
    cur.items.push(item);
  }
  return sections.filter(sec => sec.items.length || sec.name);
}

const MENU_THEMES = {
  cream:  { bg: "#FAF7F0", ink: "#1C1D21", mute: "#8A8372", line: "#EAE3D6",
            acc: "#A8763E", chip: "#F0EADC", chipH: "#E6DCC8", panel: "rgba(250,247,240,.93)" },
  light:  { bg: "#FFFFFF", ink: "#14171B", mute: "#6E7480", line: "#E8EAEE",
            acc: "#2F6BE0", chip: "#F1F3F7", chipH: "#E4E8EF", panel: "rgba(255,255,255,.93)" },
  dark:   { bg: "#11131A", ink: "#F0F3F8", mute: "#98A1B3", line: "#242833",
            acc: "#E0A44A", chip: "#1B1F29", chipH: "#242A36", panel: "rgba(17,19,26,.90)" },
  green:  { bg: "#0F211C", ink: "#EFF6F1", mute: "#9BB3A8", line: "#1D332C",
            acc: "#77C9A2", chip: "#172C25", chipH: "#1F3A31", panel: "rgba(15,33,28,.90)" },
  wine:   { bg: "#1B1013", ink: "#F6EDEE", mute: "#B69AA0", line: "#332024",
            acc: "#D98A8A", chip: "#271A1D", chipH: "#332226", panel: "rgba(27,16,19,.90)" },
};

function menuPage(menu, request) {
  const en = visitorLang(request) === "en";
  const esc = v =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const th = MENU_THEMES[menu.theme] || MENU_THEMES.cream;
  const hasEn = !!(menu.text_en && menu.text_en.trim());

  function block(text, prefix) {
    const parsed = parseMenu(text);
    const named = parsed.filter(sec => sec.name);
    const tabs = named.length > 1
      ? '<nav class="tabs">' +
        named.map((sec, i) => '<a href="#' + prefix + i + '">' + esc(sec.name) + "</a>").join("") +
        "</nav>"
      : "";
    let idx = -1;
    const body = parsed.map(sec => {
      if (sec.name) idx++;
      return (sec.name ? '<h2 id="' + prefix + idx + '">' + esc(sec.name) + "</h2>" : "") +
        "<ul>" +
        sec.items.map(it =>
          (it.img
            ? '<li class="tap" tabindex="0" data-img="' + esc(it.img) +
              '" data-name="' + esc(it.name) +
              '" data-price="' + esc(it.price) +
              '" data-note="' + esc(it.note) +
              '" data-weight="' + esc(it.weight) + '">'
            : "<li>") +
          (it.img ? '<img loading="lazy" src="' + esc(it.img) + '" alt="">' : "") +
          '<div class="n">' + esc(it.name) +
          (it.note ? "<span>" + esc(it.note) + "</span>" : "") +
          (it.weight ? "<em>" + esc(it.weight) + "</em>" : "") +
          "</div><b>" + esc(it.price) + "</b></li>"
        ).join("") +
        "</ul>";
    }).join("");
    return tabs + body;
  }

  const showEnFirst = hasEn && en;
  const uaBlock = '<section data-lang="uk"' + (showEnFirst ? ' hidden' : "") + ">" +
    '<header><h1>' + esc(menu.title || "") + "</h1>" +
    (menu.note ? '<div class="note">' + esc(menu.note) + "</div>" : "") + "</header>" +
    block(menu.text, "u") + "</section>";

  const enBlock = hasEn
    ? '<section data-lang="en"' + (showEnFirst ? "" : " hidden") + ">" +
      '<header><h1>' + esc(menu.title_en || menu.title || "") + "</h1>" +
      (menu.note_en ? '<div class="note">' + esc(menu.note_en) + "</div>" : "") + "</header>" +
      block(menu.text_en, "e") + "</section>"
    : "";

  const switcher = hasEn
    ? '<div class="lang"><button data-set="uk"' + (showEnFirst ? "" : ' class="on"') + ">UA</button>" +
      '<button data-set="en"' + (showEnFirst ? ' class="on"' : "") + ">EN</button></div>"
    : "";

  const bgUrl = safeBg(menu.bg);
  const bg = bgUrl
    ? "body{background-image:url('" + esc(bgUrl) +
      "');background-size:cover;background-position:center;background-attachment:fixed}" +
      ".wrap{background:" + th.panel + ";backdrop-filter:blur(2px);border-radius:14px;" +
      "margin-top:14px;margin-bottom:14px;padding-top:4px;padding-bottom:20px}"
    : "";

  return `<!doctype html><html lang="${showEnFirst ? "en" : "uk"}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(menu.title || "Menu")}</title>
<style>
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:${th.bg};color:${th.ink};
       font:400 17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
       padding:0 0 46px}
  ${bg}
  .wrap{max-width:560px;margin:0 auto;padding:0 20px}
  .lang{display:flex;justify-content:center;gap:6px;padding:14px 0 0}
  .lang button{background:${th.chip};color:${th.ink};border:0;border-radius:999px;
               padding:6px 15px;font:600 13px/1 inherit;cursor:pointer;font-family:inherit}
  .lang button.on{background:${th.acc};color:${th.bg}}
  header{text-align:center;padding:24px 0 18px;border-bottom:2px solid ${th.ink}}
  h1{font-size:27px;font-weight:700;letter-spacing:-.02em;margin:0}
  .note{margin-top:7px;color:${th.mute};font-size:14.5px}
  .tabs{position:sticky;top:0;z-index:5;display:flex;gap:8px;overflow-x:auto;
        background:${th.bg};padding:11px 20px;margin:0 -20px;
        border-bottom:1px solid ${th.line};-webkit-overflow-scrolling:touch}
  .tabs::-webkit-scrollbar{display:none}
  .tabs a{flex:0 0 auto;text-decoration:none;color:${th.ink};background:${th.chip};
          border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;white-space:nowrap}
  .tabs a:hover{background:${th.chipH}}
  .tabs a.on{background:${th.acc};color:${th.bg}}
  h2{font-size:13px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
     color:${th.acc};margin:28px 0 8px;scroll-margin-top:58px}
  ul{list-style:none;margin:0;padding:0}
  li{display:flex;align-items:flex-start;gap:12px;padding:11px 0;border-bottom:1px solid ${th.line}}
  li:last-child{border-bottom:0}
  li img{width:64px;height:64px;object-fit:cover;border-radius:9px;flex:0 0 auto;background:${th.chip}}
  .n{flex:1;min-width:0}
  .n span{display:block;color:${th.mute};font-size:13.5px;margin-top:2px;line-height:1.35}
  .n em{display:block;font-style:normal;color:${th.mute};opacity:.75;font-size:12.5px;margin-top:3px}
  li b{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
  [hidden]{display:none}
  li.tap{cursor:pointer;border-radius:10px;margin:0 -8px;padding-left:8px;padding-right:8px;
         transition:background .12s}
  li.tap:hover,li.tap:focus-visible{background:${th.chip};outline:none}
  .sheet{position:fixed;inset:0;z-index:20;display:none;background:rgba(8,10,16,.82);
         align-items:flex-end;justify-content:center;padding:0}
  .sheet.on{display:flex}
  .sheet .box{background:${th.bg};color:${th.ink};width:100%;max-width:560px;
              border-radius:18px 18px 0 0;overflow:hidden;max-height:92vh;overflow-y:auto;
              animation:rise .22s ease-out}
  @keyframes rise{from{transform:translateY(26px)}to{transform:translateY(0)}}
  .sheet img{width:100%;display:block;aspect-ratio:4/3;object-fit:cover;background:${th.chip}}
  .sheet .in{padding:18px 20px 26px}
  .sheet h3{margin:0 0 6px;font-size:22px;line-height:1.2;font-weight:700}
  .sheet .pr{font-size:19px;font-weight:700;color:${th.acc};margin-bottom:10px}
  .sheet p{margin:0;color:${th.mute};font-size:15.5px;line-height:1.45}
  .sheet .wg{margin-top:10px;color:${th.mute};opacity:.75;font-size:13.5px}
  .sheet .x{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:50%;
            border:0;background:${th.acc};color:${th.bg};font-size:22px;line-height:1;
            cursor:pointer;font-family:inherit}
  @media (min-width:620px){
    .sheet{align-items:center;padding:20px}
    .sheet .box{border-radius:18px}
  }
</style></head>
<body>
  <div class="wrap">
    ${switcher}
    ${uaBlock}
    ${enBlock}
  </div>

  <div class="sheet" id="sheet">
    <div class="box" style="position:relative">
      <button class="x" id="sheetX" aria-label="close">&times;</button>
      <img id="sheetImg" alt="">
      <div class="in">
        <h3 id="sheetName"></h3>
        <div class="pr" id="sheetPrice"></div>
        <p id="sheetNote"></p>
        <div class="wg" id="sheetWeight"></div>
      </div>
    </div>
  </div>
<script>
(function () {
  var strips = document.querySelectorAll(".tabs");
  for (var t = 0; t < strips.length; t++) {
    strips[t].addEventListener("wheel", function (e) {
      if (this.scrollWidth <= this.clientWidth) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      this.scrollLeft += d;
    }, { passive: false });
  }

  function spy() {
    var sec = document.querySelector("section[data-lang]:not([hidden])") || document;
    var strip = sec.querySelector(".tabs");
    if (!strip) return;
    var heads = sec.querySelectorAll("h2");
    var links = strip.querySelectorAll("a");
    if (!heads.length || !links.length) return;

    var edge = strip.getBoundingClientRect().bottom + 10;
    var idx = 0;
    for (var i = 0; i < heads.length; i++)
      if (heads[i].getBoundingClientRect().top <= edge) idx = i;

    for (var j = 0; j < links.length; j++)
      links[j].className = j === idx ? "on" : "";

    var a = links[idx];
    if (!a) return;
    var l = a.offsetLeft;
    var r = l + a.offsetWidth;
    if (l < strip.scrollLeft + 10)
      strip.scrollTo({ left: Math.max(0, l - 14), behavior: "smooth" });
    else if (r > strip.scrollLeft + strip.clientWidth - 10)
      strip.scrollTo({ left: r - strip.clientWidth + 14, behavior: "smooth" });
  }

  var pending = false;
  function onScroll() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function () { pending = false; spy(); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  spy();

  var sheet = document.getElementById("sheet");
  var sImg = document.getElementById("sheetImg");
  var sName = document.getElementById("sheetName");
  var sPrice = document.getElementById("sheetPrice");
  var sNote = document.getElementById("sheetNote");
  var sWeight = document.getElementById("sheetWeight");

  function openSheet(li) {
    sImg.src = li.getAttribute("data-img");
    sName.textContent = li.getAttribute("data-name");
    sPrice.textContent = li.getAttribute("data-price");
    var note = li.getAttribute("data-note");
    var wg = li.getAttribute("data-weight");
    sNote.textContent = note;
    sNote.hidden = !note;
    sWeight.textContent = wg;
    sWeight.hidden = !wg;
    sheet.className = "sheet on";
    document.body.style.overflow = "hidden";
  }

  function closeSheet() {
    sheet.className = "sheet";
    document.body.style.overflow = "";
  }

  var taps = document.querySelectorAll("li.tap");
  for (var n = 0; n < taps.length; n++) {
    taps[n].onclick = function () { openSheet(this); };
    taps[n].onkeydown = function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(this); }
    };
  }

  document.getElementById("sheetX").onclick = closeSheet;
  sheet.onclick = function (e) { if (e.target === sheet) closeSheet(); };
  document.onkeydown = function (e) { if (e.key === "Escape") closeSheet(); };

  var btns = document.querySelectorAll(".lang button");
  for (var i = 0; i < btns.length; i++) {
    btns[i].onclick = function () {
      var want = this.getAttribute("data-set");
      var secs = document.querySelectorAll("section[data-lang]");
      for (var j = 0; j < secs.length; j++)
        secs[j].hidden = secs[j].getAttribute("data-lang") !== want;
      for (var k = 0; k < btns.length; k++)
        btns[k].className = btns[k].getAttribute("data-set") === want ? "on" : "";
      window.scrollTo({ top: 0 });
      spy();
    };
  }
})();
</script>
</body></html>`;
}

// ─────────────────── Візитки vCard ───────────────────

const VC_FIELDS = {
  name: 120, title: 120, org: 120,
  phone: 40, phone2: 40, email: 120, site: 300, address: 300,
  telegram: 120, viber: 40, whatsapp: 40, instagram: 120, facebook: 300, tiktok: 120,
  about: 400,
};

function cleanVcard(b) {
  b = b || {};
  const o = {};
  for (const k in VC_FIELDS) o[k] = String(b[k] || "").replace(/[\r\n]+/g, k === "about" ? "\n" : " ").trim().slice(0, VC_FIELDS[k]);
  o.photo = /^\/img\/[A-Za-z0-9._-]+$/.test(b.photo || "") ? b.photo : "";
  o.theme = b.theme === "light" ? "light" : "dark";
  o.accent = /^#[0-9a-fA-F]{6}$/.test(b.accent || "") ? b.accent : "#4d7cfe";
  o.updated = Date.now();
  return o;
}

async function readVcard(env, code) {
  if (!/^[a-zA-Z0-9_-]+$/.test(code || "")) return null;
  try {
    const raw = await env.LINKS.get("__vcard:" + code);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// номер → +380XXXXXXXXX (0XXXXXXXXX теж розуміємо)
function intlPhone(s) {
  let d = String(s || "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.charAt(0) !== "+") {
    if (/^0\d{9}$/.test(d)) d = "+38" + d;
    else d = "+" + d;
  }
  return /^\+\d{7,15}$/.test(d) ? d : "";
}

function prettyPhoneNum(p) {
  return /^\+380\d{9}$/.test(p)
    ? p.slice(0, 4) + " " + p.slice(4, 6) + " " + p.slice(6, 9) + " " + p.slice(9, 11) + " " + p.slice(11)
    : p;
}

function handleOf(s) {
  return String(s || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?[^/]+\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9._-]/g, "");
}

function webUrl(s) {
  s = String(s || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return isWebUrl(s) ? s : "";
}

function vcLinks(v) {
  const phone = intlPhone(v.phone);
  const phone2 = intlPhone(v.phone2);
  const viber = intlPhone(v.viber);
  const wa = intlPhone(v.whatsapp);
  const tg = handleOf(v.telegram);
  const ig = handleOf(v.instagram);
  const tt = handleOf(v.tiktok);
  const fb = /^https?:/i.test(v.facebook || "") ? webUrl(v.facebook) : handleOf(v.facebook);
  const email = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/.test(v.email || "") ? v.email : "";
  return {
    phone, phone2, email,
    site: webUrl(v.site),
    telegram: tg ? "https://t.me/" + tg : "",
    tgName: tg,
    viber: viber ? "viber://chat?number=" + encodeURIComponent(viber) : "",
    viberNum: viber,
    whatsapp: wa ? "https://wa.me/" + wa.slice(1) : "",
    waNum: wa,
    instagram: ig ? "https://instagram.com/" + ig : "",
    igName: ig,
    facebook: fb ? (fb.indexOf("http") === 0 ? fb : "https://facebook.com/" + fb) : "",
    tiktok: tt ? "https://www.tiktok.com/@" + tt : "",
    ttName: tt,
    map: v.address ? "https://maps.google.com/?q=" + encodeURIComponent(v.address) : "",
  };
}

// ── .vcf ──

function vcEsc(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// складання рядків ≤ 75 байт (RFC 6350 / 2426)
function vcFold(line) {
  if (/^[\x00-\x7F]*$/.test(line)) {
    if (line.length <= 75) return line;
    const out = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) out.push(" " + line.slice(i, i + 74));
    return out.join("\r\n");
  }
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 75) {
      out.push(cur);
      cur = " " + ch;
      bytes = 1 + b;
    } else {
      cur += ch;
      bytes += b;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

function toBase64(buf) {
  const u = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function buildVcf(env, v, code, origin) {
  const L = vcLinks(v);
  const words = String(v.name || "").trim().split(/\s+/);
  const first = words[0] || "";
  const last = words.slice(1).join(" ");

  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push("N:" + vcEsc(last) + ";" + vcEsc(first) + ";;;");
  lines.push("FN:" + vcEsc(v.name));
  if (v.org) lines.push("ORG:" + vcEsc(v.org));
  if (v.title) lines.push("TITLE:" + vcEsc(v.title));
  if (L.phone) lines.push("TEL;TYPE=CELL,VOICE:" + L.phone);
  if (L.phone2 && L.phone2 !== L.phone) lines.push("TEL;TYPE=WORK,VOICE:" + L.phone2);
  if (L.email) lines.push("EMAIL;TYPE=INTERNET:" + L.email);
  if (L.site) lines.push("URL:" + L.site);
  if (v.address) lines.push("ADR;TYPE=WORK:;;" + vcEsc(v.address) + ";;;;");
  if (v.about) lines.push("NOTE:" + vcEsc(v.about));

  let n = 0;
  const item = (href, label) => {
    if (!href) return;
    n++;
    lines.push("item" + n + ".URL:" + href);
    lines.push("item" + n + ".X-ABLabel:" + vcEsc(label));
  };
  item(L.telegram, "Telegram");
  item(L.instagram, "Instagram");
  item(L.facebook, "Facebook");
  item(L.tiktok, "TikTok");
  item(L.whatsapp, "WhatsApp");
  if (L.viberNum && L.viberNum !== L.phone && L.viberNum !== L.phone2) {
    n++;
    lines.push("item" + n + ".TEL:" + L.viberNum);
    lines.push("item" + n + ".X-ABLabel:Viber");
  }
  item(origin + "/" + code, "NFC");

  if (v.photo && env.IMG) {
    try {
      const obj = await env.IMG.get(v.photo.slice(5));
      const t = (obj && obj.httpMetadata && obj.httpMetadata.contentType) || "";
      if (obj && /^image\/(jpeg|png)$/.test(t)) {
        const buf = await obj.arrayBuffer();
        if (buf.byteLength <= 300 * 1024) {
          lines.push("PHOTO;ENCODING=b;TYPE=" + (t === "image/png" ? "PNG" : "JPEG") + ":" + toBase64(buf));
        }
      }
    } catch (e) {}
  }

  lines.push("REV:" + new Date(v.updated || Date.now()).toISOString());
  lines.push("END:VCARD");
  return lines.map(vcFold).join("\r\n") + "\r\n";
}

async function serveVcf(env, url, code) {
  code = decodeURIComponent(code || "").replace(/\.vcf$/i, "");
  const v = await readVcard(env, code);
  if (!v) return new Response("not found", { status: 404 });

  const body = await buildVcf(env, v, code, url.origin);
  const ascii = String(v.name || "contact").replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "contact";
  return new Response(body, {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition":
        'attachment; filename="' + ascii + '.vcf"; filename*=UTF-8\'\'' +
        encodeURIComponent((v.name || "contact") + ".vcf"),
      "cache-control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ── сторінка-візитка ──

const VC_ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  insta: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
  fb: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  add: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
};

function vcIcon(name) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (VC_ICONS[name] || "") + "</svg>";
}

function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#0b0d12" : "#ffffff";
}

function cardPage(v, code, request, origin) {
  const en = visitorLang(request) === "en";
  const esc = s =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const T = en
    ? { save: "Save contact", call: "Call", share: "Share", copied: "Link copied",
        phone: "Phone", phone2: "Phone 2", email: "Email", site: "Website", address: "Address",
        promo: "Want a card like this?" }
    : { save: "Зберегти контакт", call: "Подзвонити", share: "Поділитися", copied: "Посилання скопійовано",
        phone: "Телефон", phone2: "Телефон 2", email: "Email", site: "Сайт", address: "Адреса",
        promo: "Хочете таку візитку?" };

  const L = vcLinks(v);
  const dark = v.theme !== "light";
  const acc = /^#[0-9a-fA-F]{6}$/.test(v.accent || "") ? v.accent : "#4d7cfe";
  const accInk = inkOn(acc);
  const C = dark
    ? { bg: "#0d0f14", card: "#161a22", ink: "#eef2f8", mute: "#8b93a1", line: "#242a36", chip: "#1c212b" }
    : { bg: "#f3f4f7", card: "#ffffff", ink: "#14171b", mute: "#6e7480", line: "#e6e8ee", chip: "#f1f3f7" };

  const initials = String(v.name || "?").trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join("").toUpperCase();
  const role = [v.title, v.org].filter(Boolean).join(" · ");

  const rows = [];
  const row = (icon, label, value, href) => {
    if (!href) return;
    rows.push(
      '<a class="row" href="' + esc(href) + '" rel="noopener"' +
      (/^https?:/i.test(href) ? ' target="_blank"' : "") + ">" +
      '<span class="ic">' + vcIcon(icon) + "</span>" +
      '<span class="tx"><b>' + esc(label) + "</b><span>" + esc(value) + "</span></span></a>"
    );
  };
  row("phone", T.phone, prettyPhoneNum(L.phone), L.phone ? "tel:" + L.phone : "");
  if (L.phone2 !== L.phone) row("phone", T.phone2, prettyPhoneNum(L.phone2), L.phone2 ? "tel:" + L.phone2 : "");
  row("send", "Telegram", "@" + L.tgName, L.telegram);
  row("chat", "Viber", prettyPhoneNum(L.viberNum), L.viber);
  row("chat", "WhatsApp", prettyPhoneNum(L.waNum), L.whatsapp);
  row("insta", "Instagram", "@" + L.igName, L.instagram);
  row("fb", "Facebook", L.facebook.replace(/^https?:\/\/(www\.)?/, ""), L.facebook);
  row("note", "TikTok", "@" + L.ttName, L.tiktok);
  row("mail", T.email, L.email, L.email ? "mailto:" + L.email : "");
  row("globe", T.site, L.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), L.site);
  row("pin", T.address, v.address, L.map);

  const photo = v.photo ? esc(v.photo) : "";
  const ogImg = v.photo ? esc(origin + v.photo) : "";
  const promo = SITE.promo
    ? '<a class="promo" href="' + esc(origin) + '/">' + esc(T.promo) + " · " + esc(SITE.brand) + "</a>"
    : "";

  return `<!doctype html>
<html lang="${en ? "en" : "uk"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${C.bg}">
<title>${esc(v.name)}${role ? " — " + esc(role) : ""}</title>
<meta property="og:title" content="${esc(v.name)}">
<meta property="og:description" content="${esc(role || v.about || "")}">
${ogImg ? '<meta property="og:image" content="' + ogImg + '">' : ""}
<style>
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:${C.bg};color:${C.ink};
       font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
       padding:0 0 calc(40px + env(safe-area-inset-bottom,0px))}
  .wrap{max-width:480px;margin:0 auto;padding:0 16px}
  .cover{height:132px;margin:0 -16px;
         background:radial-gradient(120% 140% at 0% 0%,${acc} 0%,transparent 62%),
                    radial-gradient(120% 140% at 100% 0%,${acc}99 0%,transparent 60%),${C.bg}}
  .card{background:${C.card};border:1px solid ${C.line};border-radius:20px;
        margin-top:-64px;padding:0 20px 22px;text-align:center;position:relative}
  .ava{width:112px;height:112px;border-radius:50%;margin:-56px auto 14px;overflow:hidden;
       border:4px solid ${C.card};background:${acc};color:${accInk};
       display:grid;place-items:center;font-size:40px;font-weight:700;letter-spacing:-.02em}
  .ava img{width:100%;height:100%;object-fit:cover;display:block}
  h1{margin:0;font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-.02em}
  .role{margin-top:5px;color:${C.mute};font-size:15px}
  .about{margin:12px 0 0;color:${C.ink};opacity:.86;font-size:15px;white-space:pre-line}
  .save{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:18px;
        background:${acc};color:${accInk};text-decoration:none;font-weight:700;font-size:17px;
        padding:15px 18px;border-radius:14px}
  .save svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .quick{display:flex;gap:10px;margin-top:10px}
  .quick a,.quick button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;
        background:${C.chip};color:${C.ink};border:1px solid ${C.line};border-radius:12px;
        padding:12px;font:600 15px/1.2 inherit;text-decoration:none;cursor:pointer;font-family:inherit}
  .quick svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .list{margin-top:14px;background:${C.card};border:1px solid ${C.line};border-radius:20px;overflow:hidden}
  .row{display:flex;align-items:center;gap:14px;padding:14px 18px;text-decoration:none;color:${C.ink};
       border-bottom:1px solid ${C.line}}
  .row:last-child{border-bottom:0}
  .row:active{background:${C.chip}}
  .ic{width:40px;height:40px;border-radius:12px;background:${C.chip};display:grid;place-items:center;flex:0 0 auto}
  .ic svg{width:20px;height:20px;fill:none;stroke:${acc};stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .tx{display:flex;flex-direction:column;min-width:0}
  .tx b{font-size:12.5px;font-weight:600;color:${C.mute};text-transform:uppercase;letter-spacing:.06em}
  .tx span{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .promo{display:block;text-align:center;margin-top:22px;font-size:12.5px;color:${C.mute};text-decoration:none}
</style>
</head>
<body>
<main class="wrap">
  <div class="cover"></div>
  <section class="card">
    <div class="ava">${photo ? '<img src="' + photo + '" alt="">' : esc(initials)}</div>
    <h1>${esc(v.name)}</h1>
    ${role ? '<div class="role">' + esc(role) + "</div>" : ""}
    ${v.about ? '<p class="about">' + esc(v.about) + "</p>" : ""}
    <a class="save" href="/v/${esc(code)}">${vcIcon("add")}${esc(T.save)}</a>
    <div class="quick">
      ${L.phone ? '<a href="tel:' + esc(L.phone) + '">' + vcIcon("phone") + esc(T.call) + "</a>" : ""}
      <button type="button" id="share">${vcIcon("share")}<span>${esc(T.share)}</span></button>
    </div>
  </section>
  ${rows.length ? '<section class="list">' + rows.join("") + "</section>" : ""}
  ${promo}
</main>
<script>
(function () {
  var b = document.getElementById("share");
  if (!b) return;
  b.onclick = function () {
    var u = location.href;
    if (navigator.share) {
      navigator.share({ title: document.title, url: u }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(u);
      b.querySelector("span").textContent = ${JSON.stringify(T.copied)};
    }
  };
})();
</script>
</body>
</html>`;
}

// ─────────────────── Самоактивація покупцем ───────────────────
//
// Як це працює:
//   1. Адмін резервує партію з типом (відгук / чайові / посилання / візитка).
//   2. Продав картку → в адмінці «Продано».
//   3. Покупець сканує картку → бачить форму свого типу → налаштовує сам.
//   4. Отримує власне посилання для змін: /e/<код>#<ключ>
//      (ключ у «#» не йде на сервер у логи; у базі — лише його SHA-256).

async function ownerCtx(env, code, key) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(code || "")) return null;
  const rec = parseLink(await env.LINKS.get(code));
  if (!rec || rec.blocked || !OWNER_KINDS[rec.kind]) return null;
  let owner = false;
  if (key && rec.edit && key.length <= 64) {
    owner = (await sha256hex(new TextEncoder().encode(key))) === rec.edit;
  }
  return { rec, owner, open: !rec.url && !!rec.sold };
}

async function ownerTarget(env, url, rec, code, body) {
  const d = body.data || {};

  if (rec.kind === "review") {
    if (!isMapsInput(body.maps)) return { error: "bad_maps" };
    const r = await resolveReviewLink(env, body.maps);
    if (!r.ok) return { error: r.error || "resolve_failed" };
    return { url: r.review, title: String(r.name || rec.title || "").slice(0, 120), place: r.address || "" };
  }

  if (rec.kind === "tip" || rec.kind === "link") {
    const u = webUrl(d.url);
    if (!u) return { error: "bad_url" };
    try {
      if (new URL(u).hostname === url.hostname) return { error: "bad_url" };
    } catch (e) {
      return { error: "bad_url" };
    }
    return { url: u, title: String(d.title || "").trim().slice(0, 120) || rec.title || "" };
  }

  if (rec.kind === "vcard") {
    const card = cleanVcard(d);
    if (!card.name) return { error: "need_name" };
    return { url: "card:" + code, title: card.name, card };
  }

  return { error: "forbidden" };
}

async function handlePublic(request, env, url, action) {
  if (request.method !== "POST") return json({ error: "need_post" }, 400);
  if (await tooManyFails(request)) return json({ error: "too_many" }, 429);

  const keyHdr = (request.headers.get("X-Edit-Key") || "").trim();

  // фото для візитки — лише власник, лише JPG/PNG до 1.5 МБ
  if (action === "photo") {
    const pc = url.searchParams.get("code") || "";
    const ctx = await ownerCtx(env, pc, keyHdr);
    if (!ctx || !ctx.owner || ctx.rec.kind !== "vcard") {
      await noteFail(request);
      return json({ error: "bad_key" }, 403);
    }
    if (!env.IMG) return json({ error: "no_r2" }, 400);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: "empty_file" }, 400);
    if (buf.byteLength > 1.5 * 1024 * 1024) return json({ error: "too_big" }, 400);
    const kind = sniffImage(new Uint8Array(buf.slice(0, 16)));
    if (!kind || !/jpeg|png/.test(kind[0])) return json({ error: "bad_image" }, 400);
    const key = randomCode(10) + "." + kind[1];
    await env.IMG.put(key, buf, { httpMetadata: { contentType: kind[0] } });
    return json({ ok: true, path: "/img/" + key });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "need_post" }, 400);
  }
  const code = String((body && body.code) || "");
  const ctx = await ownerCtx(env, code, keyHdr);
  if (!ctx) return json({ error: "not_found" }, 404);
  const rec = ctx.rec;

  if (action === "resolve") {
    if (!ctx.owner && !ctx.open) {
      if (keyHdr) await noteFail(request);
      return json({ error: "bad_key" }, 403);
    }
    if (rec.kind !== "review") return json({ error: "forbidden" }, 403);
    if (!isMapsInput(body.maps)) return json({ error: "bad_maps" }, 400);
    const r = await resolveReviewLink(env, body.maps);
    if (!r.ok) return json({ error: r.error || "resolve_failed" }, 400);
    return json({ ok: true, name: r.name || "", address: r.address || "", review: r.review });
  }

  if (action === "activate") {
    if (!ctx.open) return json({ error: rec.url ? "already" : "not_sold" }, 409);
    const t = await ownerTarget(env, url, rec, code, body);
    if (t.error) return json({ error: t.error }, 400);

    // повторна перевірка перед записом — раптом хтось встиг раніше
    const fresh = parseLink(await env.LINKS.get(code)) || {};
    if (fresh.url || !fresh.sold || fresh.blocked) return json({ error: "already" }, 409);

    const key = randomCode(24);
    if (t.card) await env.LINKS.put("__vcard:" + code, JSON.stringify(t.card));
    await putLink(env, code, Object.assign({}, fresh, {
      url: t.url,
      title: t.title,
      edit: await sha256hex(new TextEncoder().encode(key)),
      activated: Date.now(),
      sold: false,
    }));
    await addLog(env, code, "owner", "activated → " + (t.place ? t.title + " · " + t.place + " · " : "") + t.url, request);
    return json({
      ok: true,
      key,
      edit: url.origin + "/e/" + code + "#" + key,
      open: url.origin + "/" + code,
    });
  }

  if (!ctx.owner) {
    await noteFail(request);
    return json({ error: "bad_key" }, 403);
  }

  if (action === "get") {
    const out = { ok: true, kind: rec.kind, url: rec.url || "", title: rec.title || "" };
    if (rec.kind === "vcard") out.card = await readVcard(env, code);
    return json(out);
  }

  if (action === "save") {
    const t = await ownerTarget(env, url, rec, code, body);
    if (t.error) return json({ error: t.error }, 400);
    if (t.card) await env.LINKS.put("__vcard:" + code, JSON.stringify(t.card));
    await putLink(env, code, Object.assign({}, rec, { url: t.url, title: t.title }));
    await addLog(env, code, "owner", "saved → " + (t.place ? t.title + " · " + t.place + " · " : "") + t.url, request);
    return json({ ok: true, open: url.origin + "/" + code });
  }

  return json({ error: "unknown_action" }, 404);
}

function blockedPage(request) {
  const en = visitorLang(request) === "en";
  return `<!doctype html><html lang="${en ? "en" : "uk"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${en ? "Unavailable" : "Недоступно"}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1115;
color:#e5e9f0;font:15px/1.6 system-ui,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px;font-weight:600}p{margin:0;color:#8b93a1;max-width:320px}</style></head>
<body><div><h1>${en ? "This code is unavailable" : "Цей код тимчасово недоступний"}</h1><p>${
    en ? "The link has been paused by the card provider." : "Посилання призупинив постачальник картки."
  }</p></div></body></html>`;
}

const OWNER_T = {
  uk: {
    t_activate: "Активація картки",
    t_edit: "Налаштування картки",
    lead_activate: "Налаштуйте картку за хвилину — після цього вона одразу почне працювати.",
    lead_edit: "Тут можна змінити, куди веде ваша картка.",
    k_review: "Картка для Google-відгуків",
    k_tip: "Картка для чайових",
    k_link: "Картка-посилання",
    k_vcard: "Електронна візитка",
    review_label: "Посилання на ваш заклад у Google Картах",
    review_hint: "Google Карти → ваш заклад → «Поділитися» → «Копіювати посилання».",
    find: "Знайти заклад",
    finding: "Шукаю…",
    found: "Знайдено:",
    noname: "Назву не вдалося визначити — перевірте форму відгуку за посиланням нижче",
    found_q: "Це ваш заклад?",
    yes: "Так, усе вірно",
    no: "Ні, інше посилання",
    test: "Перевірити форму відгуку ↗",
    current: "Зараз картка веде на:",
    change: "Змінити заклад",
    tip_label: "Посилання на банку Monobank",
    tip_hint: "Monobank → Накопичення → Банка → «Поділитися» → «Копіювати посилання».",
    link_label: "Куди веде картка",
    link_hint: "Instagram, сайт, Telegram-канал — будь-яке посилання.",
    f_name: "Імʼя та прізвище *",
    f_title: "Чим займаєтесь (посада)",
    f_org: "Компанія",
    f_phone: "Телефон",
    f_telegram: "Telegram (@нік)",
    f_viber: "Viber (номер)",
    f_whatsapp: "WhatsApp (номер)",
    f_instagram: "Instagram (@нік)",
    f_email: "Email",
    f_site: "Сайт",
    f_address: "Адреса",
    f_about: "Коротко про себе",
    f_theme: "Тема",
    th_dark: "Темна",
    th_light: "Світла",
    f_accent: "Колір",
    f_photo: "Фото",
    photo_btn: "Завантажити фото",
    photo_later: "Фото можна додати одразу після активації — у вашому посиланні для змін.",
    save_activate: "Активувати картку",
    save_edit: "Зберегти зміни",
    busy: "Зберігаю…",
    done_t: "Готово! Картка працює",
    done_p: "Збережіть посилання нижче — лише з ним можна буде змінити картку. Нікому його не пересилайте.",
    copy: "Копіювати",
    copied: "Скопійовано",
    tg: "Надіслати собі в Telegram",
    tg_text: "Посилання для змін моєї картки",
    open: "Відкрити картку",
    more: "Додати фото та змінити дані →",
    saved: "Збережено. Картка вже веде на нові дані.",
    invalid: "Посилання для змін недійсне. Зверніться до продавця картки.",
    e_bad_url: "Перевірте посилання — воно має починатися з https://",
    e_bad_maps: "Це не посилання на Google Карти.",
    e_resolve_failed: "Не вдалося знайти заклад. Скопіюйте посилання через «Поділитися» в картці закладу.",
    e_apple_maps: "Це посилання з Apple Карт. Відкрийте заклад у Google Картах і скопіюйте посилання там: «Поділитися» → «Копіювати посилання».",
    e_need_name: "Вкажіть імʼя.",
    e_already: "Цю картку вже активовано.",
    e_not_sold: "Картку ще не підготував продавець.",
    e_too_many: "Забагато спроб. Спробуйте за 15 хвилин.",
    e_bad_image: "Потрібне фото у форматі JPG або PNG.",
    e_too_big: "Фото завелике.",
    e_generic: "Щось пішло не так. Спробуйте ще раз.",
  },
  en: {
    t_activate: "Activate your card",
    t_edit: "Card settings",
    lead_activate: "Set your card up in a minute — it starts working right away.",
    lead_edit: "Change where your card leads.",
    k_review: "Google review card",
    k_tip: "Tip card",
    k_link: "Link card",
    k_vcard: "Digital business card",
    review_label: "Link to your place on Google Maps",
    review_hint: "Google Maps → your place → Share → Copy link.",
    find: "Find the place",
    finding: "Searching…",
    found: "Found:",
    noname: "Could not read the name — check the review form with the link below",
    found_q: "Is this your place?",
    yes: "Yes, that's it",
    no: "No, another link",
    test: "Test the review form ↗",
    current: "The card currently leads to:",
    change: "Change the place",
    tip_label: "Link to your Monobank jar",
    tip_hint: "Monobank → Savings → Jar → Share → Copy link.",
    link_label: "Where the card leads",
    link_hint: "Instagram, a website, a Telegram channel — any link.",
    f_name: "Full name *",
    f_title: "What you do (job title)",
    f_org: "Company",
    f_phone: "Phone",
    f_telegram: "Telegram (@handle)",
    f_viber: "Viber (number)",
    f_whatsapp: "WhatsApp (number)",
    f_instagram: "Instagram (@handle)",
    f_email: "Email",
    f_site: "Website",
    f_address: "Address",
    f_about: "Short bio",
    f_theme: "Theme",
    th_dark: "Dark",
    th_light: "Light",
    f_accent: "Colour",
    f_photo: "Photo",
    photo_btn: "Upload photo",
    photo_later: "You can add a photo right after activation — from your edit link.",
    save_activate: "Activate the card",
    save_edit: "Save changes",
    busy: "Saving…",
    done_t: "Done! Your card works",
    done_p: "Save the link below — it is the only way to change the card later. Do not share it.",
    copy: "Copy",
    copied: "Copied",
    tg: "Send to myself on Telegram",
    tg_text: "Edit link for my card",
    open: "Open the card",
    more: "Add a photo and edit details →",
    saved: "Saved. The card already shows the new details.",
    invalid: "This edit link is not valid. Please contact the card seller.",
    e_bad_url: "Check the link — it must start with https://",
    e_bad_maps: "This is not a Google Maps link.",
    e_resolve_failed: "Could not find the place. Copy the link with the Share button on the place card.",
    e_apple_maps: "This is an Apple Maps link. Open the place in Google Maps and copy the link there: Share → Copy link.",
    e_need_name: "Enter a name.",
    e_already: "This card is already activated.",
    e_not_sold: "The seller has not prepared this card yet.",
    e_too_many: "Too many attempts. Try again in 15 minutes.",
    e_bad_image: "A JPG or PNG photo is required.",
    e_too_big: "The photo is too large.",
    e_generic: "Something went wrong. Please try again.",
  },
};

function ownerPage(request, origin, code, rec, mode) {
  const en = visitorLang(request) === "en";
  const T = OWNER_T[en ? "en" : "uk"];
  const cfg = { code, kind: rec.kind, mode, T, origin };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  return `<!doctype html>
<html lang="${en ? "en" : "uk"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${esc(mode === "edit" ? T.t_edit : T.t_activate)}</title>
<style>
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:#f3f4f7;color:#14171b;
       font:400 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
       padding:0 0 calc(40px + env(safe-area-inset-bottom,0px))}
  .wrap{max-width:520px;margin:0 auto;padding:20px 16px}
  .brand{font-weight:700;letter-spacing:-.02em;color:#6e7480;margin:4px 4px 14px;font-size:15px}
  .card{background:#fff;border:1px solid #e6e8ee;border-radius:20px;padding:22px 20px;margin-bottom:14px}
  .kind{display:inline-block;background:#eef2ff;color:#3550c8;font-size:12.5px;font-weight:600;
        border-radius:999px;padding:4px 11px;margin-bottom:10px}
  h1{margin:0 0 6px;font-size:24px;line-height:1.2;letter-spacing:-.02em}
  .lead{margin:0 0 16px;color:#6e7480;font-size:15px}
  label{display:block;font-size:13px;font-weight:600;color:#3b4049;margin:14px 0 6px}
  input,select,textarea{width:100%;font:inherit;font-size:16px;color:#14171b;background:#fff;
        border:1px solid #d7dbe3;border-radius:12px;padding:12px 13px;outline:none}
  input:focus,select:focus,textarea:focus{border-color:#4d7cfe;box-shadow:0 0 0 3px rgba(77,124,254,.15)}
  textarea{min-height:90px;resize:vertical}
  input[type=color]{height:48px;padding:4px}
  input[type=file]{display:none}
  .hint{font-size:13px;color:#7a808b;margin-top:6px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
  .grid .full{grid-column:1/-1}
  @media (max-width:420px){.grid{grid-template-columns:1fr}}
  .btn{display:flex;align-items:center;justify-content:center;width:100%;margin-top:18px;border:0;
       border-radius:14px;background:#4d7cfe;color:#fff;font-family:inherit;font-weight:700;font-size:16.5px;line-height:1.2;
       padding:15px 18px;cursor:pointer;text-decoration:none}
  .btn:disabled{opacity:.55;cursor:default}
  .btn.ghost{background:#f1f3f7;color:#14171b;font-weight:600}
  .row2{display:flex;gap:10px}
  .row2 .btn{margin-top:10px}
  .msg{display:none;border-radius:12px;padding:11px 13px;font-size:14.5px;margin-bottom:12px}
  .msg.err{display:block;background:#fdecee;color:#a3243b}
  .msg.ok{display:block;background:#e8f7ee;color:#1d6b3e}
  .found{background:#f7f8fb;border:1px solid #e6e8ee;border-radius:14px;padding:14px;margin-top:14px}
  .found b{display:block;font-size:17px;margin:2px 0 2px;overflow-wrap:anywhere}
  .found .addr{color:#6e7480;font-size:14.5px;margin:0 0 8px;overflow-wrap:anywhere}
  .found a{color:#3550c8;font-size:14px}
  .ph{display:flex;align-items:center;gap:12px;margin-top:6px}
  .ph img{width:64px;height:64px;border-radius:50%;object-fit:cover;background:#eef0f4}
  .ph .btn{width:auto;margin:0;padding:11px 16px;font-size:15px}
  .linkbox{font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all;background:#f7f8fb;
           border:1px solid #e6e8ee;border-radius:12px;padding:12px;margin-top:12px}
  .hide{display:none}
  .foot{text-align:center;color:#9aa0aa;font-size:12.5px;margin-top:18px}
  .foot a{color:inherit}
</style>
</head>
<body>
<main class="wrap">
  <div class="brand">${esc(SITE.brand)}</div>
  <section class="card" id="main">
    <div class="kind">${esc(T["k_" + rec.kind] || "")}</div>
    <h1>${esc(mode === "edit" ? T.t_edit : T.t_activate)}</h1>
    <p class="lead">${esc(mode === "edit" ? T.lead_edit : T.lead_activate)}</p>
    <div id="msg" class="msg"></div>
    <div id="form"></div>
  </section>
  <section class="card hide" id="done">
    <h1>${esc(T.done_t)}</h1>
    <p class="lead">${esc(T.done_p)}</p>
    <div class="linkbox" id="editLink"></div>
    <div class="row2">
      <button class="btn ghost" id="copyBtn" type="button">${esc(T.copy)}</button>
      <a class="btn ghost" id="tgBtn" target="_blank" rel="noopener">${esc(T.tg)}</a>
    </div>
    <a class="btn" id="openBtn" target="_blank" rel="noopener">${esc(T.open)}</a>
    <a class="btn ghost hide" id="moreBtn">${esc(T.more)}</a>
  </section>
  <div class="foot"><a href="${esc(origin)}/">${esc(SITE.brand)}</a></div>
</main>
<script>var CFG = ${cfgJson};</script>
<script>${OWNER_JS}</script>
</body>
</html>`;
}

const OWNER_JS = String.raw`
(function () {
  var C = CFG, T = C.T;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = C.mode === "edit" ? decodeURIComponent((location.hash || "").slice(1)) : "";
  var form = $("form");

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function msg(text, kind) { var m = $("msg"); m.textContent = text; m.className = "msg " + (kind || "err"); }
  function hideMsg() { $("msg").className = "msg"; }
  function err(code) { msg(T["e_" + code] || T.e_generic, "err"); }

  function post(action, body) {
    var h = { "content-type": "application/json" };
    if (KEY) h["X-Edit-Key"] = KEY;
    return fetch("/p/" + action, { method: "POST", headers: h, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { error: "generic" }; }); })
      .catch(function () { return { error: "generic" }; });
  }

  function field(id, label, type, ph, hint, full) {
    var input = type === "area"
      ? '<textarea id="f_' + id + '" maxlength="400"></textarea>'
      : '<input id="f_' + id + '" type="' + (type || "text") + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") +
        ' autocomplete="off">';
    return '<div' + (full ? ' class="full"' : "") + '><label for="f_' + id + '">' + esc(label) + "</label>" + input +
      (hint ? '<div class="hint">' + esc(hint) + "</div>" : "") + "</div>";
  }

  var VC = [["name", "text"], ["title", "text"], ["org", "text"], ["phone", "tel"], ["telegram", "text"],
            ["viber", "tel"], ["whatsapp", "tel"], ["instagram", "text"], ["email", "email"],
            ["site", "url"], ["address", "text", 1], ["about", "area", 1]];

  function invalid() {
    form.innerHTML = "";
    msg(T.invalid, "err");
  }

  function finish(res) {
    if (C.mode === "edit") {
      msg(T.saved, "ok");
      return;
    }
    $("main").className = "card hide";
    $("done").className = "card";
    $("editLink").textContent = res.edit;
    $("openBtn").href = res.open;
    $("tgBtn").href = "https://t.me/share/url?url=" + encodeURIComponent(res.edit) +
      "&text=" + encodeURIComponent(T.tg_text);
    if (C.kind === "vcard") { $("moreBtn").href = res.edit; $("moreBtn").className = "btn ghost"; }
    $("copyBtn").onclick = function () {
      try { navigator.clipboard.writeText(res.edit); } catch (e) {}
      $("copyBtn").textContent = T.copied;
    };
    window.scrollTo(0, 0);
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    btn.textContent = on ? T.busy : label;
  }

  // ── відгук: знайти заклад → підтвердити ──
  function buildReview(current) {
    var h = "";
    if (current && current.url) {
      h += '<div class="found"><span>' + esc(T.current) + "</span><b>" + esc(current.title || "Google") +
        '</b><a href="' + esc(current.url) + '" target="_blank" rel="noopener">' + esc(T.test) + "</a></div>" +
        '<label style="margin-top:18px">' + esc(T.change) + "</label>";
    }
    h += field("maps", current && current.url ? T.review_label : T.review_label, "url",
               "https://maps.app.goo.gl/…", T.review_hint, 1);
    h += '<button class="btn" id="findBtn" type="button">' + esc(T.find) + "</button>";
    h += '<div class="found hide" id="foundBox"><span>' + esc(T.found) + '</span><b id="foundName"></b>' +
         '<div class="addr" id="foundAddr"></div>' +
         '<a id="foundTest" target="_blank" rel="noopener">' + esc(T.test) + "</a>" +
         '<div style="margin-top:10px;font-weight:600">' + esc(T.found_q) + "</div>" +
         '<button class="btn" id="yesBtn" type="button">' + esc(T.yes) + "</button>" +
         '<button class="btn ghost" id="noBtn" type="button">' + esc(T.no) + "</button></div>";
    form.innerHTML = h;

    $("findBtn").onclick = function () {
      var maps = $("f_maps").value.trim();
      if (!maps) return;
      hideMsg();
      busy($("findBtn"), true, T.find);
      $("findBtn").textContent = T.finding;
      post("resolve", { code: C.code, maps: maps }).then(function (r) {
        busy($("findBtn"), false, T.find);
        if (!r.ok) return err(r.error);
        $("foundName").textContent = r.name || T.noname;
        $("foundName").style.fontWeight = r.name ? "" : "500";
        $("foundAddr").textContent = r.address || "";
        $("foundAddr").style.display = r.address ? "" : "none";
        $("foundTest").href = r.review;
        $("foundBox").className = "found";
        $("findBtn").className = "btn hide";
      });
    };
    $("noBtn").onclick = function () {
      $("foundBox").className = "found hide";
      $("findBtn").className = "btn";
      $("f_maps").value = "";
      $("f_maps").focus();
    };
    $("yesBtn").onclick = function () {
      var label = T.yes;
      busy($("yesBtn"), true, label);
      post(C.mode === "edit" ? "save" : "activate", { code: C.code, maps: $("f_maps").value.trim() })
        .then(function (r) {
          busy($("yesBtn"), false, label);
          if (!r.ok) return err(r.error);
          if (C.mode === "edit") { msg(T.saved, "ok"); return init(); }
          finish(r);
        });
    };
  }

  // ── чайові / посилання ──
  function buildLink(current) {
    var tip = C.kind === "tip";
    form.innerHTML = field("url", tip ? T.tip_label : T.link_label, "url",
                           tip ? "https://send.monobank.ua/jar/…" : "https://instagram.com/…",
                           tip ? T.tip_hint : T.link_hint, 1) +
      '<button class="btn" id="saveBtn" type="button">' +
      esc(C.mode === "edit" ? T.save_edit : T.save_activate) + "</button>";
    if (current && current.url) $("f_url").value = current.url;
    $("saveBtn").onclick = function () {
      var label = C.mode === "edit" ? T.save_edit : T.save_activate;
      hideMsg();
      busy($("saveBtn"), true, label);
      post(C.mode === "edit" ? "save" : "activate", { code: C.code, data: { url: $("f_url").value.trim() } })
        .then(function (r) {
          busy($("saveBtn"), false, label);
          if (!r.ok) return err(r.error);
          finish(r);
        });
    };
  }

  // ── візитка ──
  function shrink(file, maxSide) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(url);
        var side = Math.max(im.width, im.height);
        var k = side > maxSide ? maxSide / side : 1;
        var cv = document.createElement("canvas");
        cv.width = Math.round(im.width * k);
        cv.height = Math.round(im.height * k);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { resolve(b); }, "image/jpeg", 0.85);
      };
      im.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      im.src = url;
    });
  }

  function buildVcard(card) {
    var h = '<div class="grid">';
    for (var i = 0; i < VC.length; i++) {
      var f = VC[i];
      h += field(f[0], T["f_" + f[0]], f[1], f[0] === "phone" ? "+380 99 123 45 67" : "", "", f[2]);
    }
    h += '<div><label for="f_theme">' + esc(T.f_theme) + '</label><select id="f_theme">' +
         '<option value="dark">' + esc(T.th_dark) + '</option><option value="light">' + esc(T.th_light) +
         "</option></select></div>";
    h += '<div><label for="f_accent">' + esc(T.f_accent) + '</label><input id="f_accent" type="color" value="#4d7cfe"></div>';
    h += "</div>";
    if (C.mode === "edit") {
      h += "<label>" + esc(T.f_photo) + '</label><div class="ph"><img id="phImg" alt="">' +
           '<button class="btn ghost" id="phBtn" type="button">' + esc(T.photo_btn) + "</button>" +
           '<input type="file" id="phFile" accept="image/*"></div><input type="hidden" id="f_photo">';
    } else {
      h += '<div class="hint" style="margin-top:12px">' + esc(T.photo_later) + "</div>";
    }
    h += '<button class="btn" id="saveBtn" type="button">' +
         esc(C.mode === "edit" ? T.save_edit : T.save_activate) + "</button>";
    form.innerHTML = h;

    if (card) {
      for (var j = 0; j < VC.length; j++) $("f_" + VC[j][0]).value = card[VC[j][0]] || "";
      $("f_theme").value = card.theme === "light" ? "light" : "dark";
      $("f_accent").value = card.accent || "#4d7cfe";
      if ($("f_photo")) {
        $("f_photo").value = card.photo || "";
        if (card.photo) $("phImg").src = card.photo;
      }
    }

    if ($("phBtn")) {
      $("phBtn").onclick = function () { $("phFile").click(); };
      $("phFile").onchange = function () {
        var f = $("phFile").files[0];
        if (!f) return;
        hideMsg();
        $("phBtn").disabled = true;
        shrink(f, 600).then(function (blob) {
          if (!blob) { $("phBtn").disabled = false; return err("bad_image"); }
          return fetch("/p/photo?code=" + encodeURIComponent(C.code), {
            method: "POST", headers: { "X-Edit-Key": KEY, "content-type": "image/jpeg" }, body: blob
          }).then(function (r) { return r.json(); }).then(function (r) {
            $("phBtn").disabled = false;
            $("phFile").value = "";
            if (!r.ok) return err(r.error);
            $("f_photo").value = r.path;
            $("phImg").src = r.path;
          });
        }).catch(function () { $("phBtn").disabled = false; err("generic"); });
      };
    }

    $("saveBtn").onclick = function () {
      var label = C.mode === "edit" ? T.save_edit : T.save_activate;
      var data = {};
      for (var k = 0; k < VC.length; k++) data[VC[k][0]] = $("f_" + VC[k][0]).value.trim();
      data.theme = $("f_theme").value;
      data.accent = $("f_accent").value;
      if ($("f_photo")) data.photo = $("f_photo").value;
      if (!data.name) return err("need_name");
      hideMsg();
      busy($("saveBtn"), true, label);
      post(C.mode === "edit" ? "save" : "activate", { code: C.code, data: data }).then(function (r) {
        busy($("saveBtn"), false, label);
        if (!r.ok) return err(r.error);
        finish(r);
      });
    };
  }

  function build(current) {
    if (C.kind === "review") buildReview(current);
    else if (C.kind === "vcard") buildVcard(current && current.card);
    else buildLink(current);
  }

  function init() {
    if (C.mode !== "edit") return build(null);
    if (!KEY) return invalid();
    post("get", { code: C.code }).then(function (r) {
      if (!r.ok) return r.error === "too_many" ? err("too_many") : invalid();
      build(r);
    });
  }

  init();
})();
`;

// ─────────────────── CSS панелей ───────────────────

const PANEL_CSS = `
  *{box-sizing:border-box}
  body{margin:0;background:#0f1115;color:#e5e9f0;
       font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
       padding:24px 16px 64px}
  .wrap{max-width:820px;margin:0 auto}
  .head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:26px}
  h1{font-size:22px;font-weight:600;margin:0 0 4px}
  .sub{color:#8b93a1;font-size:13px}
  .langbox{display:flex;gap:4px;flex-shrink:0}
  .langbox button{background:transparent;border:1px solid #2a2f3a;color:#8b93a1;
                  padding:6px 11px;font-size:12px;border-radius:7px;cursor:pointer}
  .langbox button.on{background:#1d212a;color:#e5e9f0;border-color:#3a4150}
  .card{background:#171a21;border:1px solid #242832;border-radius:12px;padding:20px;margin-bottom:20px}
  .card h2{font-size:14px;font-weight:600;margin:0 0 14px;color:#b8c0cf}
  label{display:block;font-size:12px;color:#8b93a1;margin:0 0 6px}
  input,select{width:100%;background:#0f1115;border:1px solid #2a2f3a;border-radius:8px;
        color:#e5e9f0;padding:11px 13px;font-size:15px;font-family:inherit;outline:none}
  input:focus,select:focus{border-color:#4d7cfe}
  .row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px}
  .row>div{flex:1;min-width:180px}
  button{background:#4d7cfe;border:0;border-radius:8px;color:#fff;padding:11px 20px;
         font-size:14px;font-weight:500;font-family:inherit;cursor:pointer}
  button:hover{background:#3d6ae8}
  button:disabled{opacity:.5;cursor:default}
  button.ghost{background:transparent;border:1px solid #2a2f3a;color:#b8c0cf;padding:7px 12px;font-size:13px}
  button.ghost:hover{background:#1d212a}
  button.danger:hover{border-color:#7f3040;color:#ff8ba0}
  .item{display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #22262f;flex-wrap:wrap}
  .item:last-child{border-bottom:0}
  .item .info{flex:1;min-width:190px;overflow:hidden}
  .code{font-family:ui-monospace,Menlo,monospace;font-size:14px;color:#7fd6a0}
  .ttl{font-size:13px;color:#e5e9f0;margin-top:1px}
  .dest{color:#8b93a1;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .scans{font-size:12px;color:#c9a227;white-space:nowrap;text-align:right;line-height:1.35}
  .scans b{display:block;color:#e5c04a;font-weight:600}
  .actions{display:flex;gap:6px;flex-wrap:wrap}
  .msg{padding:11px 14px;border-radius:8px;font-size:13.5px;margin-bottom:16px;display:none}
  .msg.ok{background:#12301f;color:#7fd6a0;border:1px solid #1e4a30;display:block}
  .msg.err{background:#331519;color:#ff8ba0;border:1px solid #4d2028;display:block}
  .msg.wait{background:#1a2333;color:#9dbaf0;border:1px solid #27354d;display:block}
  .empty{color:#6b7280;font-size:13.5px;padding:8px 0}
  .modal{position:fixed;inset:0;background:rgba(6,8,12,.86);display:none;
         place-items:center;padding:20px;z-index:10;overflow:auto}
  .modal.on{display:grid}
  .modal .box{background:#171a21;border:1px solid #242832;border-radius:14px;
              padding:26px;text-align:center;max-width:380px;width:100%}
  .modal canvas{background:#fff;border-radius:10px;padding:12px;width:100%;max-width:280px;height:auto;
                image-rendering:pixelated}
  .modal .short{font-family:ui-monospace,monospace;font-size:13px;color:#8b93a1;margin:14px 0 18px;
                word-break:break-all}
  .modal .btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .hint{color:#6b7280;font-size:12px;margin-top:9px}
  .big{display:flex;gap:26px;justify-content:center;margin:4px 0 20px}
  .big div{text-align:center}
  .big b{display:block;font-size:26px;font-weight:600;color:#e5e9f0}
  .big span{font-size:11.5px;color:#8b93a1}
  .bars{display:flex;align-items:flex-end;gap:4px;height:70px;margin-bottom:6px}
  .bars i{flex:1;background:#4d7cfe;border-radius:2px;min-height:2px;opacity:.85}
  .bl{display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:18px}
  .kv{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;color:#b8c0cf}
  .stitle{font-size:12px;color:#8b93a1;text-align:left;margin:14px 0 4px}
  .test{display:inline-block;margin-top:10px;font-size:12.5px;color:#4d7cfe;text-decoration:none}
  .test:hover{text-decoration:underline}
  .warn{font-size:12.5px;color:#ff8ba0;margin-top:10px}
  .cab{font-family:ui-monospace,monospace;font-size:11.5px;color:#6b7280;word-break:break-all;margin-top:3px}
  .sep{border-top:1px solid #242832;margin:18px 0 14px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(224px,1fr));gap:12px}
  .tile{background:#171a21;border:1px solid #242832;border-radius:12px;padding:16px 16px 14px;
        text-align:left;cursor:pointer;color:#e5e9f0;font-family:inherit;font-size:14px;
        display:flex;flex-direction:column;gap:5px;transition:border-color .12s,background .12s}
  .tile:hover{background:#1c202a;border-color:#39404f}
  .tile b{font-size:15px;font-weight:600}
  .tile span{color:#8b93a1;font-size:12.5px;line-height:1.45}
  .tile i{font-style:normal;color:#4d7cfe;font-size:12px;font-weight:600}
  .back{display:inline-flex;align-items:center;gap:7px;background:transparent;border:0;
        color:#8b93a1;padding:0;margin-bottom:16px;font-size:13.5px;cursor:pointer;font-family:inherit}
  .back:hover{color:#e5e9f0;background:transparent}
  .hide{display:none}
  .grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:6px}
  .stat{background:#0f1115;border:1px solid #242832;border-radius:10px;padding:14px}
  .stat b{display:block;font-size:24px;font-weight:600;line-height:1.2}
  .stat span{font-size:12px;color:#8b93a1}
  .pick{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #22262f}
  .pick:last-child{border-bottom:0}
  .pick input{width:auto}
  .pick label{margin:0;color:#e5e9f0;font-size:13.5px;cursor:pointer;flex:1}
  .pick label em{font-style:normal;color:#8b93a1}
  textarea{width:100%;min-height:280px;background:#0f1115;border:1px solid #2a2f3a;
           border-radius:8px;color:#e5e9f0;padding:12px 13px;font-size:14px;
           font-family:ui-monospace,Menlo,monospace;line-height:1.5;outline:none;resize:vertical}
  textarea:focus{border-color:#4d7cfe}
  .syntax{background:#0f1115;border:1px solid #242832;border-radius:8px;padding:12px 14px;
          font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:#8b93a1;
          line-height:1.6;white-space:pre;overflow-x:auto;margin-top:10px}
  .pay{max-width:158px}
  .pay input{padding:7px 10px;font-size:13px}
  .paylab{font-size:11px;color:#6b7280;margin-bottom:4px}
  .tag{font-size:11px;padding:2px 7px;border-radius:5px;margin-left:7px;white-space:nowrap}
  .tag.over{background:#331519;color:#ff8ba0}
  .tag.soon{background:#33280f;color:#e5c04a}
  .tag.kind{background:#1a2333;color:#9dbaf0}
  .tag.sold{background:#12301f;color:#7fd6a0}
  .tag.own{background:#2a1f3d;color:#c7a6ff}
  .tag.blk{background:#331519;color:#ff8ba0}
  .bulk select{width:auto;padding:8px 11px;font-size:14px}
  .logrow{display:flex;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid #22262f;text-align:left}
  .logrow span{color:#8b93a1;white-space:nowrap}
  .logrow b{font-weight:500;color:#e5e9f0;word-break:break-all}
  .filter{margin-bottom:6px}
  input[type=file]{display:none}
  .chk{display:flex;align-items:center;gap:8px;color:#8b93a1;font-size:13px;margin-top:12px}
  .chk input{width:auto}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
  button.chip{background:#0f1115;border:1px solid #2a2f3a;color:#b8c0cf;
              padding:6px 12px;font-size:12.5px;border-radius:999px}
  button.chip:hover{background:#1d212a}
  button.chip.on{background:#4d7cfe;border-color:#4d7cfe;color:#fff}
  .bulk{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 8px}
  .bulk #moveTo{flex:1;min-width:160px;padding:8px 11px;font-size:14px}
  .selbox{width:auto;flex:0 0 auto;transform:scale(1.2)}
  .ftag{font-size:11px;padding:2px 7px;border-radius:5px;margin-left:7px;
        background:#1a2333;color:#9dbaf0;white-space:nowrap;font-family:inherit}
  .vc2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px}
  .vc2 input[type=color]{height:46px;padding:4px}
  textarea.short{min-height:84px;font-family:inherit;font-size:15px}
  .note{background:#1a2333;border:1px solid #27354d;color:#9dbaf0;border-radius:8px;
        padding:10px 13px;font-size:13px;margin-bottom:14px}
  canvas.prev{display:block;width:100%;max-width:460px;height:auto;margin:14px 0 4px;
              border-radius:10px;cursor:crosshair;background:
              repeating-conic-gradient(#1b1f28 0% 25%,#15181f 0% 50%) 50%/16px 16px}
  .scroll{max-height:420px;overflow:auto;border-top:1px solid #22262f;border-bottom:1px solid #22262f}
`;

// ─────────────────── Словник перекладів ───────────────────

const I18N_JS = `
const DICT = {
  uk: {
    "login.title": "Вхід",
    "login.sub": "Введіть адмін-токен",
    "login.token": "Токен",
    "login.btn": "Увійти",
    "app.title": "QR-посилання",
    "nav.overview": "Огляд",
    "nav.overview_d": "Скільки кодів, клієнтів і сканувань усього",
    "nav.create": "Створити QR-код",
    "nav.create_d": "Нове посилання з адресою призначення. Тут же конвертер Google-відгуків",
    "nav.reserve": "Відкладені коди",
    "nav.reserve_d": "Створити порожні коди наперед і надрукувати QR до появи клієнта",
    "nav.free": "Вільні коди",
    "nav.free_d": "Надруковані, але ще не налаштовані — папки, призначення адреси",
    "nav.live": "Робочі посилання",
    "nav.live_d": "Усе, що вже кудись веде: статистика, QR, зміна адреси",
    "nav.newclient": "Новий кабінет",
    "nav.newclient_d": "Створити клієнту сторінку зі статистикою",
    "nav.clients": "Клієнти",
    "nav.clients_d": "Кабінети, оплата, зміна посилання",
    "nav.backup": "Резервна копія",
    "nav.backup_d": "Зберегти або відновити всі посилання та клієнтів",
    "nav.menu": "Меню за QR",
    "nav.menu_d": "Створити або змінити меню, на яке веде код",
    "mn.code": "Код, на якому стоїть меню",
    "mn.title": "Назва закладу",
    "mn.note": "Підзаголовок",
    "mn.note_ph": "адреса, телефон, години роботи",
    "mn.text": "Меню",
    "mn.load": "Завантажити",
    "mn.save": "Зберегти меню",
    "mn.preview": "Переглянути",
    "mn.del": "Видалити меню",
    "mn.saved": "Меню збережено:",
    "mn.deleted": "Меню видалено",
    "mn.none": "Меню ще немає — заповніть поля і збережіть",
    "mn.list": "Наявні меню",
    "mn.empty": "Поки жодного меню.",
    "mn.hint": "Рядок з # — це розділ. Далі: назва | ціна | опис | вага | посилання на фото. Усе після ціни необовʼязкове і в будь-якому порядку.",
    "mn.del_confirm": "Видалити меню для /{c}? Код залишиться, але вестиме на заглушку.",
    "err.bad_menu": "Не вдалося прочитати меню",
    "mn.theme": "Оформлення",
    "mn.th_cream": "Кремове",
    "mn.th_light": "Світле",
    "mn.th_dark": "Темне",
    "mn.th_green": "Зелене",
    "mn.th_wine": "Винне",
    "mn.bg": "Фонова картинка",
    "mn.bg_ph": "посилання або завантажте файл",
    "mn.bgup": "Фон",
    "mn.en": "Англійська версія",
    "mn.en_hint": "Заповнюйте, лише якщо потрібна друга мова. Порожньо — перемикача не буде.",
    "mn.photo": "Завантажити фото",
    "mn.photo_hint": "Фото можна не вантажити, а просто вставити посилання на картинку.",
    "mn.uploaded": "Фото додано, посилання вставлено в меню",
    "st.r2": "сховище фото підключене",
    "err.no_r2": "Сховище фото не підключене (біндінг IMG)",
    "err.too_big": "Файл більший за 12 МБ",
    "err.empty_file": "Порожній файл",
    "kind.none": "Без типу",
    "kind.review": "Відгук",
    "kind.tip": "Чайові",
    "kind.link": "Посилання",
    "kind.vcard": "Візитка",
    "res.kind": "Тип партії (для самоактивації)",
    "res.kind_none": "Без типу — налаштовую сам",
    "ow.sold": "продано",
    "ow.owner": "власник",
    "ow.blocked": "заблоковано",
    "ow.mark_sold": "Продано",
    "ow.unmark": "Скасувати продаж",
    "ow.apply_kind": "Задати тип",
    "ow.kind_keep": "— тип —",
    "ow.marked": "Оновлено кодів:",
    "ow.no_kind": "Увага: у частини кодів немає типу — покупець побачить «Незабаром», доки ви не задасте тип.",
    "ow.history": "Історія",
    "ow.reset": "Скинути власника",
    "ow.reset_confirm": "Скинути власника /{c}? Його посилання для змін перестане працювати, картку можна буде активувати знову.",
    "ow.reset_done": "Власника скинуто — код знову чекає активації",
    "ow.block": "Заблокувати",
    "ow.unblock": "Розблокувати",
    "ow.block_confirm": "Заблокувати /{c}? Замість сторінки відкриватиметься «тимчасово недоступно».",
    "ow.blocked_done": "Код заблоковано",
    "ow.unblocked_done": "Код розблоковано",
    "ow.log_empty": "Змін ще не було.",
    "ow.who_admin": "адмін",
    "ow.who_owner": "власник",
    "ow.hint": "Тип + «Продано» = покупець налаштує картку сам, просто відсканувавши її.",
    "nav.vcard": "Візитки (vCard)",
    "nav.vcard_d": "Сторінка-візитка з кнопкою «Зберегти контакт» — для NFC і QR",
    "vc.h2": "Візитка",
    "vc.code": "Код (візитка стане на нього)",
    "vc.load": "Завантажити",
    "vc.name": "Імʼя та прізвище *",
    "vc.title": "Посада",
    "vc.org": "Компанія",
    "vc.phone": "Телефон",
    "vc.phone2": "Другий телефон",
    "vc.email": "Email",
    "vc.site": "Сайт",
    "vc.address": "Адреса",
    "vc.social": "Месенджери та соцмережі",
    "vc.telegram": "Telegram (@нік)",
    "vc.viber": "Viber (номер)",
    "vc.whatsapp": "WhatsApp (номер)",
    "vc.instagram": "Instagram (@нік)",
    "vc.facebook": "Facebook (нік або посилання)",
    "vc.tiktok": "TikTok (@нік)",
    "vc.about": "Коротко про себе",
    "vc.photo": "Фото",
    "vc.photo_btn": "Завантажити фото",
    "vc.theme": "Тема",
    "vc.dark": "Темна",
    "vc.light": "Світла",
    "vc.accent": "Акцентний колір",
    "vc.save": "Зберегти візитку",
    "vc.preview": "Відкрити сторінку",
    "vc.vcf": "Скачати .vcf",
    "vc.del": "Видалити візитку",
    "vc.saved": "Візитку збережено:",
    "vc.deleted": "Візитку видалено",
    "vc.none": "На цьому коді ще немає візитки — заповни й збережи",
    "vc.del_confirm": "Видалити візитку з /{c}? Код залишиться і вестиме на заглушку.",
    "vc.list": "Наявні візитки",
    "vc.empty": "Поки жодної візитки.",
    "vc.hint": "Порожні поля не показуються. Телефони можна вводити як 099…, +380… — формат виправиться сам. Порожнє поле коду — візьму перший вільний.",
    "vc.link": "Візитка",
    "st.weak": "ADMIN_TOKEN закороткий — зроби 32+ символи",
    "err.bad_url": "Адреса має починатися з http:// або https://",
    "err.bad_image": "Це не картинка (потрібен JPG, PNG, WebP або GIF)",
    "err.too_many": "Забагато невдалих спроб. Зачекай 15 хвилин",
    "bk.extra": "меню й візиток:",
    "nav.cards": "Картки з QR",
    "nav.cards_d": "Шаблон картки + коди → готові PDF для друку",
    "cd.tpl_h2": "Шаблони карток",
    "cd.tpl_empty": "Шаблонів поки немає — завантаж картинку картки.",
    "cd.name": "Назва шаблону",
    "cd.name_ph": "Google-відгук 90 мм",
    "cd.upload": "Завантажити картинку",
    "cd.new": "Новий шаблон",
    "cd.w": "Ширина, мм",
    "cd.h": "Висота, мм",
    "cd.x": "QR зліва, %",
    "cd.y": "QR зверху, %",
    "cd.s": "Розмір QR, % ширини",
    "cd.caption": "Дрібний підпис коду під QR",
    "cd.prev_hint": "Клікни на превʼю — центр QR стане в це місце. Точно — цифрами. Старий QR на картинці замалюється білим.",
    "cd.save": "Зберегти шаблон",
    "cd.saved": "Шаблон збережено",
    "cd.pick": "Вибрати",
    "cd.editing": "редагується",
    "cd.del_confirm": "Видалити шаблон «{n}»?",
    "cd.need_tpl": "Спершу вибери або збережи шаблон",
    "cd.gen_h2": "Генерація PDF",
    "cd.pdf": "Один PDF (сторінка = картка)",
    "cd.zip": "ZIP з окремими PDF",
    "cd.gen_hint": "QR векторний, чорний 100% K. Сторінка PDF = розмір картки, без вильотів.",
    "cd.working": "Генерую…",
    "cd.packing": "Пакую ZIP…",
    "cd.done": "Готово, карток:",
    "cd.lib_fail": "Не вдалося завантажити бібліотеку PDF. Перевір інтернет і онови сторінку.",
    "err.need_img": "Завантаж картинку шаблону",
    "nav.print": "Друк QR",
    "nav.print_d": "Вибрати коди і надрукувати аркуш із QR та підписами",
    "nav.back": "← До меню",
    "ov.codes": "кодів усього",
    "ov.free": "вільних",
    "ov.clients": "клієнтів",
    "ov.scans": "унікальних сканувань",
    "ov.top": "Найбільше сканувань",
    "pr.hint": "Відфільтруй за міткою, папкою чи кодом і познач потрібні. Відкриється вікно друку з QR і підписами.",
    "pr.all": "Позначити всі",
    "pr.none": "Зняти позначки",
    "pr.go": "Друкувати",
    "pr.empty": "Не позначено жодного коду",
    "pr.title": "QR-коди · dflust",
    "st.stats_on": "статистика увімкнена",
    "st.no_d1": "база не підключена",
    "st.places": "Places API активний",
    "st.no_qr": "генератор QR не завантажився",
    "conv.h2": "Google-відгук із посилання на карти",
    "conv.label": "Вставте посилання на заклад",
    "conv.btn": "Перетворити",
    "conv.busy": "Шукаю…",
    "conv.wait": "Розгортаю посилання…",
    "conv.test": "Перевірити посилання →",
    "conv.done": "Готово",
    "conv.safe": "Формат стійкий до застосунку Карт.",
    "conv.unsafe": "Застосунок Карт може перехопити — перевірте сканером.",
    "src.ready": "уже готове посилання",
    "src.placeid": "Place ID",
    "src.ftid": "ідентифікатор карт",
    "src.cid": "через CID",
    "src.places_api": "Places API",
    "new.h2": "Нове посилання",
    "new.code": "Код",
    "new.code_ph": "порожньо — згенерую",
    "new.url": "Куди веде",
    "new.url_ph": "порожньо — буде заглушка",
    "new.title": "Назва закладу",
    "new.title_ph": "Chili Pizza",
    "new.owner": "Клієнт",
    "new.owner_none": "— без клієнта —",
    "new.owner_ph": "почніть вводити назву",
    "new.btn": "Створити",
    "new.hint": "Наявний код + нова адреса = заміна цілі.",
    "res.count": "Скільки",
    "res.batch": "Мітка партії",
    "res.batch_ph": "наприклад, друк-1",
    "res.btn": "Зарезервувати коди",
    "res.hint": "Створить порожні коди із заглушкою (до 200 за раз). З міткою — одразу відкриється друк цієї партії.",
    "res.done": "Зарезервовано кодів:",
    "res.created_draft": "Код створено, поки заглушка",
    "list.draft": "не налаштовано",
    "b.setup": "Налаштувати",
    "list.h2": "Усі посилання",
    "list.filter_ph": "Пошук за кодом, назвою, папкою або адресою",
    "list.nomatch": "Нічого не знайдено.",
    "list.loading": "Завантажую…",
    "list.empty": "Поки жодного посилання.",
    "list.export": "Вивантажити всю статистику у CSV",
    "fd.all": "Усі",
    "fd.none": "Без папки",
    "fd.folder": "Папка",
    "fd.move": "Перемістити позначені",
    "fd.move_ph": "назва папки",
    "fd.pick_all": "Позначити всі",
    "fd.need_sel": "Позначте хоча б один код",
    "fd.moved": "Переміщено:",
    "fd.hint": "Познач коди, впиши папку й натисни «Перемістити». Порожня назва — прибрати з папки.",
    "fd.defaults": "Резерв|Замовлено друк|Надруковано",
    "cl.h2": "Клієнти",
    "cl.name": "Назва",
    "cl.name_ph": "Chili Pizza",
    "cl.add": "Створити кабінет",
    "cl.empty": "Кабінетів поки немає.",
    "cl.copy": "Копіювати посилання",
    "cl.hint": "Клієнт бачить лише свої посилання та статистику, змінити нічого не може.",
    "cl.paid": "Оплачено до",
    "cl.overdue": "прострочено",
    "cl.soon": "скоро",
    "cl.saved": "Збережено",
    "cl.rotate": "Новий лінк",
    "cl.rotate_confirm": "Створити нове посилання на кабінет для «{n}»? Старе одразу перестане працювати.",
    "cl.rotated": "Посилання на кабінет оновлено",
    "bk.h2": "Резервна копія",
    "bk.save": "Зберегти копію",
    "bk.restore": "Відновити з файлу",
    "bk.overwrite": "Перезаписувати наявні коди",
    "bk.hint": "У файлі — усі посилання, папки, клієнти та їхні кабінети. Зберігай раз на місяць.",
    "bk.confirm": "Залити дані з цього файлу?",
    "bk.done": "Відновлено (посилань / клієнтів):",
    "bk.bad": "Файл не схожий на резервну копію",
    "mg.btn": "Оновити індекс",
    "mg.done": "Оновлено кодів:",
    "mg.left": "залишилось, натисни ще раз:",
    "cl.confirm": "Видалити кабінет «{n}»? Посилання залишаться, але від'єднаються.",
    "cl.deleted": "Кабінет видалено",
    "cl.created": "Кабінет створено:",
    "b.qr": "QR",
    "b.stats": "Статистика",
    "b.copy": "Копіювати",
    "b.copied": "Скопійовано",
    "b.del": "Видалити",
    "b.close": "Закрити",
    "b.png": "Завантажити PNG",
    "b.copy_addr": "Копіювати адресу",
    "b.export": "Вивантажити CSV",
    "b.logout": "Вийти",
    "del.confirm": "Видалити /{c}? QR-коди перестануть працювати.",
    "del.done": "Видалено:",
    "qr.fail": "Генератор QR не завантажився. Оновіть сторінку; адресу нижче можна скопіювати.",
    "qr.draw_fail": "Помилка малювання:",
    "s.counting": "Рахую…",
    "s.unique": "унікальних",
    "s.total": "усього сканувань",
    "s.today": "за добу",
    "s.daily": "За днями (стовпчик — усі сканування)",
    "s.countries": "Країни",
    "s.devices": "Пристрої",
    "s.nodata": "Немає даних",
    "s.of": "унік. з",
    "cab.title": "Статистика",
    "cab.sub": "Оновлюється автоматично · лише перегляд",
    "cab.h2": "Ваші QR-коди",
    "cab.invalid": "Посилання недійсне",
    "cab.invalid_hint": "Перевірте адресу кабінету або запитайте нову.",
    "cab.empty": "Поки жодного QR-коду.",
    "cab.export": "Вивантажити все у CSV",
    "err.unauthorized": "Невірний токен",
    "err.forbidden": "Немає доступу",
    "err.need_url": "Вкажіть адресу призначення",
    "err.need_code": "Вкажіть код",
    "err.need_name": "Вкажіть назву клієнта",
    "err.no_such_client": "Такого клієнта немає у списку",
    "err.bad_backup": "Файл не схожий на резервну копію",
    "err.need_client": "Клієнта не знайдено",
    "err.need_post": "Невірний запит",
    "err.bad_code": "Код: лише латиниця, цифри, дефіс",
    "err.reserved_code": "Цей код зарезервовано системою",
    "err.empty_link": "Порожнє посилання",
    "err.no_db": "База не підключена",
    "err.resolve_failed": "Не вдалося визначити заклад. Візьміть посилання через кнопку «Поділитися» в картці місця.",
    "err.apple_maps": "Це посилання з Apple Карт — потрібне посилання з Google Карт.",
    "err.generic": "Помилка"
  },
  en: {
    "login.title": "Sign in",
    "login.sub": "Enter the admin token",
    "login.token": "Token",
    "login.btn": "Sign in",
    "app.title": "QR links",
    "nav.overview": "Overview",
    "nav.overview_d": "How many codes, clients and scans in total",
    "nav.create": "Create a QR code",
    "nav.create_d": "A new link with a destination. The Google review converter lives here too",
    "nav.reserve": "Reserved codes",
    "nav.reserve_d": "Create empty codes up front and print the QR before a client shows up",
    "nav.free": "Unassigned codes",
    "nav.free_d": "Printed but not configured yet — folders, give them an address",
    "nav.live": "Working links",
    "nav.live_d": "Everything that already leads somewhere: analytics, QR, address changes",
    "nav.newclient": "New portal",
    "nav.newclient_d": "Give a client their own analytics page",
    "nav.clients": "Clients",
    "nav.clients_d": "Portals, payment dates, link rotation",
    "nav.backup": "Backup",
    "nav.backup_d": "Save or restore every link and client",
    "nav.menu": "QR menu",
    "nav.menu_d": "Create or edit the menu a code points to",
    "mn.code": "Code the menu sits on",
    "mn.title": "Place name",
    "mn.note": "Subtitle",
    "mn.note_ph": "address, phone, opening hours",
    "mn.text": "Menu",
    "mn.load": "Load",
    "mn.save": "Save the menu",
    "mn.preview": "Preview",
    "mn.del": "Delete the menu",
    "mn.saved": "Menu saved:",
    "mn.deleted": "Menu deleted",
    "mn.none": "No menu yet — fill the fields and save",
    "mn.list": "Existing menus",
    "mn.empty": "No menus yet.",
    "mn.hint": "A line starting with # is a section. Then: name | price | description | weight | photo link. Everything after the price is optional and order does not matter.",
    "mn.del_confirm": "Delete the menu for /{c}? The code stays but falls back to the placeholder.",
    "err.bad_menu": "Could not read the menu",
    "mn.theme": "Look",
    "mn.th_cream": "Cream",
    "mn.th_light": "Light",
    "mn.th_dark": "Dark",
    "mn.th_green": "Green",
    "mn.th_wine": "Wine",
    "mn.bg": "Background image",
    "mn.bg_ph": "a link, or upload a file",
    "mn.bgup": "Background",
    "mn.en": "English version",
    "mn.en_hint": "Fill this only if a second language is needed. Leave empty and no switch appears.",
    "mn.photo": "Upload a photo",
    "mn.photo_hint": "You can skip the upload and paste a link to an image instead.",
    "mn.uploaded": "Photo added, the link is in the menu",
    "st.r2": "photo storage connected",
    "err.no_r2": "Photo storage is not connected (IMG binding)",
    "err.too_big": "The file is larger than 12 MB",
    "err.empty_file": "Empty file",
    "kind.none": "No type",
    "kind.review": "Review",
    "kind.tip": "Tips",
    "kind.link": "Link",
    "kind.vcard": "Business card",
    "res.kind": "Batch type (for self-activation)",
    "res.kind_none": "No type — I set it up myself",
    "ow.sold": "sold",
    "ow.owner": "owner",
    "ow.blocked": "blocked",
    "ow.mark_sold": "Sold",
    "ow.unmark": "Undo sale",
    "ow.apply_kind": "Set type",
    "ow.kind_keep": "— type —",
    "ow.marked": "Codes updated:",
    "ow.no_kind": "Note: some codes have no type — buyers will see Coming soon until you set one.",
    "ow.history": "History",
    "ow.reset": "Reset owner",
    "ow.reset_confirm": "Reset the owner of /{c}? Their edit link stops working and the card can be activated again.",
    "ow.reset_done": "Owner reset — the code is waiting for activation again",
    "ow.block": "Block",
    "ow.unblock": "Unblock",
    "ow.block_confirm": "Block /{c}? Visitors will see a temporarily unavailable page.",
    "ow.blocked_done": "Code blocked",
    "ow.unblocked_done": "Code unblocked",
    "ow.log_empty": "No changes yet.",
    "ow.who_admin": "admin",
    "ow.who_owner": "owner",
    "ow.hint": "Type + Sold = the buyer sets the card up themselves just by scanning it.",
    "nav.vcard": "Business cards (vCard)",
    "nav.vcard_d": "A contact page with a Save contact button — for NFC and QR",
    "vc.h2": "Business card",
    "vc.code": "Code (the card goes on it)",
    "vc.load": "Load",
    "vc.name": "Full name *",
    "vc.title": "Job title",
    "vc.org": "Company",
    "vc.phone": "Phone",
    "vc.phone2": "Second phone",
    "vc.email": "Email",
    "vc.site": "Website",
    "vc.address": "Address",
    "vc.social": "Messengers and social",
    "vc.telegram": "Telegram (@handle)",
    "vc.viber": "Viber (number)",
    "vc.whatsapp": "WhatsApp (number)",
    "vc.instagram": "Instagram (@handle)",
    "vc.facebook": "Facebook (handle or link)",
    "vc.tiktok": "TikTok (@handle)",
    "vc.about": "Short bio",
    "vc.photo": "Photo",
    "vc.photo_btn": "Upload photo",
    "vc.theme": "Theme",
    "vc.dark": "Dark",
    "vc.light": "Light",
    "vc.accent": "Accent colour",
    "vc.save": "Save card",
    "vc.preview": "Open page",
    "vc.vcf": "Download .vcf",
    "vc.del": "Delete card",
    "vc.saved": "Card saved:",
    "vc.deleted": "Card deleted",
    "vc.none": "No card on this code yet — fill it in and save",
    "vc.del_confirm": "Delete the card from /{c}? The code stays and shows the placeholder.",
    "vc.list": "Existing cards",
    "vc.empty": "No cards yet.",
    "vc.hint": "Empty fields are hidden. Phones can be typed as 099… or +380… — the format is fixed automatically. Empty code — the first free one is used.",
    "vc.link": "Business card",
    "st.weak": "ADMIN_TOKEN is too short — use 32+ characters",
    "err.bad_url": "The address must start with http:// or https://",
    "err.bad_image": "Not an image (JPG, PNG, WebP or GIF required)",
    "err.too_many": "Too many failed attempts. Wait 15 minutes",
    "bk.extra": "menus and cards:",
    "nav.cards": "QR cards",
    "nav.cards_d": "Card template + codes → print-ready PDFs",
    "cd.tpl_h2": "Card templates",
    "cd.tpl_empty": "No templates yet — upload a card image.",
    "cd.name": "Template name",
    "cd.name_ph": "Google review 90 mm",
    "cd.upload": "Upload image",
    "cd.new": "New template",
    "cd.w": "Width, mm",
    "cd.h": "Height, mm",
    "cd.x": "QR from left, %",
    "cd.y": "QR from top, %",
    "cd.s": "QR size, % of width",
    "cd.caption": "Small code caption under the QR",
    "cd.prev_hint": "Click the preview to centre the QR there. Fine-tune with the numbers. An old QR in the image gets painted over.",
    "cd.save": "Save template",
    "cd.saved": "Template saved",
    "cd.pick": "Select",
    "cd.editing": "editing",
    "cd.del_confirm": "Delete template {n}?",
    "cd.need_tpl": "Select or save a template first",
    "cd.gen_h2": "PDF generation",
    "cd.pdf": "One PDF (page = card)",
    "cd.zip": "ZIP of separate PDFs",
    "cd.gen_hint": "Vector QR, 100% K black. PDF page = card size, no bleed.",
    "cd.working": "Generating…",
    "cd.packing": "Packing ZIP…",
    "cd.done": "Done, cards:",
    "cd.lib_fail": "Could not load the PDF library. Check the connection and reload.",
    "err.need_img": "Upload a template image",
    "nav.print": "Print QR",
    "nav.print_d": "Pick codes and print a sheet with QR codes and captions",
    "nav.back": "← Back to menu",
    "ov.codes": "codes in total",
    "ov.free": "unassigned",
    "ov.clients": "clients",
    "ov.scans": "unique scans",
    "ov.top": "Most scanned",
    "pr.hint": "Filter by batch label, folder or code and tick what you need. A print window opens with the QR codes and captions.",
    "pr.all": "Select all",
    "pr.none": "Clear",
    "pr.go": "Print",
    "pr.empty": "No codes selected",
    "pr.title": "QR codes · dflust",
    "st.stats_on": "analytics on",
    "st.no_d1": "database not connected",
    "st.places": "Places API active",
    "st.no_qr": "QR generator failed to load",
    "conv.h2": "Google review link from a Maps URL",
    "conv.label": "Paste a link to the place",
    "conv.btn": "Convert",
    "conv.busy": "Searching…",
    "conv.wait": "Expanding the link…",
    "conv.test": "Test the link →",
    "conv.done": "Done",
    "conv.safe": "This format resists the Maps app.",
    "conv.unsafe": "The Maps app may intercept it — test with a scanner.",
    "src.ready": "already a review link",
    "src.placeid": "Place ID",
    "src.ftid": "Maps identifier",
    "src.cid": "via CID",
    "src.places_api": "Places API",
    "new.h2": "New link",
    "new.code": "Code",
    "new.code_ph": "leave empty to generate",
    "new.url": "Destination",
    "new.url_ph": "leave empty for a placeholder",
    "new.title": "Place name",
    "new.title_ph": "Chili Pizza",
    "new.owner": "Client",
    "new.owner_none": "— no client —",
    "new.owner_ph": "start typing a name",
    "new.btn": "Create",
    "new.hint": "Existing code + new address = replace the target.",
    "res.count": "How many",
    "res.batch": "Batch label",
    "res.batch_ph": "e.g. print-1",
    "res.btn": "Reserve codes",
    "res.hint": "Creates empty codes with a placeholder page (up to 200 at once). With a label, the print view for that batch opens right away.",
    "res.done": "Codes reserved:",
    "res.created_draft": "Code created, placeholder for now",
    "list.draft": "not configured",
    "b.setup": "Configure",
    "list.h2": "All links",
    "list.filter_ph": "Search by code, name, folder or address",
    "list.nomatch": "Nothing found.",
    "list.loading": "Loading…",
    "list.empty": "No links yet.",
    "list.export": "Export all analytics to CSV",
    "fd.all": "All",
    "fd.none": "No folder",
    "fd.folder": "Folder",
    "fd.move": "Move selected",
    "fd.move_ph": "folder name",
    "fd.pick_all": "Select all",
    "fd.need_sel": "Select at least one code",
    "fd.moved": "Moved:",
    "fd.hint": "Tick codes, type a folder and press Move. Empty name removes them from a folder.",
    "fd.defaults": "Reserve|Print ordered|Printed",
    "cl.h2": "Clients",
    "cl.name": "Name",
    "cl.name_ph": "Chili Pizza",
    "cl.add": "Create portal",
    "cl.empty": "No portals yet.",
    "cl.copy": "Copy link",
    "cl.hint": "A client sees only their own links and analytics, and cannot change anything.",
    "cl.paid": "Paid until",
    "cl.overdue": "overdue",
    "cl.soon": "due soon",
    "cl.saved": "Saved",
    "cl.rotate": "New link",
    "cl.rotate_confirm": "Issue a new portal link for {n}? The old one stops working immediately.",
    "cl.rotated": "Portal link updated",
    "bk.h2": "Backup",
    "bk.save": "Save a backup",
    "bk.restore": "Restore from a file",
    "bk.overwrite": "Overwrite existing codes",
    "bk.hint": "The file holds every link, folder, client and portal address. Save one once a month.",
    "bk.confirm": "Load the data from this file?",
    "bk.done": "Restored (links / clients):",
    "bk.bad": "This file is not a backup",
    "mg.btn": "Rebuild index",
    "mg.done": "Codes updated:",
    "mg.left": "remaining, press again:",
    "cl.confirm": "Delete the portal for {n}? Links stay but get unlinked.",
    "cl.deleted": "Portal deleted",
    "cl.created": "Portal created:",
    "b.qr": "QR",
    "b.stats": "Analytics",
    "b.copy": "Copy",
    "b.copied": "Copied",
    "b.del": "Delete",
    "b.close": "Close",
    "b.png": "Download PNG",
    "b.copy_addr": "Copy address",
    "b.export": "Export CSV",
    "b.logout": "Sign out",
    "del.confirm": "Delete /{c}? Printed QR codes will stop working.",
    "del.done": "Deleted:",
    "qr.fail": "The QR generator failed to load. Reload the page; you can copy the address below.",
    "qr.draw_fail": "Drawing error:",
    "s.counting": "Counting…",
    "s.unique": "unique",
    "s.total": "total scans",
    "s.today": "last 24h",
    "s.daily": "By day (bar = all scans)",
    "s.countries": "Countries",
    "s.devices": "Devices",
    "s.nodata": "No data",
    "s.of": "uniq of",
    "cab.title": "Analytics",
    "cab.sub": "Updates automatically · view only",
    "cab.h2": "Your QR codes",
    "cab.invalid": "This link is not valid",
    "cab.invalid_hint": "Check the portal address or request a new one.",
    "cab.empty": "No QR codes yet.",
    "cab.export": "Export everything to CSV",
    "err.unauthorized": "Invalid token",
    "err.forbidden": "Access denied",
    "err.need_url": "Enter a destination address",
    "err.need_code": "Enter a code",
    "err.need_name": "Enter a client name",
    "err.no_such_client": "No such client in the list",
    "err.bad_backup": "This file is not a backup",
    "err.need_client": "Client not found",
    "err.need_post": "Bad request",
    "err.bad_code": "Code: latin letters, digits and hyphen only",
    "err.reserved_code": "This code is reserved by the system",
    "err.empty_link": "Empty link",
    "err.no_db": "Database not connected",
    "err.resolve_failed": "Could not identify the place. Use the Share button in the place card to get the link.",
    "err.apple_maps": "This is an Apple Maps link — a Google Maps link is needed.",
    "err.generic": "Error"
  }
};

let LANG = localStorage.getItem("qr_lang") || "uk";
if (!DICT[LANG]) LANG = "uk";

function t(key, vars) {
  let s = (DICT[LANG] && DICT[LANG][key]) || (DICT.uk && DICT.uk[key]) || key;
  if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
  return s;
}

function errText(code) {
  const k = "err." + code;
  const s = t(k);
  return s === k ? t("err.generic") : s;
}

function applyLang() {
  document.documentElement.lang = LANG;
  const nodes = document.querySelectorAll("[data-i18n]");
  for (let i = 0; i < nodes.length; i++)
    nodes[i].textContent = t(nodes[i].getAttribute("data-i18n"));
  const phs = document.querySelectorAll("[data-ph]");
  for (let i = 0; i < phs.length; i++)
    phs[i].placeholder = t(phs[i].getAttribute("data-ph"));
  const btns = document.querySelectorAll(".langbox button");
  for (let i = 0; i < btns.length; i++)
    btns[i].className = btns[i].getAttribute("data-lang") === LANG ? "on" : "";
}

function initLangSwitch(onChange) {
  const btns = document.querySelectorAll(".langbox button");
  for (let i = 0; i < btns.length; i++) {
    btns[i].onclick = function () {
      LANG = this.getAttribute("data-lang");
      localStorage.setItem("qr_lang", LANG);
      applyLang();
      if (onChange) onChange();
    };
  }
  applyLang();
}
`;

// ─────────────── Спільний JS: QR та утиліти ───────────────

const SHARED_JS = `
const ORIGIN = location.origin;
const $ = id => document.getElementById(id);

function qrReady() { return typeof qrcode === "function"; }

function drawQr(canvas, text, targetPx) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 4, tot = n + q * 2;
  const cell = Math.max(1, Math.round(targetPx / tot));
  const dim = cell * tot;
  canvas.width = dim; canvas.height = dim;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, dim, dim);
  c.fillStyle = "#000000";
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++)
      if (qr.isDark(r, col)) c.fillRect((col + q) * cell, (r + q) * cell, cell, cell);
  return canvas;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function statHtml(s) {
  let h = '<div class="code" style="margin-bottom:14px">/' + esc(s.code) + '</div>';
  h += '<div class="big"><div><b>' + s.unique + '</b><span>' + t("s.unique") + '</span></div>' +
       '<div><b>' + s.total + '</b><span>' + t("s.total") + '</span></div>' +
       '<div><b>' + s.todayUnique + '</b><span>' + t("s.today") + '</span></div></div>';

  if (s.daily && s.daily.length) {
    const max = Math.max.apply(null, s.daily.map(d => d.n).concat([1]));
    h += '<div class="stitle">' + t("s.daily") + '</div><div class="bars">';
    for (const d of s.daily)
      h += '<i style="height:' + Math.round((d.n / max) * 100) + '%" title="' +
           d.day + ": " + d.n + '"></i>';
    h += '</div><div class="bl"><span>' + s.daily[0].day + '</span><span>' +
         s.daily[s.daily.length - 1].day + '</span></div>';
  }

  if (s.geo && s.geo.length) {
    h += '<div class="stitle">' + t("s.countries") + '</div>';
    for (const g of s.geo) h += '<div class="kv"><span>' + esc(g.country) + '</span><span>' + g.n + '</span></div>';
  }
  if (s.devices && s.devices.length) {
    h += '<div class="stitle">' + t("s.devices") + '</div>';
    for (const d of s.devices) h += '<div class="kv"><span>' + esc(d.device) + '</span><span>' + d.n + '</span></div>';
  }
  return h;
}

function todayStr() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function mk(text, fn, extra) {
  const b = document.createElement("button");
  b.className = "ghost" + (extra ? " " + extra : "");
  b.textContent = text;
  b.onclick = fn;
  return b;
}

function show(el, text, kind) {
  el.textContent = text;
  el.className = "msg " + kind;
  if (kind === "ok") setTimeout(() => { el.className = "msg"; }, 6000);
}

// токен іде лише в заголовку Authorization — не в адресі
function authFetch(u, init) {
  init = init || {};
  init.headers = Object.assign({ Authorization: "Bearer " + TOKEN }, init.headers || {});
  return fetch(u, init);
}

function apiUrl(action, params) {
  const u = new URL(ORIGIN + "/api/" + action);
  u.searchParams.set("lang", LANG);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  return u;
}

async function api(action, params) {
  const r = await authFetch(apiUrl(action, params));
  try { return await r.json(); } catch (e) { return { error: "generic" }; }
}

async function apiPost(action, body, params) {
  const r = await authFetch(apiUrl(action, params), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  try { return await r.json(); } catch (e) { return { error: "generic" }; }
}

function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

// файли (бекап, CSV) качаємо через fetch → blob: токен не лишається в «Завантаженнях»
async function download(action, params) {
  const r = await authFetch(apiUrl(action, params));
  if (!r.ok) {
    let e = "generic";
    try { e = (await r.json()).error || e; } catch (x) {}
    alert(errText(e));
    return;
  }
  const cd = r.headers.get("content-disposition") || "";
  const m = cd.match(/filename="([^"]+)"/);
  saveBlob(await r.blob(), m ? m[1] : "download");
}
`;

// ─────────────────────── Адмінка ───────────────────────

const ADMIN_HTML = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR</title>
<script src="/lib/qrcode.js"></script>
<style>${PANEL_CSS}</style>
</head>
<body>
<div class="wrap">

  <div id="login">
    <div class="head">
      <div>
        <h1 data-i18n="login.title"></h1>
        <div class="sub" data-i18n="login.sub"></div>
      </div>
      <div class="langbox">
        <button data-lang="uk">УКР</button><button data-lang="en">ENG</button>
      </div>
    </div>
    <div class="card">
      <div id="loginMsg" class="msg"></div>
      <label data-i18n="login.token"></label>
      <input id="tokenInput" type="password" placeholder="ADMIN_TOKEN">
      <div style="margin-top:14px"><button id="loginBtn" data-i18n="login.btn"></button></div>
    </div>
  </div>

  <div id="app" style="display:none">
    <div class="head">
      <div>
        <h1 data-i18n="app.title"></h1>
        <div class="sub" id="statusLine"></div>
      </div>
      <div class="langbox">
        <button data-lang="uk">УКР</button><button data-lang="en">ENG</button>
      </div>
    </div>

    <div id="msg" class="msg"></div>

    <datalist id="ownerList"></datalist>
    <datalist id="folderList"></datalist>
    <datalist id="codeList"></datalist>

    <!-- ── меню ── -->
    <div id="v-home">
      <div class="tiles">
        <button class="tile" data-go="overview"><b data-i18n="nav.overview"></b><span data-i18n="nav.overview_d"></span></button>
        <button class="tile" data-go="create"><b data-i18n="nav.create"></b><span data-i18n="nav.create_d"></span></button>
        <button class="tile" data-go="reserve"><b data-i18n="nav.reserve"></b><span data-i18n="nav.reserve_d"></span></button>
        <button class="tile" data-go="free"><b data-i18n="nav.free"></b><span data-i18n="nav.free_d"></span><i id="cFree"></i></button>
        <button class="tile" data-go="live"><b data-i18n="nav.live"></b><span data-i18n="nav.live_d"></span><i id="cLive"></i></button>
        <button class="tile" data-go="newclient"><b data-i18n="nav.newclient"></b><span data-i18n="nav.newclient_d"></span></button>
        <button class="tile" data-go="clients"><b data-i18n="nav.clients"></b><span data-i18n="nav.clients_d"></span><i id="cCli"></i></button>
        <button class="tile" data-go="menu"><b data-i18n="nav.menu"></b><span data-i18n="nav.menu_d"></span></button>
        <button class="tile" data-go="vcard"><b data-i18n="nav.vcard"></b><span data-i18n="nav.vcard_d"></span></button>
        <button class="tile" data-go="cards"><b data-i18n="nav.cards"></b><span data-i18n="nav.cards_d"></span></button>
        <button class="tile" data-go="print"><b data-i18n="nav.print"></b><span data-i18n="nav.print_d"></span></button>
        <button class="tile" data-go="backup"><b data-i18n="nav.backup"></b><span data-i18n="nav.backup_d"></span></button>
      </div>
      <div style="margin-top:22px"><button class="ghost" id="logoutBtn" data-i18n="b.logout"></button></div>
    </div>

    <!-- ── огляд ── -->
    <div id="v-overview" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="nav.overview"></h2>
        <div class="grid4">
          <div class="stat"><b id="sCodes">0</b><span data-i18n="ov.codes"></span></div>
          <div class="stat"><b id="sFree">0</b><span data-i18n="ov.free"></span></div>
          <div class="stat"><b id="sCli">0</b><span data-i18n="ov.clients"></span></div>
          <div class="stat"><b id="sScans">0</b><span data-i18n="ov.scans"></span></div>
        </div>
        <div class="stitle" style="margin-top:20px" data-i18n="ov.top"></div>
        <div id="topList"></div>
      </div>
    </div>

    <!-- ── створити ── -->
    <div id="v-create" class="hide">
      <button class="back" data-i18n="nav.back"></button>

      <div class="card">
        <h2 data-i18n="conv.h2"></h2>
        <label data-i18n="conv.label"></label>
        <input id="mapsInput" placeholder="https://maps.app.goo.gl/...">
        <div style="margin-top:12px"><button id="convBtn" data-i18n="conv.btn"></button></div>
        <a id="testLink" class="test" target="_blank" rel="noopener" style="display:none" data-i18n="conv.test"></a>
      </div>

      <div class="card">
        <h2 data-i18n="new.h2"></h2>
        <div class="row">
          <div><label data-i18n="new.code"></label><input id="newCode" data-ph="new.code_ph"></div>
          <div><label data-i18n="new.url"></label><input id="newUrl" data-ph="new.url_ph"></div>
        </div>
        <div class="row">
          <div><label data-i18n="new.title"></label><input id="newTitle" data-ph="new.title_ph"></div>
          <div>
            <label data-i18n="new.owner"></label>
            <input id="newOwner" list="ownerList" data-ph="new.owner_ph" autocomplete="off">
          </div>
        </div>
        <button id="createBtn" data-i18n="new.btn"></button>
        <div class="hint" data-i18n="new.hint"></div>
      </div>
    </div>

    <!-- ── відкладені коди ── -->
    <div id="v-reserve" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="nav.reserve"></h2>
        <div class="row">
          <div style="max-width:140px">
            <label data-i18n="res.count"></label>
            <input id="resCount" type="number" min="1" max="200" value="10">
          </div>
          <div>
            <label data-i18n="res.batch"></label>
            <input id="resTitle" data-ph="res.batch_ph" autocomplete="off">
          </div>
        </div>
        <div class="row">
          <div>
            <label data-i18n="fd.folder"></label>
            <input id="resFolder" list="folderList" data-ph="fd.move_ph" autocomplete="off">
          </div>
          <div>
            <label data-i18n="res.kind"></label>
            <select id="resKind">
              <option value="" data-i18n="res.kind_none"></option>
              <option value="review" data-i18n="kind.review"></option>
              <option value="tip" data-i18n="kind.tip"></option>
              <option value="link" data-i18n="kind.link"></option>
              <option value="vcard" data-i18n="kind.vcard"></option>
            </select>
          </div>
          <div>
            <label data-i18n="new.owner"></label>
            <input id="resOwner" list="ownerList" data-ph="new.owner_ph" autocomplete="off">
          </div>
        </div>
        <button id="reserveBtn" data-i18n="res.btn"></button>
        <div class="hint" data-i18n="res.hint"></div>
      </div>
    </div>

    <!-- ── вільні коди ── -->
    <div id="v-free" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="nav.free"></h2>
        <div class="chips" id="freeFolders"></div>
        <input class="filter" id="freeFilter" data-ph="list.filter_ph" autocomplete="off">
        <div class="bulk">
          <button class="ghost" id="freeAll" data-i18n="fd.pick_all"></button>
          <input id="moveTo" list="folderList" data-ph="fd.move_ph" autocomplete="off">
          <button id="moveBtn" data-i18n="fd.move"></button>
        </div>
        <div class="bulk">
          <select id="bulkKind">
            <option value="-" data-i18n="ow.kind_keep"></option>
            <option value="review" data-i18n="kind.review"></option>
            <option value="tip" data-i18n="kind.tip"></option>
            <option value="link" data-i18n="kind.link"></option>
            <option value="vcard" data-i18n="kind.vcard"></option>
            <option value="" data-i18n="kind.none"></option>
          </select>
          <button class="ghost" id="kindBtn" data-i18n="ow.apply_kind"></button>
          <button class="ghost" id="soldBtn" data-i18n="ow.mark_sold"></button>
          <button class="ghost" id="unsoldBtn" data-i18n="ow.unmark"></button>
        </div>
        <div class="hint" style="margin-bottom:8px"><span data-i18n="fd.hint"></span> <span data-i18n="ow.hint"></span></div>
        <div id="listFree"></div>
      </div>
    </div>

    <!-- ── робочі посилання ── -->
    <div id="v-live" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="nav.live"></h2>
        <input class="filter" id="liveFilter" data-ph="list.filter_ph" autocomplete="off">
        <div id="listLive"></div>
        <div style="margin-top:14px"><button class="ghost" id="exportAll" data-i18n="list.export"></button></div>
      </div>
    </div>

    <!-- ── новий кабінет ── -->
    <div id="v-newclient" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="nav.newclient"></h2>
        <div class="row">
          <div><label data-i18n="cl.name"></label><input id="clientName" data-ph="cl.name_ph"></div>
          <div style="max-width:200px"><label data-i18n="cl.paid"></label><input id="clientPaid" type="date"></div>
        </div>
        <button id="clientAdd" data-i18n="cl.add"></button>
        <div class="hint" data-i18n="cl.hint"></div>
      </div>
    </div>

    <!-- ── клієнти ── -->
    <div id="v-clients" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="cl.h2"></h2>
        <div id="clients"></div>
      </div>
    </div>

    <!-- ── меню ── -->
    <div id="v-menu" class="hide">
      <button class="back" data-i18n="nav.back"></button>

      <div class="card">
        <h2 data-i18n="nav.menu"></h2>
        <div class="row">
          <div>
            <label data-i18n="mn.code"></label>
            <input id="mnCode" list="codeList" autocomplete="off" placeholder="chili">
          </div>
          <div style="max-width:150px;display:flex;align-items:flex-end">
            <button class="ghost" id="mnLoad" data-i18n="mn.load"></button>
          </div>
        </div>
        <div class="row">
          <div><label data-i18n="mn.title"></label><input id="mnTitle" placeholder="Chili Pizza"></div>
          <div><label data-i18n="mn.note"></label><input id="mnNote" data-ph="mn.note_ph"></div>
        </div>
        <div class="row">
          <div style="max-width:210px">
            <label data-i18n="mn.theme"></label>
            <select id="mnTheme">
              <option value="cream" data-i18n="mn.th_cream"></option>
              <option value="light" data-i18n="mn.th_light"></option>
              <option value="dark" data-i18n="mn.th_dark"></option>
              <option value="green" data-i18n="mn.th_green"></option>
              <option value="wine" data-i18n="mn.th_wine"></option>
            </select>
          </div>
          <div>
            <label data-i18n="mn.bg"></label>
            <div style="display:flex;gap:8px">
              <input id="mnBg" data-ph="mn.bg_ph" autocomplete="off">
              <button class="ghost" id="mnBgBtn" data-i18n="mn.bgup"></button>
              <input type="file" id="mnBgFile" accept="image/*">
            </div>
          </div>
        </div>

        <label data-i18n="mn.text"></label>
        <textarea id="mnText" spellcheck="false"></textarea>
        <div class="syntax" id="mnSyntax"></div>
        <div class="hint" data-i18n="mn.hint"></div>
        <div class="actions" style="margin-top:12px">
          <button class="ghost" id="mnPhotoBtn" data-i18n="mn.photo"></button>
          <input type="file" id="mnPhoto" accept="image/*">
        </div>
        <div class="hint" data-i18n="mn.photo_hint"></div>
        <div class="actions" style="margin-top:14px">
          <button id="mnSave" data-i18n="mn.save"></button>
          <button class="ghost" id="mnPreview" data-i18n="mn.preview"></button>
          <button class="ghost danger" id="mnDel" data-i18n="mn.del"></button>
        </div>
      </div>

      <div class="card">
        <h2 data-i18n="mn.en"></h2>
        <div class="row">
          <div><label data-i18n="mn.title"></label><input id="mnTitleEn"></div>
          <div><label data-i18n="mn.note"></label><input id="mnNoteEn"></div>
        </div>
        <label data-i18n="mn.text"></label>
        <textarea id="mnTextEn" spellcheck="false" style="min-height:200px"></textarea>
        <div class="hint" data-i18n="mn.en_hint"></div>
      </div>

      <div class="card">
        <h2 data-i18n="mn.list"></h2>
        <div id="menuList"></div>
      </div>
    </div>

    <!-- ── візитки vCard ── -->
    <div id="v-vcard" class="hide">
      <button class="back" data-i18n="nav.back"></button>

      <div class="card">
        <h2 data-i18n="vc.h2"></h2>
        <div class="row">
          <div>
            <label data-i18n="vc.code"></label>
            <input id="vcCode" list="codeList" autocomplete="off" placeholder="ivan">
          </div>
          <div style="max-width:150px;display:flex;align-items:flex-end">
            <button class="ghost" id="vcLoad" data-i18n="vc.load"></button>
          </div>
        </div>

        <div class="vc2">
          <div><label data-i18n="vc.name"></label><input id="vc_name" autocomplete="off"></div>
          <div><label data-i18n="vc.title"></label><input id="vc_title" autocomplete="off"></div>
          <div><label data-i18n="vc.org"></label><input id="vc_org" autocomplete="off"></div>
          <div><label data-i18n="vc.phone"></label><input id="vc_phone" type="tel" placeholder="+380 99 123 45 67"></div>
          <div><label data-i18n="vc.phone2"></label><input id="vc_phone2" type="tel"></div>
          <div><label data-i18n="vc.email"></label><input id="vc_email" type="email"></div>
          <div><label data-i18n="vc.site"></label><input id="vc_site" placeholder="example.com"></div>
          <div><label data-i18n="vc.address"></label><input id="vc_address" placeholder="Ужгород, вул. Капушанська, 34"></div>
        </div>

        <div class="stitle" data-i18n="vc.social"></div>
        <div class="vc2">
          <div><label data-i18n="vc.telegram"></label><input id="vc_telegram" placeholder="@username"></div>
          <div><label data-i18n="vc.viber"></label><input id="vc_viber" type="tel"></div>
          <div><label data-i18n="vc.whatsapp"></label><input id="vc_whatsapp" type="tel"></div>
          <div><label data-i18n="vc.instagram"></label><input id="vc_instagram" placeholder="@username"></div>
          <div><label data-i18n="vc.facebook"></label><input id="vc_facebook"></div>
          <div><label data-i18n="vc.tiktok"></label><input id="vc_tiktok" placeholder="@username"></div>
        </div>

        <label data-i18n="vc.about"></label>
        <textarea id="vc_about" class="short" maxlength="400"></textarea>

        <div class="vc2" style="margin-top:14px">
          <div>
            <label data-i18n="vc.photo"></label>
            <div style="display:flex;gap:8px">
              <input id="vc_photo" placeholder="/img/…" autocomplete="off">
              <button class="ghost" id="vcPhotoBtn" data-i18n="vc.photo_btn"></button>
              <input type="file" id="vcPhotoFile" accept="image/*">
            </div>
          </div>
          <div>
            <label data-i18n="vc.theme"></label>
            <select id="vc_theme">
              <option value="dark" data-i18n="vc.dark"></option>
              <option value="light" data-i18n="vc.light"></option>
            </select>
          </div>
          <div><label data-i18n="vc.accent"></label><input id="vc_accent" type="color" value="#4d7cfe"></div>
        </div>

        <div class="hint" data-i18n="vc.hint"></div>
        <div class="actions" style="margin-top:14px">
          <button id="vcSave" data-i18n="vc.save"></button>
          <button class="ghost" id="vcPreview" data-i18n="vc.preview"></button>
          <button class="ghost" id="vcVcf" data-i18n="vc.vcf"></button>
          <button class="ghost danger" id="vcDel" data-i18n="vc.del"></button>
        </div>
      </div>

      <div class="card">
        <h2 data-i18n="vc.list"></h2>
        <div id="vcList"></div>
      </div>
    </div>

    <!-- ── картки з QR ── -->
    <div id="v-cards" class="hide">
      <button class="back" data-i18n="nav.back"></button>

      <div class="card">
        <h2 data-i18n="cd.tpl_h2"></h2>
        <div id="tplList"></div>
        <div class="sep"></div>
        <div class="row">
          <div><label data-i18n="cd.name"></label><input id="tpName" data-ph="cd.name_ph" autocomplete="off"></div>
          <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap">
            <button class="ghost" id="tpFileBtn" data-i18n="cd.upload"></button>
            <button class="ghost" id="tpNew" data-i18n="cd.new"></button>
            <input type="file" id="tpFile" accept="image/png,image/jpeg,image/webp">
          </div>
        </div>
        <div class="row">
          <div><label data-i18n="cd.w"></label><input id="tpW" type="number" step="0.1" min="5"></div>
          <div><label data-i18n="cd.h"></label><input id="tpH" type="number" step="0.1" min="5"></div>
        </div>
        <div class="row">
          <div><label data-i18n="cd.x"></label><input id="tpX" type="number" step="0.01"></div>
          <div><label data-i18n="cd.y"></label><input id="tpY" type="number" step="0.01"></div>
          <div><label data-i18n="cd.s"></label><input id="tpS" type="number" step="0.01"></div>
        </div>
        <label class="chk"><input type="checkbox" id="tpCap"><span data-i18n="cd.caption"></span></label>
        <canvas id="tpPrev" class="prev" width="0" height="0"></canvas>
        <div class="hint" data-i18n="cd.prev_hint"></div>
        <div style="margin-top:14px"><button id="tpSave" data-i18n="cd.save"></button></div>
      </div>

      <div class="card">
        <h2 data-i18n="cd.gen_h2"></h2>
        <input class="filter" id="cdFilter" data-ph="list.filter_ph" autocomplete="off">
        <div class="actions" style="margin-bottom:10px">
          <button class="ghost" id="cdAll" data-i18n="pr.all"></button>
          <button class="ghost" id="cdNone" data-i18n="pr.none"></button>
        </div>
        <div class="scroll"><div id="cdList"></div></div>
        <div class="actions" style="margin-top:14px">
          <button id="cdPdf" data-i18n="cd.pdf"></button>
          <button class="ghost" id="cdZip" data-i18n="cd.zip"></button>
        </div>
        <div class="hint" data-i18n="cd.gen_hint"></div>
      </div>
    </div>

    <!-- ── друк QR ── -->
    <div id="v-print" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="nav.print"></h2>
        <input class="filter" id="pickFilter" data-ph="list.filter_ph" autocomplete="off">
        <div class="actions" style="margin-bottom:10px">
          <button class="ghost" id="pickAll" data-i18n="pr.all"></button>
          <button class="ghost" id="pickNone" data-i18n="pr.none"></button>
        </div>
        <div id="pickList"></div>
        <div style="margin-top:14px"><button id="printGo" data-i18n="pr.go"></button></div>
        <div class="hint" data-i18n="pr.hint"></div>
      </div>
    </div>

    <!-- ── резервна копія ── -->
    <div id="v-backup" class="hide">
      <button class="back" data-i18n="nav.back"></button>
      <div class="card">
        <h2 data-i18n="bk.h2"></h2>
        <div class="actions">
          <button class="ghost" id="backupBtn" data-i18n="bk.save"></button>
          <button class="ghost" id="restoreBtn" data-i18n="bk.restore"></button>
          <button class="ghost" id="migrateBtn" data-i18n="mg.btn"></button>
          <input type="file" id="restoreFile" accept=".json,application/json">
        </div>
        <label class="chk"><input type="checkbox" id="bkOverwrite"><span data-i18n="bk.overwrite"></span></label>
        <div class="hint" data-i18n="bk.hint"></div>
      </div>
    </div>

  </div>
</div>

<div class="modal" id="modal">
  <div class="box">
    <canvas id="qrCanvas"></canvas>
    <div id="qrFallback" class="warn" style="display:none"></div>
    <div class="short" id="qrShort"></div>
    <div class="btns">
      <button id="dlBtn" data-i18n="b.png"></button>
      <button class="ghost" id="copyShortBtn" data-i18n="b.copy_addr"></button>
      <button class="ghost" id="closeBtn" data-i18n="b.close"></button>
    </div>
  </div>
</div>

<div class="modal" id="statModal">
  <div class="box" style="text-align:left">
    <div id="statBody"></div>
    <div class="btns" style="margin-top:18px">
      <button class="ghost" id="statExport" data-i18n="b.export"></button>
      <button class="ghost" id="statClose" data-i18n="b.close"></button>
    </div>
  </div>
</div>

<script>
${I18N_JS}
${SHARED_JS}

let TOKEN = sessionStorage.getItem("qr_token") || "";
let ITEMS = [];
let CLIENTS = [];
let LOGGED = false;
let VIEW = "home";
let FOLDER = "__all";
const SELECTED = new Set();

const VIEWS = ["home","overview","create","reserve","free","live","newclient","clients","menu","vcard","cards","print","backup"];

function ownerTokenOf(inputId) {
  const v = $(inputId).value.trim().toLowerCase();
  if (!v) return "";
  const hit = CLIENTS.filter(c => c.name.trim().toLowerCase() === v)[0];
  return hit ? hit.token : null;
}
function ownerName(token) {
  if (!token) return "";
  const hit = CLIENTS.filter(c => c.token === token)[0];
  return hit ? hit.name : "";
}

// ── навігація ──
function go(name) {
  VIEW = name;
  for (const v of VIEWS) {
    const el = $("v-" + v);
    if (el) el.className = v === name ? "" : "hide";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "overview") renderOverview();
  if (name === "free") renderList("free");
  if (name === "live") renderList("live");
  if (name === "print") renderPick();
  if (name === "menu") renderMenus();
  if (name === "clients") renderClients();
  if (name === "cards") { loadTemplates(); renderCardList(); }
  if (name === "vcard") renderVcards();
}

for (const b of document.querySelectorAll("[data-go]"))
  b.onclick = () => go(b.getAttribute("data-go"));
for (const b of document.querySelectorAll(".back"))
  b.onclick = () => go("home");

initLangSwitch(function () {
  if (LOGGED) { renderStatus(LAST_INFO); loadClients().then(() => { loadList(); go(VIEW); }); }
});

// ── вхід ──
$("loginBtn").onclick = doLogin;
$("tokenInput").onkeydown = e => { if (e.key === "Enter") doLogin(); };

async function doLogin() {
  const v = $("tokenInput").value.trim();
  if (!v) return;
  TOKEN = v;
  const res = await api("check");
  if (res.ok && res.role === "admin") {
    sessionStorage.setItem("qr_token", v);
    enterApp(res);
  } else {
    show($("loginMsg"), errText(res.error === "too_many" ? "too_many" : "unauthorized"), "err");
  }
}

$("logoutBtn").onclick = () => { sessionStorage.removeItem("qr_token"); location.reload(); };

let LAST_INFO = {};

function renderStatus(info) {
  const bits = ["dflust.com"];
  bits.push(info.d1 ? t("st.stats_on") : t("st.no_d1"));
  if (info.places) bits.push(t("st.places"));
  if (info.r2) bits.push(t("st.r2"));
  if (!qrReady()) bits.push(t("st.no_qr"));
  if (info.weak) bits.push("⚠ " + t("st.weak"));
  $("statusLine").textContent = bits.join(" · ");
}

function enterApp(info) {
  LAST_INFO = info;
  LOGGED = true;
  $("login").style.display = "none";
  $("app").style.display = "";
  applyLang();
  renderStatus(info);
  loadClients().then(loadList);
  go("home");
}

// ── конвертер ──
$("convBtn").onclick = async () => {
  const maps = $("mapsInput").value.trim();
  if (!maps) return;
  const btn = $("convBtn");
  btn.disabled = true; btn.textContent = t("conv.busy");
  $("testLink").style.display = "none";
  show($("msg"), t("conv.wait"), "wait");

  const res = await api("resolve", { maps });
  btn.disabled = false; btn.textContent = t("conv.btn");

  if (res.ok) {
    $("newUrl").value = res.review;
    $("mapsInput").value = "";
    if (res.name && !$("newTitle").value) $("newTitle").value = res.name;
    const a = $("testLink");
    a.href = res.review; a.style.display = "inline-block";
    let note = t("conv.done") + (res.name ? ": " + res.name : "") + (res.address ? " · " + res.address : "") + " · " + t("src." + res.source);
    note += ". " + (res.appSafe ? t("conv.safe") : t("conv.unsafe"));
    show($("msg"), note, "ok");
  } else {
    show($("msg"), errText(res.error), "err");
  }
};

// ── створення ──
$("createBtn").onclick = async () => {
  const url = $("newUrl").value.trim();
  const owner = ownerTokenOf("newOwner");
  if (owner === null) return show($("msg"), errText("no_such_client"), "err");

  const params = {
    url: url ? (/^https?:\\/\\//i.test(url) ? url : "https://" + url) : "",
    title: $("newTitle").value.trim(),
    owner: owner
  };
  const code = $("newCode").value.trim();
  if (code) params.code = code;

  const res = await api(code ? "set" : "new", params);

  if (res.ok) {
    ["newCode","newUrl","newTitle","newOwner"].forEach(id => { $(id).value = ""; });
    $("testLink").style.display = "none";
    show($("msg"), (res.draft ? t("res.created_draft") : t("conv.done")) + ": " + res.short, "ok");
    await loadList();
    openQr(res.code);
  } else {
    show($("msg"), errText(res.error), "err");
  }
};

// ── резервування ──
$("reserveBtn").onclick = async () => {
  const count = parseInt($("resCount").value, 10) || 1;
  const owner = ownerTokenOf("resOwner");
  if (owner === null) return show($("msg"), errText("no_such_client"), "err");
  const title = $("resTitle").value.trim();
  const folder = $("resFolder").value.trim();

  const btn = $("reserveBtn");
  btn.disabled = true;
  const kind = $("resKind").value;
  const res = await api("reserve", { count, owner, title, folder, kind });
  btn.disabled = false;

  if (!res.ok) return show($("msg"), errText(res.error), "err");

  show($("msg"), t("res.done") + " " + res.count, "ok");
  ["resTitle", "resFolder", "resOwner"].forEach(id => { $(id).value = ""; });
  await loadList();

  if (title) {
    $("pickFilter").value = title;
    go("print");
    for (const cb of $("pickList").querySelectorAll("input")) cb.checked = true;
  } else {
    FOLDER = folder || "__all";
    SELECTED.clear();
    go("free");
  }
};

// ── клієнти ──
async function loadClients() {
  const res = await api("clients");
  CLIENTS = res.ok ? res.items : [];

  const dl = $("ownerList");
  dl.innerHTML = "";
  for (const c of CLIENTS) {
    const o = document.createElement("option");
    o.value = c.name;
    dl.append(o);
  }
  $("cCli").textContent = CLIENTS.length ? CLIENTS.length : "";
  if (VIEW === "clients") renderClients();
}

function renderClients() {
  const box = $("clients");
  box.innerHTML = "";
  if (!CLIENTS.length) {
    box.innerHTML = '<div class="empty">' + t("cl.empty") + '</div>';
    return;
  }
  for (const c of CLIENTS) {
    const row = document.createElement("div");
    row.className = "item";

    let tag = "";
    if (c.paidUntil) {
      const days = Math.round((new Date(c.paidUntil) - new Date(todayStr())) / 86400000);
      if (days < 0) tag = '<span class="tag over">' + t("cl.overdue") + '</span>';
      else if (days <= 7) tag = '<span class="tag soon">' + t("cl.soon") + '</span>';
    }

    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = '<div class="ttl">' + esc(c.name) + tag + '</div>' +
                     '<div class="cab">' + esc(c.cabinet) + '</div>';

    const pay = document.createElement("div");
    pay.className = "pay";
    pay.innerHTML = '<div class="paylab">' + t("cl.paid") + '</div>';
    const di = document.createElement("input");
    di.type = "date"; di.value = c.paidUntil || "";
    di.onchange = async () => {
      const r = await api("client_pay", { client: c.token, paid: di.value });
      if (r.ok) { show($("msg"), t("cl.saved"), "ok"); loadClients(); }
      else show($("msg"), errText(r.error), "err");
    };
    pay.append(di);

    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      mk(t("cl.copy"), function () {
        navigator.clipboard.writeText(c.cabinet);
        this.textContent = t("b.copied");
        setTimeout(() => { this.textContent = t("cl.copy"); }, 1600);
      }),
      mk(t("cl.rotate"), async () => {
        if (!confirm(t("cl.rotate_confirm", { n: c.name }))) return;
        const r = await api("client_rotate", { client: c.token });
        if (r.ok) { show($("msg"), t("cl.rotated") + " " + r.cabinet, "ok"); await loadClients(); loadList(); }
        else show($("msg"), errText(r.error), "err");
      }),
      mk(t("b.del"), async () => {
        if (!confirm(t("cl.confirm", { n: c.name }))) return;
        const r = await api("client_del", { client: c.token });
        if (r.ok) { show($("msg"), t("cl.deleted"), "ok"); await loadClients(); loadList(); }
      }, "danger")
    );

    row.append(info, pay, acts);
    box.append(row);
  }
}

$("clientAdd").onclick = async () => {
  const name = $("clientName").value.trim();
  if (!name) return show($("msg"), errText("need_name"), "err");
  const res = await api("client_new", { name, paid: $("clientPaid").value || "" });
  if (res.ok) {
    $("clientName").value = ""; $("clientPaid").value = "";
    show($("msg"), t("cl.created") + " " + res.cabinet, "ok");
    await loadClients();
    go("clients");
  } else {
    show($("msg"), errText(res.error), "err");
  }
};

// ── списки ──
async function loadList() {
  const res = await api("list");
  if (!res.ok) return;
  ITEMS = res.items;

  for (const c of Array.from(SELECTED))
    if (!ITEMS.some(i => i.code === c && i.draft)) SELECTED.delete(c);

  const free = ITEMS.filter(i => i.draft).length;
  $("cFree").textContent = free ? free : "";
  $("cLive").textContent = ITEMS.length - free ? ITEMS.length - free : "";

  fillFolderList();

  const cl = $("codeList");
  cl.innerHTML = "";
  for (const it of ITEMS) {
    const o = document.createElement("option");
    o.value = it.code;
    cl.append(o);
  }

  if (VIEW === "free") renderList("free");
  if (VIEW === "live") renderList("live");
  if (VIEW === "overview") renderOverview();
  if (VIEW === "print") renderPick();
  if (VIEW === "menu") renderMenus();
  if (VIEW === "cards") renderCardList();
  if (VIEW === "vcard") renderVcards();
}

// ── папки ──
function folderStats() {
  const map = {};
  let none = 0;
  for (const i of ITEMS) {
    if (!i.draft) continue;
    if (i.folder) map[i.folder] = (map[i.folder] || 0) + 1;
    else none++;
  }
  return { map, none };
}

function fillFolderList() {
  const names = new Set(t("fd.defaults").split("|"));
  for (const i of ITEMS) if (i.folder) names.add(i.folder);
  const dl = $("folderList");
  dl.innerHTML = "";
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n;
    dl.append(o);
  }
}

function renderFolders() {
  const { map, none } = folderStats();
  const total = ITEMS.filter(i => i.draft).length;
  const chips = [["__all", t("fd.all"), total]];
  if (none) chips.push(["__none", t("fd.none"), none]);
  for (const name of Object.keys(map).sort()) chips.push([name, name, map[name]]);
  if (!chips.some(c => c[0] === FOLDER)) FOLDER = "__all";

  const box = $("freeFolders");
  box.innerHTML = "";
  for (const [key, label, n] of chips) {
    const b = document.createElement("button");
    b.className = "chip" + (key === FOLDER ? " on" : "");
    b.textContent = label + " · " + n;
    b.onclick = () => { FOLDER = key; SELECTED.clear(); renderList("free"); };
    box.append(b);
  }
}

function rowsFor(mode) {
  const q = $(mode === "free" ? "freeFilter" : "liveFilter").value.trim().toLowerCase();
  let rows = ITEMS.filter(i => (mode === "free" ? i.draft : !i.draft));

  if (mode === "free") {
    if (FOLDER === "__none") rows = rows.filter(i => !i.folder);
    else if (FOLDER !== "__all") rows = rows.filter(i => i.folder === FOLDER);
  }

  if (q) rows = rows.filter(it => {
    const owner = CLIENTS.filter(c => c.token === it.owner)[0];
    return it.code.toLowerCase().indexOf(q) !== -1 ||
           (it.title || "").toLowerCase().indexOf(q) !== -1 ||
           (it.url || "").toLowerCase().indexOf(q) !== -1 ||
           (it.folder || "").toLowerCase().indexOf(q) !== -1 ||
           (owner ? owner.name.toLowerCase().indexOf(q) !== -1 : false);
  });
  return rows;
}

function updateSel() {
  $("moveBtn").textContent = t("fd.move") + (SELECTED.size ? " (" + SELECTED.size + ")" : "");
}

$("freeFilter").oninput = () => renderList("free");
$("liveFilter").oninput = () => renderList("live");

function renderList(mode) {
  const box = $(mode === "free" ? "listFree" : "listLive");
  if (mode === "free") { renderFolders(); updateSel(); }

  const rows = rowsFor(mode);
  const q = $(mode === "free" ? "freeFilter" : "liveFilter").value.trim();

  if (!rows.length) {
    box.innerHTML = '<div class="empty">' + t(q ? "list.nomatch" : "list.empty") + '</div>';
    return;
  }

  box.innerHTML = "";
  for (const it of rows) {
    const row = document.createElement("div");
    row.className = "item";

    if (mode === "free") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "selbox";
      cb.checked = SELECTED.has(it.code);
      cb.onchange = () => {
        if (cb.checked) SELECTED.add(it.code); else SELECTED.delete(it.code);
        updateSel();
      };
      row.append(cb);
    }

    const owner = CLIENTS.filter(c => c.token === it.owner)[0];
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML =
      '<div class="code">/' + esc(it.code) +
        (it.folder ? '<span class="ftag">' + esc(it.folder) + '</span>' : "") + ownTags(it) + '</div>' +
      (it.title || owner
        ? '<div class="ttl">' + esc(it.title || "") + (owner ? (it.title ? " · " : "") + esc(owner.name) : "") + '</div>'
        : "") +
      '<div class="dest">' + (
        !it.url ? '<span style="color:#c9a227">● ' + t("list.draft") + '</span>'
        : it.url.indexOf("menu:") === 0
          ? '<span style="color:#7fd6a0">● ' + t("nav.menu") + '</span>'
        : it.url.indexOf("card:") === 0
          ? '<span style="color:#9dbaf0">● ' + t("vc.link") + '</span>'
          : esc(it.url)) + '</div>';

    const sc = document.createElement("div");
    sc.className = "scans";
    sc.innerHTML = '<b>' + it.unique + '</b>' + t("s.of") + ' ' + it.scans;

    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      mk(t("b.setup"), () => {
        go("create");
        $("newCode").value = it.code;
        $("newUrl").value = it.url || "";
        $("newTitle").value = it.title || "";
        $("newOwner").value = ownerName(it.owner);
        $("newUrl").focus();
      }),
      mk(t("b.qr"), () => openQr(it.code)),
      mk(t("b.stats"), () => openStats(it.code)),
      mk(t("b.copy"), function () {
        navigator.clipboard.writeText(ORIGIN + "/" + it.code);
        this.textContent = t("b.copied");
        setTimeout(() => { this.textContent = t("b.copy"); }, 1600);
      })
    );
    if (mode === "free") {
      acts.append(mk(it.sold ? t("ow.unmark") : t("ow.mark_sold"), () => markCodes([it.code], { sold: !it.sold })));
    } else {
      acts.append(mk(t("ow.history"), () => openLog(it.code)));
      if (it.activated) {
        acts.append(mk(t("ow.reset"), async () => {
          if (!confirm(t("ow.reset_confirm", { c: it.code }))) return;
          const r = await api("owner_reset", { code: it.code });
          if (!r.ok) return show($("msg"), errText(r.error), "err");
          show($("msg"), t("ow.reset_done"), "ok");
          loadList();
        }));
      }
    }
    acts.append(
      mk(it.blocked ? t("ow.unblock") : t("ow.block"), async () => {
        if (!it.blocked && !confirm(t("ow.block_confirm", { c: it.code }))) return;
        const r = await api("block", { code: it.code, on: it.blocked ? "0" : "1" });
        if (!r.ok) return show($("msg"), errText(r.error), "err");
        show($("msg"), r.blocked ? t("ow.blocked_done") : t("ow.unblocked_done"), "ok");
        loadList();
      }, it.blocked ? "" : "danger"),
      mk(t("b.del"), async () => {
        if (!confirm(t("del.confirm", { c: it.code }))) return;
        const r = await api("delete", { code: it.code });
        if (r.ok) { show($("msg"), t("del.done") + " /" + it.code, "ok"); loadList(); }
      }, "danger")
    );

    row.append(info, sc, acts);
    box.append(row);
  }
}

$("freeAll").onclick = () => {
  const vis = rowsFor("free").map(i => i.code);
  const all = vis.length && vis.every(c => SELECTED.has(c));
  for (const c of vis) {
    if (all) SELECTED.delete(c); else SELECTED.add(c);
  }
  renderList("free");
};

function ownTags(it) {
  let h = "";
  if (it.kind) h += '<span class="tag kind">' + esc(t("kind." + it.kind)) + '</span>';
  if (it.sold && !it.url) h += '<span class="tag sold">' + esc(t("ow.sold")) + '</span>';
  if (it.activated) h += '<span class="tag own">' + esc(t("ow.owner")) + '</span>';
  if (it.blocked) h += '<span class="tag blk">' + esc(t("ow.blocked")) + '</span>';
  return h;
}

async function markCodes(codes, patch) {
  let changed = 0;
  for (let i = 0; i < codes.length; i += 300) {
    const res = await apiPost("mark", Object.assign({ codes: codes.slice(i, i + 300) }, patch));
    if (!res.ok) return show($("msg"), errText(res.error), "err");
    changed += res.changed;
  }
  // одразу показуємо результат, не чекаючи індексу KV
  for (const it of ITEMS) {
    if (codes.indexOf(it.code) === -1) continue;
    if (patch.kind !== undefined) it.kind = patch.kind;
    if (patch.sold !== undefined) it.sold = patch.sold;
  }
  const noKind = patch.sold && ITEMS.some(i => codes.indexOf(i.code) !== -1 && !i.kind);
  show($("msg"), t("ow.marked") + " " + changed + (noKind ? ". " + t("ow.no_kind") : ""), noKind ? "wait" : "ok");
  renderList(VIEW === "live" ? "live" : "free");
}

$("kindBtn").onclick = () => {
  if (!SELECTED.size) return show($("msg"), t("fd.need_sel"), "err");
  const k = $("bulkKind").value;
  if (k === "-") return;
  markCodes(Array.from(SELECTED), { kind: k });
};
$("soldBtn").onclick = () => {
  if (!SELECTED.size) return show($("msg"), t("fd.need_sel"), "err");
  markCodes(Array.from(SELECTED), { sold: true });
};
$("unsoldBtn").onclick = () => {
  if (!SELECTED.size) return show($("msg"), t("fd.need_sel"), "err");
  markCodes(Array.from(SELECTED), { sold: false });
};

async function openLog(code) {
  statCode = code;
  $("statBody").innerHTML = '<div class="empty">' + t("s.counting") + '</div>';
  $("statModal").classList.add("on");
  const r = await api("log", { code });
  if (!r.ok) { $("statBody").innerHTML = '<div class="empty">' + errText(r.error) + '</div>'; return; }
  let h = '<div class="code" style="margin-bottom:12px">/' + esc(code) + ' · ' + t("ow.history") + '</div>';
  if (!r.items.length) h += '<div class="empty">' + t("ow.log_empty") + '</div>';
  for (const e of r.items) {
    const d = new Date(e.ts);
    h += '<div class="logrow"><span>' + d.toLocaleString() + '</span><span>' +
         esc(e.who === "owner" ? t("ow.who_owner") : t("ow.who_admin")) + (e.cc ? " · " + esc(e.cc) : "") +
         '</span><b>' + esc(e.what) + '</b></div>';
  }
  $("statBody").innerHTML = h;
}

$("moveBtn").onclick = async () => {
  if (!SELECTED.size) return show($("msg"), t("fd.need_sel"), "err");
  const folder = $("moveTo").value.trim();
  const codes = Array.from(SELECTED);

  const btn = $("moveBtn");
  btn.disabled = true;
  let moved = 0;
  for (let i = 0; i < codes.length; i += 300) {
    const res = await apiPost("move", { codes: codes.slice(i, i + 300), folder });
    if (!res.ok) {
      btn.disabled = false;
      return show($("msg"), errText(res.error), "err");
    }
    moved += res.moved;
  }
  btn.disabled = false;

  // одразу показуємо результат, не чекаючи оновлення індексу KV
  for (const it of ITEMS) if (SELECTED.has(it.code)) it.folder = folder;
  show($("msg"), t("fd.moved") + " " + moved + " → " + (folder || t("fd.none")), "ok");
  SELECTED.clear();
  $("moveTo").value = "";
  FOLDER = folder || "__none";
  fillFolderList();
  renderList("free");
};

$("exportAll").onclick = () => download("export");

// ── меню ──
const MENU_SAMPLE = [
  "# Кава",
  "Еспресо | 45",
  "Капучино | 65 | на кокосовому +10",
  "",
  "# Сніданки",
  "Сирники | 120 | зі сметаною та джемом | 250 г",
  "Омлет | 95 | | 200 г | https://приклад.com/foto.jpg"
].join(String.fromCharCode(10));

$("mnSyntax").textContent = MENU_SAMPLE;

function renderMenus() {
  const box = $("menuList");
  const rows = ITEMS.filter(i => (i.url || "").indexOf("menu:") === 0);
  if (!rows.length) {
    box.innerHTML = '<div class="empty">' + t("mn.empty") + '</div>';
    return;
  }
  box.innerHTML = "";
  for (const it of rows) {
    const row = document.createElement("div");
    row.className = "item";
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = '<div class="code">/' + esc(it.code) + '</div>' +
                     (it.title ? '<div class="ttl">' + esc(it.title) + '</div>' : "");
    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      mk(t("b.setup"), () => { $("mnCode").value = it.code; loadMenu(); }),
      mk(t("b.qr"), () => openQr(it.code)),
      mk(t("mn.preview"), () => window.open(ORIGIN + "/" + it.code, "_blank"))
    );
    row.append(info, acts);
    box.append(row);
  }
}

async function loadMenu() {
  const code = $("mnCode").value.trim();
  if (!code) return show($("msg"), errText("need_code"), "err");
  const res = await api("menu_get", { code });
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  if (!res.menu) {
    $("mnTitle").value = ""; $("mnNote").value = ""; $("mnText").value = "";
    $("mnTitleEn").value = ""; $("mnNoteEn").value = ""; $("mnTextEn").value = "";
    $("mnTheme").value = "cream"; $("mnBg").value = "";
    return show($("msg"), t("mn.none"), "wait");
  }
  $("mnTitle").value = res.menu.title || "";
  $("mnNote").value = res.menu.note || "";
  $("mnText").value = res.menu.text || "";
  $("mnTitleEn").value = res.menu.title_en || "";
  $("mnNoteEn").value = res.menu.note_en || "";
  $("mnTextEn").value = res.menu.text_en || "";
  $("mnTheme").value = res.menu.theme || "cream";
  $("mnBg").value = res.menu.bg || "";
  show($("msg"), t("conv.done"), "ok");
}

$("mnLoad").onclick = loadMenu;

$("mnSave").onclick = async () => {
  const code = $("mnCode").value.trim();
  if (!code) return show($("msg"), errText("need_code"), "err");

  const res = await apiPost("menu_save", {
    code,
    title: $("mnTitle").value.trim(),
    note: $("mnNote").value.trim(),
    text: $("mnText").value,
    title_en: $("mnTitleEn").value.trim(),
    note_en: $("mnNoteEn").value.trim(),
    text_en: $("mnTextEn").value,
    theme: $("mnTheme").value,
    bg: $("mnBg").value.trim()
  });
  if (res.ok) {
    show($("msg"), t("mn.saved") + " " + res.short, "ok");
    await loadList();
  } else {
    show($("msg"), errText(res.error), "err");
  }
};

$("mnPhotoBtn").onclick = () => $("mnPhoto").click();
$("mnBgBtn").onclick = () => $("mnBgFile").click();

// великі знімки з телефона зменшуємо прямо в браузері
function shrink(file, maxSide, minBytes) {
  return new Promise(resolve => {
    if (["image/jpeg", "image/png", "image/webp"].indexOf(file.type) === -1 ||
        file.size < (minBytes || 300 * 1024))
      return resolve(file);

    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.max(im.width, im.height);
      const k = side > maxSide ? maxSide / side : 1;
      const cv = document.createElement("canvas");
      cv.width = Math.round(im.width * k);
      cv.height = Math.round(im.height * k);
      cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
      cv.toBlob(b => resolve(b && b.size < file.size ? b : file), "image/jpeg", 0.82);
    };
    im.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    im.src = url;
  });
}

async function uploadImage(file, maxSide, minBytes) {
  file = await shrink(file, maxSide || 1400, minBytes);
  const r = await authFetch(apiUrl("img_upload"), {
    method: "POST",
    headers: { "content-type": file.type || "image/jpeg" },
    body: file
  });
  try { return await r.json(); } catch (e) { return { error: "generic" }; }
}

$("mnBgFile").onchange = async () => {
  const f = $("mnBgFile").files[0];
  if (!f) return;
  const res = await uploadImage(f, 2000);
  $("mnBgFile").value = "";
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  $("mnBg").value = res.path;
  show($("msg"), t("mn.uploaded"), "ok");
};

$("mnPhoto").onchange = async () => {
  const f = $("mnPhoto").files[0];
  if (!f) return;
  const res = await uploadImage(f);
  $("mnPhoto").value = "";
  if (!res.ok) return show($("msg"), errText(res.error), "err");

  const ta = $("mnText");
  const pos = ta.selectionStart || ta.value.length;
  const before = ta.value.slice(0, pos);
  const after = ta.value.slice(pos);
  ta.value = before + " | " + res.path + after;
  ta.focus();
  show($("msg"), t("mn.uploaded"), "ok");
};

$("mnPreview").onclick = () => {
  const code = $("mnCode").value.trim();
  if (code) window.open(ORIGIN + "/" + code, "_blank");
};

$("mnDel").onclick = async () => {
  const code = $("mnCode").value.trim();
  if (!code) return;
  if (!confirm(t("mn.del_confirm", { c: code }))) return;
  const res = await api("menu_del", { code });
  if (res.ok) {
    show($("msg"), t("mn.deleted"), "ok");
    $("mnTitle").value = ""; $("mnNote").value = ""; $("mnText").value = "";
    await loadList();
  } else {
    show($("msg"), errText(res.error), "err");
  }
};

// ── огляд ──
function renderOverview() {
  const free = ITEMS.filter(i => i.draft).length;
  let uniq = 0;
  for (const i of ITEMS) uniq += i.unique || 0;
  $("sCodes").textContent = ITEMS.length;
  $("sFree").textContent = free;
  $("sCli").textContent = CLIENTS.length;
  $("sScans").textContent = uniq;

  const top = ITEMS.slice().sort((a, b) => b.scans - a.scans).slice(0, 5).filter(i => i.scans);
  const box = $("topList");
  if (!top.length) { box.innerHTML = '<div class="empty">' + t("s.nodata") + '</div>'; return; }
  box.innerHTML = "";
  for (const it of top) {
    const row = document.createElement("div");
    row.className = "kv";
    row.innerHTML = '<span class="code">/' + esc(it.code) + '</span><span>' +
                    it.unique + " " + t("s.of") + " " + it.scans + '</span>';
    box.append(row);
  }
}

// ── візитки vCard ──
const VC_KEYS = ["name","title","org","phone","phone2","email","site","address",
                 "telegram","viber","whatsapp","instagram","facebook","tiktok","about","photo"];

function vcClear() {
  for (const k of VC_KEYS) $("vc_" + k).value = "";
  $("vc_theme").value = "dark";
  $("vc_accent").value = "#4d7cfe";
}

function vcFill(c) {
  for (const k of VC_KEYS) $("vc_" + k).value = c[k] || "";
  $("vc_theme").value = c.theme === "light" ? "light" : "dark";
  $("vc_accent").value = c.accent || "#4d7cfe";
}

function vcRead() {
  const o = {};
  for (const k of VC_KEYS) o[k] = $("vc_" + k).value.trim();
  o.theme = $("vc_theme").value;
  o.accent = $("vc_accent").value;
  return o;
}

function renderVcards() {
  const box = $("vcList");
  const rows = ITEMS.filter(i => (i.url || "").indexOf("card:") === 0);
  if (!rows.length) {
    box.innerHTML = '<div class="empty">' + t("vc.empty") + '</div>';
    return;
  }
  box.innerHTML = "";
  for (const it of rows) {
    const row = document.createElement("div");
    row.className = "item";
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = '<div class="code">/' + esc(it.code) + '</div>' +
                     (it.title ? '<div class="ttl">' + esc(it.title) + '</div>' : "");
    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      mk(t("b.setup"), () => { $("vcCode").value = it.code; vcLoad(); window.scrollTo({ top: 0, behavior: "smooth" }); }),
      mk(t("b.qr"), () => openQr(it.code)),
      mk(t("vc.preview"), () => window.open(ORIGIN + "/" + it.code, "_blank"))
    );
    row.append(info, acts);
    box.append(row);
  }
}

async function vcLoad() {
  const code = $("vcCode").value.trim();
  if (!code) return show($("msg"), errText("need_code"), "err");
  const res = await api("vcard_get", { code });
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  if (!res.card) { vcClear(); return show($("msg"), t("vc.none"), "wait"); }
  vcFill(res.card);
  show($("msg"), t("conv.done"), "ok");
}

$("vcLoad").onclick = vcLoad;

$("vcSave").onclick = async () => {
  let code = $("vcCode").value.trim();
  if (!code) {
    // порожньо — беремо перший вільний код (з поточної папки, якщо вона вибрана)
    const free = ITEMS.filter(i => i.draft && (FOLDER === "__all" || FOLDER === "__none" ? true : i.folder === FOLDER));
    if (!free.length) return show($("msg"), errText("need_code"), "err");
    code = free[0].code;
    $("vcCode").value = code;
  }
  const body = vcRead();
  if (!body.name) return show($("msg"), errText("need_name"), "err");
  body.code = code;
  const res = await apiPost("vcard_save", body);
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  show($("msg"), t("vc.saved") + " " + res.short, "ok");
  await loadList();
};

$("vcPreview").onclick = () => {
  const code = $("vcCode").value.trim();
  if (code) window.open(ORIGIN + "/" + code, "_blank");
};

$("vcVcf").onclick = () => {
  const code = $("vcCode").value.trim();
  if (code) window.open(ORIGIN + "/v/" + code, "_blank");
};

$("vcDel").onclick = async () => {
  const code = $("vcCode").value.trim();
  if (!code) return;
  if (!confirm(t("vc.del_confirm", { c: code }))) return;
  const res = await api("vcard_del", { code });
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  vcClear();
  show($("msg"), t("vc.deleted"), "ok");
  await loadList();
};

$("vcPhotoBtn").onclick = () => $("vcPhotoFile").click();
$("vcPhotoFile").onchange = async () => {
  const f = $("vcPhotoFile").files[0];
  if (!f) return;
  // фото для візитки — маленьке: 600 px, щоб влізло всередину .vcf
  const res = await uploadImage(f, 600, 1);
  $("vcPhotoFile").value = "";
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  $("vc_photo").value = res.path;
  show($("msg"), t("mn.uploaded").split(",")[0], "ok");
};

// ── картки з QR ──
// бібліотеки віддає сам воркер після перевірки SHA-256
const LIB_JSPDF = "/lib/jspdf.js";
const LIB_JSZIP = "/lib/jszip.js";
const TPL_DEF = { w: 100, x: 63.32, y: 64.51, s: 24.4 };
const LIBS = {};
let TEMPLATES = [];
let TPL = null;
let TPL_IMG = null;

function loadScript(src) {
  if (!LIBS[src]) {
    LIBS[src] = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = ok;
      s.onerror = () => { delete LIBS[src]; fail(new Error("load " + src)); };
      document.head.append(s);
    });
  }
  return LIBS[src];
}

function blankTpl() {
  return { id: "", name: "", img: "", w: TPL_DEF.w, h: TPL_DEF.w,
           x: TPL_DEF.x, y: TPL_DEF.y, s: TPL_DEF.s, cap: false };
}

async function loadTemplates() {
  const r = await api("tpl_list");
  TEMPLATES = r.ok ? r.items : [];
  if (!TPL) {
    if (TEMPLATES.length) selectTpl(TEMPLATES[0]);
    else { TPL = blankTpl(); fillTplForm(); }
  }
  renderTplList();
}

function renderTplList() {
  const box = $("tplList");
  if (!TEMPLATES.length) {
    box.innerHTML = '<div class="empty">' + t("cd.tpl_empty") + '</div>';
    return;
  }
  box.innerHTML = "";
  for (const tp of TEMPLATES) {
    const row = document.createElement("div");
    row.className = "item";
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = '<div class="ttl">' + esc(tp.name) +
      (TPL && TPL.id === tp.id ? '<span class="ftag">' + t("cd.editing") + '</span>' : "") + '</div>' +
      '<div class="dest">' + tp.w + " × " + tp.h + " mm</div>";
    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      mk(t("cd.pick"), () => { selectTpl(tp); renderTplList(); }),
      mk(t("b.del"), async () => {
        if (!confirm(t("cd.del_confirm", { n: tp.name }))) return;
        const r = await api("tpl_del", { id: tp.id });
        if (!r.ok) return show($("msg"), errText(r.error), "err");
        TEMPLATES = r.items;
        if (TPL && TPL.id === tp.id) { TPL = blankTpl(); TPL_IMG = null; fillTplForm(); drawPreview(); }
        renderTplList();
      }, "danger")
    );
    row.append(info, acts);
    box.append(row);
  }
}

function selectTpl(tp) {
  TPL = Object.assign(blankTpl(), tp);
  TPL_IMG = null;
  fillTplForm();
  drawPreview();
  if (TPL.img) loadTplImage(TPL.img, false);
}

function fillTplForm() {
  $("tpName").value = TPL.name || "";
  $("tpW").value = TPL.w;
  $("tpH").value = Math.round(TPL.h * 10) / 10;
  $("tpX").value = TPL.x;
  $("tpY").value = TPL.y;
  $("tpS").value = TPL.s;
  $("tpCap").checked = !!TPL.cap;
}

function readTplForm() {
  if (!TPL) TPL = blankTpl();
  const f = (id, d) => { const v = parseFloat($(id).value); return isFinite(v) ? v : d; };
  TPL.name = $("tpName").value.trim();
  TPL.w = f("tpW", TPL.w);
  TPL.h = f("tpH", TPL.h);
  TPL.x = f("tpX", TPL.x);
  TPL.y = f("tpY", TPL.y);
  TPL.s = f("tpS", TPL.s);
  TPL.cap = $("tpCap").checked;
}

function loadTplImage(src, fitHeight) {
  const im = new Image();
  im.onload = () => {
    TPL_IMG = im;
    if (fitHeight) {
      readTplForm();
      TPL.h = Math.round(TPL.w * im.naturalHeight / im.naturalWidth * 10) / 10;
      $("tpH").value = TPL.h;
    }
    drawPreview();
  };
  im.src = src;
}

function sampleCode() {
  const cb = $("cdList").querySelector("input:checked");
  if (cb) return cb.value;
  return ITEMS.length ? ITEMS[0].code : "abc234";
}

function makeQr(code) {
  const q = qrcode(0, "M");
  q.addData(ORIGIN + "/" + code);
  q.make();
  return q;
}

function drawPreview() {
  const cv = $("tpPrev");
  if (!TPL || !TPL_IMG) { cv.width = 0; cv.height = 0; return; }
  readTplForm();
  const W = 920;
  const H = Math.round(W * TPL.h / TPL.w);
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  c.clearRect(0, 0, W, H);
  c.drawImage(TPL_IMG, 0, 0, W, H);
  if (!qrReady()) return;

  const code = sampleCode();
  const q = makeQr(code);
  const n = q.getModuleCount();
  const X = TPL.x / 100 * W, Y = TPL.y / 100 * H, S = TPL.s / 100 * W;
  const m = S / n, pad = S * 0.015;
  c.fillStyle = "#fff";
  c.fillRect(X - pad, Y - pad, S + pad * 2, S + pad * 2);
  c.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let k = 0; k < n; k++)
      if (q.isDark(r, k)) c.fillRect(X + k * m, Y + r * m, m + 0.6, m + 0.6);
  if (TPL.cap) {
    c.fillStyle = "#6e6e6e";
    c.font = Math.max(8, Math.round(S * 0.06)) + "px Helvetica, Arial, sans-serif";
    c.textAlign = "center";
    c.fillText("/" + code, X + S / 2, Y + S + S * 0.14);
  }
}

for (const id of ["tpX", "tpY", "tpS", "tpH", "tpCap"]) $(id).oninput = drawPreview;
$("tpCap").onchange = drawPreview;
$("tpW").oninput = () => {
  if (TPL_IMG) {
    const w = parseFloat($("tpW").value);
    if (isFinite(w)) $("tpH").value = Math.round(w * TPL_IMG.naturalHeight / TPL_IMG.naturalWidth * 10) / 10;
  }
  drawPreview();
};

$("tpPrev").onclick = e => {
  if (!TPL_IMG) return;
  readTplForm();
  const r = $("tpPrev").getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  const sW = TPL.s / 100;
  const sH = sW * TPL.w / TPL.h;
  $("tpX").value = Math.round((fx - sW / 2) * 10000) / 100;
  $("tpY").value = Math.round((fy - sH / 2) * 10000) / 100;
  drawPreview();
};

$("tpNew").onclick = () => {
  TPL = blankTpl();
  TPL_IMG = null;
  fillTplForm();
  drawPreview();
  renderTplList();
  $("tpName").focus();
};

$("tpFileBtn").onclick = () => $("tpFile").click();

$("tpFile").onchange = async () => {
  const f = $("tpFile").files[0];
  if (!f) return;
  if (!TPL) TPL = blankTpl();
  show($("msg"), t("list.loading"), "wait");

  // шаблон вантажимо як є — без стиснення, щоб не втратити якість і прозорість
  const r = await authFetch(apiUrl("img_upload"), {
    method: "POST",
    headers: { "content-type": f.type || "image/png" },
    body: f
  });
  let res;
  try { res = await r.json(); } catch (e) { res = { error: "generic" }; }
  $("tpFile").value = "";
  if (!res.ok) return show($("msg"), errText(res.error), "err");

  TPL.img = res.path;
  if (!$("tpName").value.trim()) $("tpName").value = f.name.replace(/\\.[a-z0-9]+$/i, "");
  loadTplImage(res.path, true);
  show($("msg"), t("mn.uploaded").split(",")[0], "ok");
};

$("tpSave").onclick = async () => {
  readTplForm();
  if (!TPL.img) return show($("msg"), errText("need_img"), "err");
  const res = await apiPost("tpl_save", TPL);
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  TEMPLATES = res.items;
  TPL.id = res.id;
  renderTplList();
  show($("msg"), t("cd.saved"), "ok");
};

function renderCardList() {
  const box = $("cdList");
  const q = $("cdFilter").value.trim().toLowerCase();
  const was = new Set(Array.from(box.querySelectorAll("input:checked")).map(x => x.value));
  let rows = ITEMS;
  if (q) rows = rows.filter(it =>
    it.code.toLowerCase().indexOf(q) !== -1 ||
    (it.title || "").toLowerCase().indexOf(q) !== -1 ||
    (it.folder || "").toLowerCase().indexOf(q) !== -1);

  if (!rows.length) {
    box.innerHTML = '<div class="empty">' + t(q ? "list.nomatch" : "list.empty") + '</div>';
    return;
  }
  box.innerHTML = "";
  for (const it of rows) {
    const row = document.createElement("div");
    row.className = "pick";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.id = "ck_" + it.code; cb.value = it.code;
    cb.checked = was.has(it.code);
    cb.onchange = drawPreview;
    const lb = document.createElement("label");
    lb.htmlFor = cb.id;
    lb.innerHTML = '<span class="code">/' + esc(it.code) + '</span>' +
                   (it.title ? ' <em>' + esc(it.title) + '</em>' : "") +
                   (it.folder ? '<span class="ftag">' + esc(it.folder) + '</span>' : "") +
                   (it.draft ? ' <em style="color:#c9a227">● ' + t("list.draft") + '</em>' : "");
    row.append(cb, lb);
    box.append(row);
  }
}

$("cdFilter").oninput = renderCardList;
$("cdAll").onclick = () => {
  for (const cb of $("cdList").querySelectorAll("input")) cb.checked = true;
  drawPreview();
};
$("cdNone").onclick = () => {
  for (const cb of $("cdList").querySelectorAll("input")) cb.checked = false;
  drawPreview();
};

async function tplData() {
  const r = await fetch(TPL.img);
  const b = await r.blob();
  const url = await new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(b);
  });
  return { url, fmt: /png/i.test(b.type) ? "PNG" : "JPEG" };
}

function drawCard(doc, img, code) {
  const w = TPL.w, h = TPL.h;
  doc.addImage(img.url, img.fmt, 0, 0, w, h, "tpl", "FAST");

  const q = makeQr(code);
  const n = q.getModuleCount();
  const X = TPL.x / 100 * w, Y = TPL.y / 100 * h, S = TPL.s / 100 * w;
  const m = S / n, pad = S * 0.015, eps = 0.03;

  doc.setFillColor(0, 0, 0, 0);           // білий (CMYK)
  doc.rect(X - pad, Y - pad, S + pad * 2, S + pad * 2, "F");
  doc.setFillColor(0, 0, 0, 1);           // 100% K
  for (let r = 0; r < n; r++) {
    let k = 0;
    while (k < n) {
      if (!q.isDark(r, k)) { k++; continue; }
      let e = k;
      while (e < n && q.isDark(r, e)) e++;
      doc.rect(X + k * m, Y + r * m, (e - k) * m, m + (r < n - 1 ? eps : 0), "F");
      k = e;
    }
  }

  if (TPL.cap) {
    doc.setTextColor(110, 110, 110);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(S * 0.06 * 2.835);
    doc.text("/" + code, X + S / 2, Y + S + S * 0.14, { align: "center" });
  }
}

function pickedCards() {
  return Array.from($("cdList").querySelectorAll("input:checked")).map(x => x.value);
}

const tick = () => new Promise(r => setTimeout(r, 0));

async function generate(asZip) {
  readTplForm();
  if (!TPL || !TPL.img) return show($("msg"), t("cd.need_tpl"), "err");
  if (!qrReady()) return show($("msg"), t("qr.fail"), "err");
  const codes = pickedCards();
  if (!codes.length) return show($("msg"), t("pr.empty"), "err");

  const b1 = $("cdPdf"), b2 = $("cdZip");
  b1.disabled = b2.disabled = true;
  try {
    show($("msg"), t("cd.working"), "wait");
    try {
      await loadScript(LIB_JSPDF);
      if (asZip) await loadScript(LIB_JSZIP);
    } catch (e) {
      return show($("msg"), t("cd.lib_fail"), "err");
    }

    const { jsPDF } = window.jspdf;
    const img = await tplData();
    const o = TPL.w > TPL.h ? "l" : "p";
    const fmt = [TPL.w, TPL.h];
    const slug = (TPL.name || "cards").replace(/[^A-Za-z0-9А-Яа-яІіЇїЄєҐґ_-]+/g, "-");

    if (!asZip) {
      const doc = new jsPDF({ unit: "mm", format: fmt, orientation: o, compress: true });
      for (let i = 0; i < codes.length; i++) {
        if (i) doc.addPage(fmt, o);
        drawCard(doc, img, codes[i]);
        if (i % 10 === 9) { show($("msg"), t("cd.working") + " " + (i + 1) + " / " + codes.length, "wait"); await tick(); }
      }
      saveBlob(doc.output("blob"), slug + "-" + codes.length + ".pdf");
    } else {
      const zip = new JSZip();
      for (let i = 0; i < codes.length; i++) {
        const doc = new jsPDF({ unit: "mm", format: fmt, orientation: o, compress: true });
        drawCard(doc, img, codes[i]);
        zip.file(codes[i] + ".pdf", doc.output("arraybuffer"));
        show($("msg"), t("cd.working") + " " + (i + 1) + " / " + codes.length, "wait");
        await tick();
      }
      show($("msg"), t("cd.packing"), "wait");
      const blob = await zip.generateAsync({ type: "blob" });
      saveBlob(blob, slug + "-" + codes.length + ".zip");
    }
    show($("msg"), t("cd.done") + " " + codes.length, "ok");
  } catch (e) {
    show($("msg"), t("err.generic") + ": " + e.message, "err");
  } finally {
    b1.disabled = b2.disabled = false;
  }
}

$("cdPdf").onclick = () => generate(false);
$("cdZip").onclick = () => generate(true);

// ── друк QR ──
function renderPick() {
  const box = $("pickList");
  const q = $("pickFilter").value.trim().toLowerCase();
  let rows = ITEMS;
  if (q) rows = rows.filter(it =>
    it.code.toLowerCase().indexOf(q) !== -1 ||
    (it.title || "").toLowerCase().indexOf(q) !== -1 ||
    (it.folder || "").toLowerCase().indexOf(q) !== -1);

  if (!rows.length) {
    box.innerHTML = '<div class="empty">' + t(q ? "list.nomatch" : "list.empty") + '</div>';
    return;
  }
  box.innerHTML = "";
  for (const it of rows) {
    const row = document.createElement("div");
    row.className = "pick";
    const cb = document.createElement("input");
    cb.type = "checkbox"; cb.id = "pk_" + it.code; cb.value = it.code;
    const lb = document.createElement("label");
    lb.htmlFor = cb.id;
    lb.innerHTML = '<span class="code">/' + esc(it.code) + '</span>' +
                   (it.title ? ' <em>' + esc(it.title) + '</em>' : "") +
                   (it.folder ? '<span class="ftag">' + esc(it.folder) + '</span>' : "") +
                   (it.draft ? ' <em style="color:#c9a227">● ' + t("list.draft") + '</em>' : "");
    row.append(cb, lb);
    box.append(row);
  }
}

$("pickFilter").oninput = renderPick;

$("pickAll").onclick = () => {
  for (const cb of $("pickList").querySelectorAll("input")) cb.checked = true;
};
$("pickNone").onclick = () => {
  for (const cb of $("pickList").querySelectorAll("input")) cb.checked = false;
};

$("printGo").onclick = () => {
  if (!qrReady()) return show($("msg"), t("qr.fail"), "err");
  const picked = [];
  for (const cb of $("pickList").querySelectorAll("input"))
    if (cb.checked) picked.push(cb.value);
  if (!picked.length) return show($("msg"), t("pr.empty"), "err");

  let cells = "";
  for (const code of picked) {
    const it = ITEMS.filter(i => i.code === code)[0] || {};
    const tmp = document.createElement("canvas");
    drawQr(tmp, ORIGIN + "/" + code, 900);
    cells += '<figure><img src="' + tmp.toDataURL("image/png") + '">' +
             '<figcaption><b>/' + esc(code) + '</b>' +
             (it.title ? "<span>" + esc(it.title) + "</span>" : "") + '</figcaption></figure>';
  }

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    '<!doctype html><html><head><meta charset="utf-8"><title>' + t("pr.title") + '</title><style>' +
    '@page{size:A4;margin:12mm}' +
    'body{margin:0;font:13px/1.4 system-ui,sans-serif;color:#000}' +
    '.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm}' +
    'figure{margin:0;text-align:center;break-inside:avoid}' +
    'img{width:100%;max-width:45mm;image-rendering:pixelated}' +
    'figcaption{margin-top:3mm}' +
    'figcaption b{display:block;font-family:ui-monospace,monospace;font-size:12px}' +
    'figcaption span{display:block;color:#555;font-size:11px}' +
    '</style></head><body><div class="g">' + cells + '</div></body></html>');
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
};

// ── резервна копія ──
$("backupBtn").onclick = () => download("backup");
$("restoreBtn").onclick = () => $("restoreFile").click();

$("migrateBtn").onclick = async () => {
  const btn = $("migrateBtn");
  btn.disabled = true;
  const res = await api("migrate");
  btn.disabled = false;
  if (!res.ok) return show($("msg"), errText(res.error), "err");
  show($("msg"),
    t("mg.done") + " " + res.migrated + (res.left ? " · " + t("mg.left") + " " + res.left : ""),
    res.left ? "wait" : "ok");
  loadList();
};

$("restoreFile").onchange = async () => {
  const f = $("restoreFile").files[0];
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); }
  catch (e) { $("restoreFile").value = ""; return show($("msg"), t("bk.bad"), "err"); }
  if (!data || !Array.isArray(data.links)) {
    $("restoreFile").value = "";
    return show($("msg"), t("bk.bad"), "err");
  }
  if (!confirm(t("bk.confirm"))) { $("restoreFile").value = ""; return; }

  const params = { overwrite: $("bkOverwrite").checked ? "1" : "0" };
  const links = data.links;
  const menus = Array.isArray(data.menus) ? data.menus : [];
  const vcards = Array.isArray(data.vcards) ? data.vcards : [];

  // порціями, щоб не впертися в ліміт операцій KV за один запит
  const jobs = [{ links: [], clients: data.clients || [], templates: data.templates || [] }];
  for (let i = 0; i < links.length; i += 300) jobs.push({ links: links.slice(i, i + 300) });
  for (let i = 0; i < menus.length; i += 100) jobs.push({ links: [], menus: menus.slice(i, i + 100) });
  for (let i = 0; i < vcards.length; i += 200) jobs.push({ links: [], vcards: vcards.slice(i, i + 200) });

  let nL = 0, nC = 0, nX = 0;
  const line = () => t("bk.done") + " " + nL + " / " + nC + " · " + t("bk.extra") + " " + nX;
  for (const part of jobs) {
    const res = await apiPost("restore", part, params);
    if (!res.ok) {
      $("restoreFile").value = "";
      return show($("msg"), errText(res.error), "err");
    }
    nL += res.links || 0;
    nC += res.clients || 0;
    nX += res.extra || 0;
    show($("msg"), line(), "wait");
  }

  $("restoreFile").value = "";
  show($("msg"), line(), "ok");
  await loadClients();
  loadList();
};

// ── QR ──
let currentCode = "";

function openQr(code) {
  currentCode = code;
  const short = ORIGIN + "/" + code;
  $("qrShort").textContent = short;
  $("modal").classList.add("on");

  const canvas = $("qrCanvas"), fb = $("qrFallback");
  if (!qrReady()) {
    canvas.style.display = "none"; fb.style.display = "block";
    fb.textContent = t("qr.fail");
    $("dlBtn").disabled = true;
    return;
  }
  canvas.style.display = ""; fb.style.display = "none"; $("dlBtn").disabled = false;
  try { drawQr(canvas, short, 560); }
  catch (e) { fb.style.display = "block"; fb.textContent = t("qr.draw_fail") + " " + e.message; }
}

$("closeBtn").onclick = () => $("modal").classList.remove("on");
$("modal").onclick = e => { if (e.target.id === "modal") $("modal").classList.remove("on"); };

$("copyShortBtn").onclick = function () {
  navigator.clipboard.writeText(ORIGIN + "/" + currentCode);
  this.textContent = t("b.copied");
  setTimeout(() => { this.textContent = t("b.copy_addr"); }, 1600);
};

$("dlBtn").onclick = () => {
  if (!qrReady()) return;
  const tmp = document.createElement("canvas");
  try {
    drawQr(tmp, ORIGIN + "/" + currentCode, 1200);
    const a = document.createElement("a");
    a.download = "qr-" + currentCode + ".png";
    a.href = tmp.toDataURL("image/png");
    a.click();
  } catch (e) { console.error(e); }
};

// ── статистика ──
let statCode = "";
$("statClose").onclick = () => $("statModal").classList.remove("on");
$("statModal").onclick = e => { if (e.target.id === "statModal") $("statModal").classList.remove("on"); };
$("statExport").onclick = () => download("export", { code: statCode });

async function openStats(code) {
  statCode = code;
  $("statBody").innerHTML = '<div class="empty">' + t("s.counting") + '</div>';
  $("statModal").classList.add("on");
  const s = await api("stats", { code });
  $("statBody").innerHTML = s.ok ? statHtml(s)
    : '<div class="empty">' + (s.error ? errText(s.error) : t("s.nodata")) + '</div>';
}

// ── старт ──
if (TOKEN) {
  api("check").then(r => {
    if (r.ok && r.role === "admin") enterApp(r);
    else sessionStorage.removeItem("qr_token");
  });
}
</script>
</body>
</html>`;

// ─────────────────────── Кабінет клієнта ───────────────────────

const CLIENT_HTML = `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR</title>
<script src="/lib/qrcode.js"></script>
<style>${PANEL_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div>
      <h1 id="title" data-i18n="cab.title"></h1>
      <div class="sub" id="statusLine"></div>
    </div>
    <div class="langbox">
      <button data-lang="uk">УКР</button><button data-lang="en">ENG</button>
    </div>
  </div>

  <div class="card">
    <h2 data-i18n="cab.h2"></h2>
    <div id="list"></div>
    <div style="margin-top:14px"><button class="ghost" id="exportAll" data-i18n="cab.export"></button></div>
  </div>
</div>

<div class="modal" id="modal">
  <div class="box">
    <canvas id="qrCanvas"></canvas>
    <div id="qrFallback" class="warn" style="display:none"></div>
    <div class="short" id="qrShort"></div>
    <div class="btns">
      <button id="dlBtn" data-i18n="b.png"></button>
      <button class="ghost" id="closeBtn" data-i18n="b.close"></button>
    </div>
  </div>
</div>

<div class="modal" id="statModal">
  <div class="box" style="text-align:left">
    <div id="statBody"></div>
    <div class="btns" style="margin-top:18px">
      <button class="ghost" id="statExport" data-i18n="b.export"></button>
      <button class="ghost" id="statClose" data-i18n="b.close"></button>
    </div>
  </div>
</div>

<script>
${I18N_JS}
${SHARED_JS}

const TOKEN = location.pathname.split("/")[2] || "";
let ITEMS = [];
let VALID = false;
let CLIENT_NAME = "";

initLangSwitch(function () {
  if (CLIENT_NAME) $("title").textContent = CLIENT_NAME;
  if (VALID) { $("statusLine").textContent = t("cab.sub"); loadList(); }
  else { $("statusLine").textContent = t("cab.invalid"); }
});

async function start() {
  const info = await api("check");
  if (!info.ok) {
    VALID = false;
    $("statusLine").textContent = t("cab.invalid");
    $("list").innerHTML = '<div class="empty">' + t("cab.invalid_hint") + '</div>';
    return;
  }
  VALID = true;
  CLIENT_NAME = info.name || "";
  if (CLIENT_NAME) $("title").textContent = CLIENT_NAME;
  $("statusLine").textContent = t("cab.sub");
  loadList();
}

async function loadList() {
  const box = $("list");
  box.innerHTML = '<div class="empty">' + t("list.loading") + '</div>';

  const res = await api("list");
  if (!res.ok) { box.innerHTML = '<div class="empty">' + errText(res.error) + '</div>'; return; }
  ITEMS = res.items;

  if (!ITEMS.length) {
    box.innerHTML = '<div class="empty">' + t("cab.empty") + '</div>';
    return;
  }
  box.innerHTML = "";
  for (const it of ITEMS) {
    const row = document.createElement("div");
    row.className = "item";

    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML =
      '<div class="code">/' + esc(it.code) + '</div>' +
      (it.title ? '<div class="ttl">' + esc(it.title) + '</div>' : '') +
      (it.draft ? '<div class="dest"><span style="color:#c9a227">● ' + t("list.draft") + '</span></div>' : '');

    const sc = document.createElement("div");
    sc.className = "scans";
    sc.innerHTML = '<b>' + it.unique + '</b>' + t("s.of") + ' ' + it.scans;

    const acts = document.createElement("div");
    acts.className = "actions";
    acts.append(
      mk(t("b.qr"), () => openQr(it.code)),
      mk(t("b.stats"), () => openStats(it.code))
    );

    row.append(info, sc, acts);
    box.append(row);
  }
}

$("exportAll").onclick = () => download("export");

let currentCode = "";
function openQr(code) {
  currentCode = code;
  const short = ORIGIN + "/" + code;
  $("qrShort").textContent = short;
  $("modal").classList.add("on");
  const canvas = $("qrCanvas"), fb = $("qrFallback");
  if (!qrReady()) {
    canvas.style.display = "none"; fb.style.display = "block";
    fb.textContent = t("qr.fail");
    $("dlBtn").disabled = true; return;
  }
  canvas.style.display = ""; fb.style.display = "none"; $("dlBtn").disabled = false;
  drawQr(canvas, short, 560);
}

$("closeBtn").onclick = () => $("modal").classList.remove("on");
$("modal").onclick = e => { if (e.target.id === "modal") $("modal").classList.remove("on"); };

$("dlBtn").onclick = () => {
  if (!qrReady()) return;
  const tmp = document.createElement("canvas");
  drawQr(tmp, ORIGIN + "/" + currentCode, 1200);
  const a = document.createElement("a");
  a.download = "qr-" + currentCode + ".png";
  a.href = tmp.toDataURL("image/png");
  a.click();
};

let statCode = "";
$("statClose").onclick = () => $("statModal").classList.remove("on");
$("statModal").onclick = e => { if (e.target.id === "statModal") $("statModal").classList.remove("on"); };
$("statExport").onclick = () => download("export", { code: statCode });

async function openStats(code) {
  statCode = code;
  $("statBody").innerHTML = '<div class="empty">' + t("s.counting") + '</div>';
  $("statModal").classList.add("on");
  const s = await api("stats", { code });
  $("statBody").innerHTML = s.ok ? statHtml(s)
    : '<div class="empty">' + (s.error ? errText(s.error) : t("s.nodata")) + '</div>';
}

start();
</script>
</body>
</html>`;
