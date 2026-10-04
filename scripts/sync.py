#!/usr/bin/env python3
"""Пополняет data/videos.json описаниями и превью футажей TikTok.

Источники ссылок (используются все, дубликаты отбрасываются):
  0. tiktok_export.json (рядом с README) — файл от tools/collect.js: все видео сразу;
  1. links.txt — по одной ссылке или ID видео в строке;
  2. yt-dlp по профилю @footage_me1 (если установлен и TikTok не блокирует).

Для каждого нового видео берётся описание и превью через официальный oEmbed TikTok,
статистика/дата — через yt-dlp, если доступен. Поле "tags" в videos.json правится
вручную и при повторной синхронизации не затирается.
"""
import json, re, time, subprocess, concurrent.futures as cf, shutil, sys, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA, THUMBS, LINKS = ROOT / "data/videos.json", ROOT / "thumbs", ROOT / "links.txt"
ACCOUNT = "footage_me1"
STATS = "--stats" in sys.argv  # просмотры/лайки/дата: ~1 доп. запрос на видео, долго
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36"}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception:
            if k == tries - 1: raise
            time.sleep(1.5 * (k + 1))


def ids_from_links():
    if not LINKS.exists():
        return []
    text = "\n".join(l for l in LINKS.read_text(encoding="utf8").splitlines() if not l.lstrip().startswith("#"))
    return re.findall(r"(?<!\d)(\d{15,25})(?!\d)", text)


def ids_from_ytdlp():
    if not shutil.which("yt-dlp"):
        print("yt-dlp не установлен (pip install yt-dlp)", file=sys.stderr); return []
    for k in range(8):  # TikTok отвечает нестабильно — пробуем несколько раз
        try:
            p = subprocess.run(["yt-dlp", "--flat-playlist", "-J", f"https://www.tiktok.com/@{ACCOUNT}"],
                               capture_output=True, text=True, timeout=180)
            ids = [e["id"] for e in json.loads(p.stdout)["entries"] if e]
            if not ids: raise ValueError("пустой список")
            print(f"yt-dlp: найдено видео {len(ids)}", flush=True); return ids
        except Exception:
            print(f"yt-dlp: попытка {k + 1}/8 неудачна", file=sys.stderr, flush=True); time.sleep(5)
    print("yt-dlp не смог получить профиль — используйте tools/collect.js", file=sys.stderr)
    return []


def parse_views(x):
    x = str(x).strip().upper().replace(",", ".")
    m = re.match(r"([\d.]+)\s*([KMКМ]?)", x)
    if not m: return 0
    return int(float(m.group(1)) * {"": 1, "K": 1e3, "К": 1e3, "M": 1e6, "М": 1e6}[m.group(2)])


def from_export():
    f = ROOT / "tiktok_export.json"
    return {e["id"]: e for e in json.loads(f.read_text(encoding="utf8"))} if f.exists() else {}


def build(e):
    """Видео из экспорта: описание уже есть, нужно только скачать превью."""
    d = e.get("description", "")
    v = {"id": e["id"], "url": f"https://www.tiktok.com/@{ACCOUNT}/video/{e['id']}", "description": d,
         "hashtags": re.findall(r"#([\w]+)", d), "tags": [], "views": parse_views(e.get("views", 0)), "likes": 0, "date": ""}
    if e.get("thumb"):
        try:
            save_thumb(e['id'], get(e["thumb"])); v["thumb"] = f"thumbs/{e['id']}.jpg"
        except Exception: pass
    return v


def save_thumb(vid, raw):
    """Сохраняет превью; если установлен Pillow — уменьшает (~15 КБ вместо ~400 КБ)."""
    f = THUMBS / f"{vid}.jpg"
    try:
        import io
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB"); im.thumbnail((320, 568)); im.save(f, "JPEG", quality=78, optimize=True)
    except ImportError:
        f.write_bytes(raw)


def fetch(vid):
    url = f"https://www.tiktok.com/@{ACCOUNT}/video/{vid}"
    o = json.loads(get("https://www.tiktok.com/oembed?url=" + urllib.parse.quote(url, safe="")))
    desc = o.get("title", "")
    v = {"id": vid, "url": url, "description": desc, "hashtags": re.findall(r"#([\w]+)", desc),
         "tags": [], "views": 0, "likes": 0, "date": ""}
    if o.get("thumbnail_url"):
        try:
            save_thumb(vid, get(o["thumbnail_url"]))
            v["thumb"] = f"thumbs/{vid}.jpg"
        except Exception as e:
            print("  превью не скачалось:", e, file=sys.stderr)
    if STATS and shutil.which("yt-dlp"):
        p = subprocess.run(["yt-dlp", "-j", "--skip-download", url], capture_output=True, text=True)
        try:
            j = json.loads(p.stdout)
            v["views"], v["likes"] = j.get("view_count") or 0, j.get("like_count") or 0
            d = j.get("upload_date") or ""
            v["date"] = f"{d[:4]}-{d[4:6]}-{d[6:]}" if d else ""
        except Exception:
            pass
    return v


def main():
    videos = json.loads(DATA.read_text(encoding="utf8")) if DATA.exists() else []
    known = {v["id"] for v in videos}
    exp = from_export()
    new = [i for i in dict.fromkeys(list(exp) + ids_from_links() + ids_from_ytdlp()) if i not in known]
    print(f"В базе: {len(known)}, новых: {len(new)}")

    def job(i):
        try:
            return build(exp[i]) if i in exp else fetch(i)
        except Exception as e:
            print("  пропущено", i, e, file=sys.stderr)

    with cf.ThreadPoolExecutor(8) as ex:
        for n, v in enumerate(ex.map(job, new), 1):
            if v: videos.append(v)
            if n % 100 == 0:
                print(f"  {n}/{len(new)}"); DATA.write_text(json.dumps(videos, ensure_ascii=False, indent=1), encoding="utf8")
    DATA.write_text(json.dumps(videos, ensure_ascii=False, indent=1), encoding="utf8")


if __name__ == "__main__":
    main()
