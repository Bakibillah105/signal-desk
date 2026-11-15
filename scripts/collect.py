"""Collect static, attributed snapshots. Python standard library only.

No credentials are written to the output. Vendor data is excluded unless its
public-display/redistribution rights have been confirmed by the operator.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
SCHEMA = 1
SEC_HOSTS = {"www.sec.gov", "data.sec.gov"}
FORMS = {"10-K", "10-Q", "8-K", "3", "4", "5", "6-K", "20-F", "40-F", "S-1", "S-3"}
EXCHANGES = {"Q": "Nasdaq", "N": "NYSE", "A": "NYSE American", "P": "NYSE Arca", "Z": "Cboe", "V": "IEX"}


def now_iso():
    return dt.datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def normalize_symbol(value):
    symbol = str(value).strip().upper().replace("-", ".")
    return symbol if re.fullmatch(r"[A-Z]{1,5}(\.[A-Z])?", symbol) else None


def clean_text(value, limit=900):
    # Vendor summaries are plain text. Never export script/HTML payloads.
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", str(value or ""))).strip()[:limit]


def safe_url(value):
    try:
        parsed = urllib.parse.urlsplit(str(value))
        return str(value) if parsed.scheme in {"https", "http"} and parsed.netloc and not parsed.username else None
    except ValueError:
        return None


def finite_number(value, positive=False):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if value == value and abs(value) != float("inf") and (not positive or value > 0) else None
    except (ValueError, TypeError):
        return None


class Fetcher:
    def __init__(self, user_agent):
        self.user_agent = user_agent
        self.last_sec = 0.0
        self.last_vendor = 0.0

    def request(self, url, *, token=None, as_json=True):
        host = urllib.parse.urlsplit(url).hostname
        headers = {"User-Agent": self.user_agent if host in SEC_HOSTS else "SignalDesk/0.1", "Accept": "application/json" if as_json else "text/plain"}
        if token:
            if host != "finnhub.io":
                raise ValueError("Refusing credential transmission to unexpected host")
            headers["X-Finnhub-Token"] = token
        for attempt in range(3):
            if host in SEC_HOSTS:
                time.sleep(max(0, 0.25 - (time.monotonic() - self.last_sec)))
                self.last_sec = time.monotonic()  # At most 4 requests/second.
            elif host == "finnhub.io":
                time.sleep(max(0, 1.1 - (time.monotonic() - self.last_vendor)))
                self.last_vendor = time.monotonic()  # Below 60 requests/minute.
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=25) as response:
                    raw = response.read(30_000_000).decode("utf-8-sig")
                result = json.loads(raw) if as_json else raw
                if isinstance(result, dict) and result.get("error"):
                    raise RuntimeError("Provider returned an error payload")
                return result
            except urllib.error.HTTPError as exc:
                # Never expose the request URL, headers, tokens, or provider body.
                if exc.code not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise RuntimeError(f"Provider returned HTTP {exc.code}") from None
                try:
                    delay = min(30, max(2, int(exc.headers.get("Retry-After", "0"))))
                except ValueError:
                    delay = 2 ** (attempt + 1)
                time.sleep(delay)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                if attempt == 2:
                    raise RuntimeError("Provider response unavailable or invalid") from None
                time.sleep(2 ** (attempt + 1))


def stock_rows(text, nasdaq=False):
    for row in csv.DictReader(io.StringIO(text), delimiter="|"):
        name = row.get("Security Name", "")
        symbol = normalize_symbol(row.get("Symbol" if nasdaq else "ACT Symbol", ""))
        if not symbol or row.get("Test Issue") != "N" or row.get("ETF") != "N":
            continue
        # Conservatively retain common/ordinary equity and ADRs only. Reject
        # uncertain security types rather than treating every SEC ticker as stock.
        if not re.search(r"\b(common (stock|shares)|ordinary shares|american depositary|american depository|\bADR\b|\bADS\b)", name, re.I):
            continue
        if re.search(r"\b(preferred|warrants?|rights|units|notes|debentures|ETF|ETN|fund)\b", name, re.I):
            continue
        exchange = "Nasdaq" if nasdaq else EXCHANGES.get(row.get("Exchange"))
        if exchange:
            yield {"symbol": symbol, "name": name.split(" - ")[0], "exchange": exchange}


def make_directory(sec, nasdaq_text, other_text):
    fields = sec["fields"]
    sec_map = {}
    for values in sec["data"]:
        row = dict(zip(fields, values))
        symbol = normalize_symbol(row.get("ticker", ""))
        if symbol:
            sec_map[symbol] = row
    directory = {}
    for listing in [*stock_rows(nasdaq_text, True), *stock_rows(other_text)]:
        if listing["symbol"] not in sec_map:
            continue
        sec_row = sec_map[listing["symbol"]]
        listing.update(cik=str(sec_row["cik"]).zfill(10), name=clean_text(sec_row["name"], 200))
        directory[listing["symbol"]] = listing
    if not directory:
        raise RuntimeError("No verified US equity listings found")
    return sorted(directory.values(), key=lambda row: row["symbol"])


def normalize_filings(submissions, limit=30):
    recent = submissions.get("filings", {}).get("recent", {})
    result = []
    cik = str(int(submissions["cik"]))
    for i, form in enumerate(recent.get("form", [])):
        if form.removesuffix("/A") not in FORMS:
            continue
        def cell(key):
            values = recent.get(key, [])
            return values[i] if i < len(values) else ""
        accession = cell("accessionNumber")
        doc = cell("primaryDocument")
        filed = cell("filingDate")
        if not re.fullmatch(r"\d{10}-\d{2}-\d{6}", accession) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", filed):
            continue
        # Prefer the accession landing page if the primary document is absent.
        base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/"
        url = base + urllib.parse.quote(doc, safe="/") if doc and ".." not in doc else base + accession + "-index.html"
        result.append({"id": accession, "form": form, "filedAt": filed, "reportDate": cell("reportDate") or None, "items": clean_text(cell("items"), 100), "url": url})
    return sorted(result, key=lambda f: (f["filedAt"], f["id"]), reverse=True)[:limit]


def normalize_news(items, start, end, limit=20):
    result, seen = [], set()
    for item in items if isinstance(items, list) else []:
        headline = clean_text(item.get("headline"), 220)
        url = safe_url(item.get("url"))
        try:
            published = dt.datetime.fromtimestamp(float(item["datetime"]), UTC)
        except (KeyError, ValueError, TypeError, OverflowError, OSError):
            continue
        key = re.sub(r"[^a-z0-9]", "", headline.lower())
        if not headline or not url or key in seen or not start <= published <= end:
            continue
        seen.add(key)
        summary = clean_text(item.get("summary"))
        # Keep a short provider excerpt, never scrape the linked article.
        sentences = re.split(r"(?<=[.!?])\s+", summary)
        summary = " ".join(sentences[:2])[:500]
        result.append({"id": hashlib.sha256((url+headline).encode()).hexdigest()[:16], "headline": headline, "summary": summary, "source": clean_text(item.get("source"), 80) or "Provider", "publishedAt": published.isoformat().replace("+00:00", "Z"), "url": url, "category": "earnings" if re.search(r"\b(earnings|quarterly results|EPS)\b", headline, re.I) else "company", "signalReviewed": False})
    return sorted(result, key=lambda n: n["publishedAt"], reverse=True)[:limit]


def status(state="missing", fetched_at=None):
    return {"state": state, "fetchedAt": fetched_at}


def collect_ticker(listing, fetcher, config, token=None):
    symbol = listing["symbol"]
    data = {"schemaVersion": SCHEMA, "demo": False, **listing, "asOf": now_iso(), "profile": {}, "quote": {}, "metrics": {}, "earnings": None, "news": [], "filings": [], "sources": {key: status() for key in ("sec", "news", "market", "earnings")}}
    try:
        raw = fetcher.request(f"https://data.sec.gov/submissions/CIK{listing['cik']}.json")
        data["filings"] = normalize_filings(raw, config["maxFilings"])
        data["profile"] = {"sector": None, "industry": raw.get("sicDescription") or None}
        data["sources"]["sec"] = status("ok", now_iso())
    except (RuntimeError, KeyError, ValueError, TypeError):
        data["sources"]["sec"] = status("error")
    if not token:
        return data
    # Finnhub uses dots for class-share symbols, unlike SEC's dash convention.
    encoded = urllib.parse.quote(symbol, safe="")
    end = dt.datetime.now(UTC)
    start = end - dt.timedelta(days=config["newsLookbackDays"])
    try:
        raw = fetcher.request(f"https://finnhub.io/api/v1/company-news?symbol={encoded}&from={start.date()}&to={end.date()}", token=token)
        if not isinstance(raw, list):
            raise RuntimeError("Unexpected news response")
        data["news"] = normalize_news(raw, start, end, config["maxNews"])
        data["sources"]["news"] = status("ok", now_iso())
    except RuntimeError:
        data["sources"]["news"] = status("error")
    market_ok = False
    for endpoint in ("stock/profile2", "quote", "stock/metric"):
        try:
            raw = fetcher.request(f"https://finnhub.io/api/v1/{endpoint}?symbol={encoded}" + ("&metric=all" if endpoint == "stock/metric" else ""), token=token)
            if not isinstance(raw, dict) or not raw:
                raise RuntimeError("Empty market response")
            if endpoint == "stock/profile2":
                if raw.get("currency") != "USD":
                    continue
                data["profile"]["sector"] = clean_text(raw.get("finnhubIndustry"), 100) or None
                cap = finite_number(raw.get("marketCapitalization"), positive=True)
                data["metrics"]["marketCap"] = cap * 1_000_000 if cap is not None else None
                market_ok = cap is not None or market_ok
            elif endpoint == "quote":
                price = finite_number(raw.get("c"), positive=True)
                timestamp = finite_number(raw.get("t"), positive=True)
                data["quote"] = {"price": price, "changePercent": finite_number(raw.get("dp")), "asOf": dt.datetime.fromtimestamp(timestamp, UTC).isoformat().replace("+00:00", "Z") if timestamp else None}
                market_ok = price is not None or market_ok
            else:
                metrics = raw.get("metric", {})
                data["metrics"].update(pe=finite_number(metrics.get("peTTM")), revenueGrowth=finite_number(metrics.get("revenueGrowthQuarterlyYoy")))
        except (RuntimeError, ValueError, OverflowError, TypeError):
            continue
    data["sources"]["market"] = status("ok" if market_ok else "error", now_iso() if market_ok else None)
    try:
        raw = fetcher.request(f"https://finnhub.io/api/v1/calendar/earnings?symbol={encoded}&from={end.date()}&to={(end + dt.timedelta(days=30)).date()}", token=token)
        if not isinstance(raw, dict) or "earningsCalendar" not in raw:
            raise RuntimeError("Unexpected calendar response")
        events = [row for row in raw["earningsCalendar"] if row.get("symbol") == symbol and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(row.get("date", ""))) and row["date"] >= str(end.date())]
        if events:
            row = sorted(events, key=lambda e: e["date"])[0]
            data["earnings"] = {"date": row["date"], "hour": row.get("hour"), "confirmedByIssuer": False}
        data["sources"]["earnings"] = status("ok", now_iso())
    except (RuntimeError, TypeError, KeyError):
        data["sources"]["earnings"] = status("error")
    return data


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "site" / "data")
    args = parser.parse_args()
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    ua = os.environ.get("SEC_USER_AGENT", "").strip()
    if not re.search(r"[^\s@]+@[^\s@]+\.[^\s@]+", ua) or "your-own-domain" in ua:
        print("Set SEC_USER_AGENT to an application name and a real contact email in Actions secrets.", file=sys.stderr)
        return 2
    symbols = list(dict.fromkeys(normalize_symbol(s) for s in config["tickers"]))
    if None in symbols or not symbols or len(symbols) > 100:
        print("Configure 1–100 valid equity tickers.", file=sys.stderr)
        return 2
    token = os.environ.get("FINNHUB_API_KEY", "").strip()
    if token and os.environ.get("ALLOW_PUBLIC_MARKET_DATA", "").lower() != "true":
        print("Vendor export disabled: ALLOW_PUBLIC_MARKET_DATA is not true. Collecting SEC only.")
        token = None
    fetcher = Fetcher(ua)
    try:
        sec = fetcher.request("https://www.sec.gov/files/company_tickers_exchange.json")
        nasdaq = fetcher.request("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", as_json=False)
        other = fetcher.request("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt", as_json=False)
        directory = make_directory(sec, nasdaq, other)
    except (RuntimeError, KeyError, TypeError):
        print("Listing directory refresh failed; existing published data was not replaced.", file=sys.stderr)
        return 1
    lookup = {row["symbol"]: row for row in directory}
    missing = [s for s in symbols if s not in lookup]
    if missing:
        print("Not verified as supported US common equity/ADR: " + ", ".join(missing), file=sys.stderr)
        return 2
    snapshots = [collect_ticker(lookup[s], fetcher, config, token) for s in symbols]
    # Total upstream failure never silently replaces good data or publishes demo.
    if not any(d["sources"]["sec"]["state"] == "ok" for d in snapshots):
        print("SEC collection failed for every ticker; previous publication preserved.", file=sys.stderr)
        return 1
    entries = []
    for snapshot in snapshots:
        write_json(args.output / "tickers" / (snapshot["symbol"] + ".json"), snapshot)
        entries.append({key: snapshot[key] for key in ("symbol", "name", "exchange", "cik")})
        states = ", ".join(f"{k}={v['state']}" for k, v in snapshot["sources"].items())
        print(f"{snapshot['symbol']}: {states}")
    # Remove unreferenced snapshot files, including ALL old demo/vendor snapshots.
    # Output is an explicitly resolved directory controlled by this collector.
    snapshot_dir = (args.output / "tickers").resolve()
    expected = {s + ".json" for s in symbols}
    for path in snapshot_dir.glob("*.json"):
        if path.parent.resolve() == snapshot_dir and path.name not in expected:
            path.unlink()
    write_json(args.output / "directory.json", directory)
    write_json(args.output / "manifest.json", {"schemaVersion": SCHEMA, "mode": "collected", "generatedAt": now_iso(), "directoryGeneratedAt": now_iso(), "staleAfterHours": config["staleAfterHours"], "holdingPeriod": config["holdingPeriod"], "tickers": entries})
    return 0


if __name__ == "__main__":
    sys.exit(main())
