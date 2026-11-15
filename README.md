# Signal Desk

A static US equity research workspace for long-only decisions. Initial lens: **2–5 trading days**. Built for GitHub Pages, with no runtime dependencies, build framework, or browser API keys.

**Status:** Working MVP with explicitly fictional demo snapshots. Real SEC collection is implemented; it needs your contact identifier. Optional live news and quotes need a provider key **and an agreement permitting public display and redistribution**. Nothing in the sample workspace is actual market reporting.

## Run locally

Requires Node 22+ and Python 3.12+. No `npm install` or Python packages are needed.

```powershell
npm start
```

Open `http://127.0.0.1:4173`. Module scripts and JSON fetches require HTTP; do not double-click `index.html`.

```powershell
npm test
python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

## Architecture

1. A scheduled GitHub Action retrieves the official SEC ticker map and Nasdaq Trader listing files, retains supported US-listed common/ordinary equities and ADRs, and gathers recent SEC filing metadata.
2. If permitted, Finnhub adds company news, a profile, quote, basic metrics, and an earnings calendar. Provider entitlement failures become explicit unavailable fields.
3. The collector writes timestamped JSON for the configured research universe. The Action commits public snapshots, builds the static site, and deploys GitHub Pages.
4. The browser searches the directory and reads those same-origin JSON files. It never receives a provider key or calls SEC directly.

Every Pages build refreshes the searchable directory from both official Nasdaq Trader listing files, without an API key. A separate weekday schedule keeps this directory current. It includes supported exchange-listed common/ordinary stocks and ADRs across Nasdaq, NYSE and other US exchanges. OTC securities, funds, ETFs, preferreds, warrants and ambiguous security types are excluded. The repository retains seven offline directory fixtures and six fictional snapshots for local testing; deployed search uses the expanded directory. A searchable ticker does not imply that a research snapshot has been collected. No options, futures, shorts or orders are supported.

### Why this approach

SEC APIs do not support browser CORS. Static hosting cannot conceal API keys or fetch protected APIs on behalf of a user. Scheduled JSON is the simplest initial solution. It is suitable for a bounded research/watchlist universe, not instant, market-wide research. A later serverless proxy with a cache, approved data rights, origin checks, rate limits, and ticker validation can support arbitrary on-demand requests. A public proxy must not be treated as a way around licensing.

## Deploy to GitHub Pages

1. Create a new repository and upload the **contents** of this folder, including `.github/workflows`. Do not replace an unrelated repository. Use a public repository for free Pages hosting, or a plan/repository combination that supports private-repository Pages. Pages content may still be publicly accessible.
2. Use `main` as the default branch. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. Push or run **Check and deploy GitHub Pages**. It deploys the clearly labeled demo first, unless you have already collected real snapshots.
4. In **Settings → Secrets and variables → Actions**, add repository secret `SEC_USER_AGENT`, containing an app name and a real contact email, for example `SignalDesk your-real-email@example.com`. Replace the example with your actual contact. It is sent to SEC as its declared User-Agent; it is not exported into JSON.
5. Run **Refresh research data and deploy** manually. With just `SEC_USER_AGENT`, the site has real filings and SEC industry metadata; news, prices, and earnings remain explicitly unavailable.
6. For optional company news and market data, add secret `FINNHUB_API_KEY`. Only after confirming the necessary public display/redistribution rights, set repository **variable** `ALLOW_PUBLIC_MARKET_DATA` to `true`. Finnhub personal/free plans do not automatically grant these rights. A missing or false flag disables every vendor export, even if the key exists.

For Benzinga news, add repository secret `BENZINGA_API_KEY` and, after confirming public display rights for your plan, repository variable `ALLOW_PUBLIC_BENZINGA_DATA=true`. The adapter preserves each article URL and attribution. Benzinga does not require enabling Finnhub. Provider credentials have not been configured or live-tested in this update.

The refresh workflow is scheduled weekdays at **7:17 PM Bangladesh time** (13:17 UTC). That is 08:17 or 09:17 in New York depending on US daylight saving. This is a collection schedule, not a real-time service; Actions can run late, scheduled workflows may be disabled after inactivity, and US holidays are not specially excluded. Change or remove the cron in `.github/workflows/refresh.yml` as desired. Follow GitHub's Actions policy and available usage quota.

`GITHUB_TOKEN` commits do not trigger a second push workflow. The refresh workflow therefore deploys its own artifact explicitly. Both workflows share a deployment concurrency group. A failed directory refresh or total SEC failure stops publication and preserves the previous site. Partial ticker failures are shown as unavailable, not replaced with demo stories. If branch protection blocks automated data commits, grant a narrowly scoped allowed route or use an artifact-only refresh design; do not disable protections blindly.

All URLs in the site are relative, so project Pages paths such as `/signal-desk/` work. The static build output is `dist/`. No SPA history rewrites are required.

## Change the research universe

Edit `config.json` and run the refresh workflow. A saved browser watchlist does not change this configuration or initiate collection. The collector allows up to 100 tickers; keep it small enough for your provider quota. Current defaults use 7 calendar days of news and 30 recent supported filings per ticker. ADRs and foreign issuer forms 20-F, 40-F and 6-K are supported when a listing matches. ETFs, funds, preferred shares, warrants, rights, units, test symbols, and unclear security types are excluded.

For class shares use `BRK.B`; the SEC's `BRK-B` spelling is normalized. Check provider support for each class-share ticker; unsupported vendor symbols remain unavailable.

## What works in this stage

- Ticker/name autocomplete, keyboard navigation, class-share normalization, and directory validation.
- Larger 16px research text, responsive light/dark UI, bulk-paste watchlist with validation and deduplication, scrollable saved symbols, click-to-open research, and deep links via `#ticker=AAPL`. Watchlists remain local to this browser.
- Company news with short provider excerpts, source/date/article-specific URLs, deduplication and category filters. Fictional sample stories have no article link, instead of misleading links to company homepages.
- An overall prose assessment above the retained bull/bear/catalyst/risk items, with explicit coverage limitations. The illustrative narrative describes only fictional sample evidence.
- Recent SEC annual/quarterly/current/ownership filing metadata, official document links, form filters, and plain-English explanations of filing types and 8-K item codes. Explanations identify what to investigate; they do not claim the underlying documents were analyzed. This is a bounded recent feed, not a complete filing archive. Form 4 is an ownership disclosure, not an automatic buy/sell inference.
- A basic source-linked summary of the latest seven calendar days, with bull/bear evidence only when explicitly reviewed. Finnhub news arrives unreviewed, so live sentiment defaults to **neutral — insufficient directional evidence**. No keyword classifier or invented AI analysis is used. The positive/negative demo evidence exists only to illustrate the interface.
- Source availability, collection timestamps, stale-data labels, unknown values, and explicit demo labeling.
- A visible not-financial-advice disclaimer. No halal screening is implied.

