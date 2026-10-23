from __future__ import annotations

import re
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

DEFAULT_YEAR = 2026
AVAILABLE_YEARS = [2024, 2025, 2026, 2027]
BASE_URL = "https://www.gov.mo/zh-hant/public-holidays/year-{year}/"
FETCH_TIMEOUT = 15
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}

# 三張表對應的假期類型（依表格前的標題文字判斷，比表格順序更穩健）
CATEGORY_RULES = [
    ("public", ("公眾假期",)),
    ("half", ("豁免上班",)),
    ("compensate", ("補假日",)),
]
CATEGORY_LABELS = {
    "public": "公眾假期",
    "half": "半天假（下午豁免上班）",
    "compensate": "補假日",
}

DATE_RE = re.compile(r"(\d{1,2})月(\d{1,2})日")


class FetchError(Exception):
    """無法取得或解析政府網站頁面。"""


def detect_category(table):
    heading = table.find_previous(["h1", "h2", "h3", "h4", "strong"])
    text = heading.get_text(strip=True) if heading else ""
    for category, keywords in CATEGORY_RULES:
        if any(k in text for k in keywords):
            return category
    return None


def extract_year(url, soup):
    m = re.search(r"year-(\d{4})", url or "")
    if m:
        return int(m.group(1))
    og = soup.find("meta", property="og:title")
    if og:
        m = re.search(r"\d{4}", og.get("content", ""))
        if m:
            return int(m.group(0))
    return datetime.now().year


def parse_row(row, year, category):
    tds = row.find_all("td")
    if len(tds) >= 4:
        marker, date_td, weekday_td, name_td = tds[0], tds[1], tds[2], tds[3]
    elif len(tds) == 3:
        marker, date_td, weekday_td, name_td = None, tds[0], tds[1], tds[2]
    else:
        return None

    raw_date = date_td.get_text(" ", strip=True)
    m = DATE_RE.search(raw_date)
    if not m:
        return None
    month, day = int(m.group(1)), int(m.group(2))
    try:
        parsed = date(year, month, day)
    except ValueError:
        return None

    return {
        "date": parsed.isoformat(),
        "date_display": raw_date,
        "weekday": weekday_td.get_text(strip=True),
        "name": name_td.get_text(" ", strip=True),
        "category": category,
        "half_day": "下午" in raw_date,
        "mandatory": marker is not None and marker.get_text(strip=True) != "",
    }


def fetch_holidays(url):
    """抓取並解析 gov.mo 公眾假期頁面，回傳 (holidays, meta)。"""
    try:
        response = requests.get(url, headers=REQUEST_HEADERS, timeout=FETCH_TIMEOUT)
    except requests.RequestException as exc:
        raise FetchError(f"無法連線到政府網站：{exc.__class__.__name__}") from exc
    if response.status_code != 200:
        raise FetchError(
            f"網頁回應 HTTP {response.status_code}，該年度頁面可能尚未公佈或網址無效"
        )

    soup = BeautifulSoup(response.text, "html.parser")
    year = extract_year(url, soup)
    og_title = soup.find("meta", property="og:title")
    title = og_title["content"].strip() if og_title else f"{year}年"

    holidays = []
    seen = set()
    for table in soup.find_all("table"):
        category = detect_category(table) or (
            "public" if not holidays else "compensate"
        )
        for row in table.find_all("tr"):
            item = parse_row(row, year, category)
            if item and item["date"] not in seen:
                seen.add(item["date"])
                holidays.append(item)

    if not holidays:
        raise FetchError("頁面解析失敗：找不到任何假期資料，網站格式可能已變更")

    holidays.sort(key=lambda h: h["date"])
    meta = {
        "year": year,
        "title": title,
        "url": url,
        "count": len(holidays),
        "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
    return holidays, meta


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def build_context(holidays, meta, error=None):
    return {
        "payload": {"holidays": holidays, "meta": meta, "error": error},
        "available_years": AVAILABLE_YEARS,
    }


@app.route("/")
def index():
    url = request.args.get("url", "").strip()
    year = request.args.get("year", type=int, default=DEFAULT_YEAR)
    if not url:
        url = BASE_URL.format(year=year)

    try:
        holidays, meta = fetch_holidays(url)
        return render_template("holidays.html", **build_context(holidays, meta))
    except FetchError as exc:
        meta = {"year": year, "title": f"{year}年", "url": url, "count": 0, "fetched_at": ""}
        return render_template("holidays.html", **build_context([], meta, error=str(exc)))


@app.route("/api/holidays")
def api_holidays():
    url = request.args.get("url", "").strip()
    year = request.args.get("year", type=int)
    if not url and year:
        url = BASE_URL.format(year=year)
    if not url:
        return jsonify({"error": "請提供 year 或 url 參數"}), 400

    try:
        holidays, meta = fetch_holidays(url)
        return jsonify({"holidays": holidays, "meta": meta, "error": None})
    except FetchError as exc:
        return jsonify({"error": str(exc), "holidays": [], "meta": None}), 502


if __name__ == "__main__":
    app.run(debug=True)
