#!/usr/bin/env python3
"""Збирає актуальний каталог dnipro-m.ua (назва, ціна, стара ціна/акція, наявність онлайн)
у business/dnipro-m-catalog.csv. Запуск: python3 tools/dnipro-m-catalog.py  (~10 хв).
Потрібен доступ до dnipro-m.ua у мережевих налаштуваннях середовища."""
import csv, html, json, re, sys, time, urllib.request
from datetime import date

UA = {"User-Agent": "Mozilla/5.0"}
OUT = "business/dnipro-m-catalog.csv"

def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode("utf-8", "ignore")

def category_urls():
    xml = get("https://dnipro-m.ua/sitemap.xml")
    return [u for u in re.findall(r"<loc>([^<]+)</loc>", xml) if "/ru/" not in u]

def parse(page, url, prods):
    prev = 0
    for m in re.finditer(r":analytics-data='(\[.*?\])'", page):
        seg, prev = page[prev:m.start()], m.end()
        try:
            d = json.loads(html.unescape(m.group(1)))[0]
        except Exception:
            continue
        def attr(name):
            r = re.findall(r"\s" + re.escape(name) + r'="([^"]*)"', seg)
            return html.unescape(r[-1]) if r else None
        new = old = None
        try:
            j = json.loads(attr("price") or "{}")
            new, old = float(j.get("price_new") or 0) or None, float(j.get("price_old") or 0) or None
        except Exception:
            pass
        new = new or float(d.get("price") or 0) or None
        if d["id"] in prods:
            continue
        cats = [c.get("name_uk") or c.get("name") for c in d.get("categories", [])]
        prods[d["id"]] = {
            "section": url.split("/")[3],
            "category": " / ".join(cats),
            "name": attr("title") or d.get("name_uk"),
            "price": new,
            "price_old": old if old and new and old > new else "",
            "promo_pct": round((1 - new / old) * 100) if old and new and old > new else "",
            "available_online": attr(":is-available") == "true",
            "rating": attr("rating") or "",
            "reviews": attr(":reviews-count") or "",
            "code": attr("code") or d["id"],
            "url": "https://dnipro-m.ua" + (attr("link") or ""),
        }

def main():
    prods = {}
    urls = category_urls()
    for i, u in enumerate(urls):
        try:
            parse(get(u), u, prods)
        except Exception as e:
            print("ERR", u, e, file=sys.stderr)
        time.sleep(0.2)
        if i % 50 == 0:
            print(f"{i}/{len(urls)} сторінок, {len(prods)} товарів", file=sys.stderr)
    rows = sorted(prods.values(), key=lambda r: (r["section"], r["category"], r["price"] or 0))
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"{date.today()}: {len(rows)} товарів → {OUT}")

if __name__ == "__main__":
    main()