## Assessment limits and next stage

The MVP is a source-organizing tool. It does not read full SEC document contents, establish insider transaction direction, or deliver a substantive analyst/AI thesis from live articles. Next work: approved peer/industry and macro feeds, verified issuer earnings events, full filing-content review, and reviewed bull/bear/catalyst/risk synthesis with article-level evidence. If an LLM is later added, call it from a trusted collector/proxy with schema validation and source IDs; never from the browser with a private API key.

`Refresh snapshot` reloads the most recent deployment. It does not trigger GitHub Actions. The source badge measures collection age, not news publication age. Quotes show their provider timestamp separately. A neutral label with missing coverage is not reassurance. Verify earnings directly with the issuer before applying a no-holding-through-earnings rule.

## Source feasibility

See [SOURCE_FEASIBILITY.md](SOURCE_FEASIBILITY.md) for every requested source, official references, licensing constraints, and API alternatives. Publicly readable content or an RSS endpoint does not by itself establish redistribution rights.

## Security and data handling

Keys exist only in Actions secrets/environment variables, are sent only to their provider (Finnhub header; Benzinga HTTPS query), and are never serialized into the site. Do not commit `.env`. Provider errors are sanitized. Vendor data is excluded by default. API text is rendered with HTML escaping, and external links accept only HTTP/HTTPS and use `noopener noreferrer`. Source content is not executable. Watchlists and theme preferences are local to the browser; no account, analytics, or tracking is included. Google Fonts is optional: system fonts take over if it is unavailable.

Before enabling a new dataset, confirm its display and redistribution rights for your deployment. If vendor rights end, remove the exported dataset from Pages and repository history as required by your agreement; deleting only the latest UI file may not remove historical copies.

## Tests

The automated checks cover ticker/path rejection, directory lookup ordering, unsafe links, stale/future dates, syndicated-story deduplication, evidence-gated sentiment, Form 4 interpretation, security-type filtering, SEC accession links, malformed news, nonfinite metrics, and explicit collection failures. They use offline fixtures, not API credentials. Live provider access and hosted deployment require configuration and separate verification.
