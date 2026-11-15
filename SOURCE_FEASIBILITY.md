# Source access plan

Reviewed **15 November 2026** against available official documentation. This is an implementation assessment, not a legal opinion. Access rights and endpoint entitlements must be confirmed for the actual deployment.

| Requested source | What is feasible | MVP treatment | Official reference |
|---|---|---|---|
| SEC EDGAR | Free unauthenticated submissions/XBRL JSON. No browser CORS. Declared application/contact User-Agent; max 10 requests/second across a user. | Collector uses at most 4 requests/second for SEC, collects filing metadata and links to originals. | [API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [developer resources](https://www.sec.gov/about/developer-resources) |
| Nasdaq | Official Data Link APIs and exchange products; cost and rights vary by dataset. Public Trader symbol files describe current listings and security flags. A Nasdaq webpage is not a free general-purpose API. | Listing validation using symbol files and SEC mapping. No Nasdaq quote-page scraping. | [Data Link APIs](https://www.nasdaq.com/products/data/data-link/api), [symbol directory definitions](https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs), [Data Link terms](https://data.nasdaq.com/terms) |
| NYSE | Official real-time/historical/reference products and licensed distribution arrangements. | No direct quote feed; link out or use an appropriately licensed provider later. | [Data products](https://www.nyse.com/data-products) |
| Reuters | Programmatic Reuters financial news through LSEG offerings. Standard internal feed rights do not automatically allow redistribution, including derived data. | Requires a suitable news/display license; no article scraping or paywall bypass. | [LSEG news overview](https://developers.lseg.com/en/product/news/overview) |
| Bloomberg | Data License offers REST/SFTP/cloud delivery; datasets and display rights are contracted. News access is product-specific. | Licensed integration later, not a free MVP backend. | [Data License](https://professional.bloomberg.com/products/data/data-license/) |
| Yahoo Finance | Useful manual research destination. Yahoo's official help explicitly prohibits redistribution of Finance information. Unofficial libraries/endpoints do not establish permission or reliable access. | Link out only; no yfinance-based public export. | [Exchange/data-provider notice](https://help.yahoo.com/kb/SLN2310.html) |
| Investing.com | Official RSS directory exists. RSS transport does not establish permission to republish full articles or process content for every use. | Link out initially; assess specific feed terms before adding headline/excerpt syndication. | [RSS directory](https://www.investing.com/webmaster-tools/rss), [terms](https://www.investing.com/about-us/terms-and-conditions) |
| StockAnalysis | Official FAQ states no API/MCP/programmatic interface; vendor licenses allow display, not programmatic redistribution. | Link out only. | [API access FAQ](https://stockanalysis.com/help/faq/api-access/) |
| Koyfin | Official FAQ disallows API data access due to vendor restrictions. | Link out only. | [API access FAQ](https://www.koyfin.com/help/faq/can-i-get-the-data-via-api/) |
| TIKR | Official support says no API/Excel plug-in and warns against scraping. | Link out only. | [API FAQ](https://support.tikr.com/hc/en-us/articles/38745028283931-Does-TIKR-offer-an-API) |
| Macrotrends | Suitable for manual historical research. A usable official general-purpose API and appropriate public export rights were not verified in this review; its terms page was inaccessible. This does not prove no commercial arrangement exists. | Link out; request written terms/API details before integration. | [Website](https://www.macrotrends.net/) |
| Earnings Whispers | Earnings calendars/research exist, but suitable documented public API access and display rights were not verified. | Link out; issuer confirmation or a separately licensed calendar is preferred for automated events. | [Website](https://www.earningswhispers.com/) |
| Finviz | Official paid Elite API/export workflow includes multiple products. An October 2026 announcement documents a shared limit of 10 requests per 5 seconds for Elite. Export availability does not itself establish public redistribution rights. | Feasible paid integration after entitlement and display review; not scraped. | [Official API announcement](https://finviz.com/blog/our-upgraded-api-higher-limits-clearer-data-and-more-ways-to-connect/), [Elite](https://finviz.com/elite) |
| TradingView | Official widgets can be embedded with branding. Widget/charting technology is different from a market-data API; a chart library often requires your own data feed. | Optional widget later. Do not extract widget values into the assessment. | [Widget guide](https://www.tradingview.com/widget-docs/getting-started/), [charting libraries](https://www.tradingview.com/free-charting-libraries/) |

## API and primary-source alternatives

| Option | Fit | Constraint |
|---|---|---|
| Finnhub | Company news, profile, quotes, basic metrics and earnings endpoints; an optional collector adapter is implemented. | Access/endpoint entitlements depend on the plan. Its terms restrict sharing data and derived results without written approval. Personal/free access is not a public redistribution license. Export stays off until `ALLOW_PUBLIC_MARKET_DATA=true`. [API](https://finnhub.io/docs/api/company-news), [pricing](https://finnhub.io/pricing), [terms](https://finnhub.io/terms-of-service). |
| Alpha Vantage | Documented news/sentiment, company overview, quotes and calendar functions make it a possible future adapter. | Standard free service is 25 requests/day; real-time/delayed US quotes and some endpoints have additional conditions. A six-ticker, multi-endpoint app can exhaust a small quota quickly. Confirm display rights separately. Not implemented in the MVP. [Documentation](https://www.alphavantage.co/documentation/), [support](https://www.alphavantage.co/support/api-key/). |
| Issuer investor-relations releases/RSS | Primary company announcements and earnings dates, potentially useful without a commercial news aggregator. | Issuer-specific URLs, formats, feed availability and reuse terms require individual review. Not every issuer supplies a feed, and releases are not independent reporting. |
| Federal Reserve RSS | Official monetary-policy/press-release feeds for stage 2 macro context. | Preserve publication dates and official attribution; ticker/sector impact is an interpretation, not a fact inherent in the feed. [Official feeds](https://www.federalreserve.gov/feeds/feeds.htm). |
| BLS/BEA official releases | Primary inflation, employment and GDP context for a later collector. | Separate event date from publication/revision time. Do not infer a company's price response from a macro headline alone. |

## Recommended stages

1. **Now:** Static UI + offline demo + production collector/deployment workflows. Connect SEC for real filings. Add an approved company-news feed when rights are confirmed.
2. **Context:** Verified earnings events, sector/peer mappings, primary macro releases, and reviewed source-linked synthesis.
3. **On demand:** Serverless API with cached normalized responses, rate limiting, data rights, and no browser secrets. Keep the frontend on GitHub Pages.

GitHub Pages deploy documentation: [publishing source and custom Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
