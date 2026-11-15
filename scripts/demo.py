"""Generate explicitly fictional UI fixtures, never a live-data substitute."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
AS_OF = "2026-11-13T22:00:00Z"
COMPANIES = [
    ("AAPL", "Apple Inc.", "0000320193", "Technology", "Consumer electronics", 214.62, 1.24, 3.21e12, 31.2, 6.1, "https://www.apple.com/newsroom/"),
    ("MSFT", "Microsoft Corporation", "0000789019", "Technology", "Software & cloud", 428.35, 0.82, 3.18e12, 35.7, 13.4, "https://news.microsoft.com/"),
    ("NVDA", "NVIDIA Corporation", "0001045810", "Technology", "Semiconductors", 146.28, -0.65, 3.58e12, 48.9, 52.3, "https://nvidianews.nvidia.com/"),
    ("AMD", "Advanced Micro Devices, Inc.", "0000002488", "Technology", "Semiconductors", 138.72, 1.67, 225.3e9, 39.1, 16.8, "https://www.amd.com/en/newsroom.html"),
    ("AMZN", "Amazon.com, Inc.", "0001018724", "Consumer cyclical", "Internet retail", 208.14, 0.43, 2.18e12, 37.4, 10.6, "https://www.aboutamazon.com/news"),
    ("GOOGL", "Alphabet Inc.", "0001652044", "Communication services", "Internet content", 182.47, -0.21, 2.24e12, 23.9, 12.7, "https://blog.google/")
]


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    entries = []
    for symbol, name, cik, sector, industry, price, change, cap, pe, growth, newsroom in COMPANIES:
        listing = {"symbol": symbol, "name": name, "cik": cik, "exchange": "Nasdaq"}
        entries.append(listing)
        short_name = name.replace(" Inc.", "").replace(" Corporation", "").replace(",", "")
        news = [
            {"id": "sample-results", "headline": f"{short_name} reports revenue growth in illustrative quarterly update", "summary": "This fictional story shows how a company earnings update appears in the research feed. In this example, higher revenue and stronger demand support a potential upside argument.", "source": "Sample company release", "publishedAt": "2026-11-13T16:00:00Z", "category": "earnings", "signal": "positive", "signalReviewed": True},
            {"id": "sample-outlook", "headline": "Management outlines a new product roadmap and investment priorities", "summary": "A fictional management update highlights upcoming launches and investment plans. The example has no assessed directional impact and is included to demonstrate source context.", "source": "Sample company newsroom", "publishedAt": "2026-11-12T18:00:00Z", "category": "company", "signal": "neutral", "signalReviewed": True},
            {"id": "sample-risk", "headline": "Higher input costs could weigh on near-term operating margins", "summary": "This fictional risk example describes a possible margin headwind. It demonstrates how an adverse development is linked to the bear case without issuing a trading instruction.", "source": "Sample research note", "publishedAt": "2026-11-12T12:00:00Z", "category": "company", "signal": "negative", "signalReviewed": True},
            {"id": "sample-service", "headline": "Recurring revenue segment shows resilience in a sample business update", "summary": "An illustrative operating update points to steadier recurring demand. The headline and summary are invented examples, not actual statements from this company.", "source": "Sample company release", "publishedAt": "2026-11-11T15:00:00Z", "category": "company", "signal": "positive", "signalReviewed": True}
        ]
        for item in news:
            item["url"] = newsroom
        filings = [{"id": f"sample-{i}", "form": form, "filedAt": day, "items": items, "url": f"https://www.sec.gov/edgar/browse/?CIK={cik}"} for i, (form, day, items) in enumerate([("8-K", "2026-11-13", "2.02, 9.01"), ("4", "2026-11-12", ""), ("10-Q", "2026-11-10", ""), ("8-K", "2026-11-09", "5.02")])]
        save(DATA / "tickers" / (symbol + ".json"), {"schemaVersion": 1, "demo": True, **listing, "asOf": AS_OF, "profile": {"sector": sector, "industry": industry}, "quote": {"price": price, "changePercent": change, "asOf": AS_OF}, "metrics": {"marketCap": cap, "pe": pe, "revenueGrowth": growth}, "earnings": None, "news": news, "filings": filings, "sources": {key: {"state": "demo", "fetchedAt": None} for key in ("sec", "news", "market", "earnings")}})
    directory = entries + [{"symbol": "BRK.B", "name": "Berkshire Hathaway Inc.", "cik": "0001067983", "exchange": "NYSE"}]
    save(DATA / "directory.json", directory)
    save(DATA / "manifest.json", {"schemaVersion": 1, "mode": "demo", "generatedAt": AS_OF, "staleAfterHours": 24, "holdingPeriod": "2–5 trading days", "tickers": entries})
    print("Generated 6 FICTIONAL demo snapshots. No market data was fetched.")


if __name__ == "__main__":
    main()
