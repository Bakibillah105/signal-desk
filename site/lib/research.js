export function normalizeTicker(input) {
  const value = String(input ?? '').trim().replace(/^\$/, '').toUpperCase().replace('-', '.');
  return /^[A-Z]{1,5}(\.[A-Z])?$/.test(value) ? value : null;
}

export function searchDirectory(directory, query, limit = 7) {
  const q = String(query).trim().toLowerCase().replace(/^\$/, '').replace('-', '.');
  if (!q) return directory.slice(0, limit);
  return directory.filter(x => x.symbol.toLowerCase().includes(q) || x.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a, q) - rank(b, q) || a.symbol.localeCompare(b.symbol)).slice(0, limit);
}
function rank(x, q) { return x.symbol.toLowerCase() === q ? 0 : x.symbol.toLowerCase().startsWith(q) ? 1 : 2; }

export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function freshness(timestamp, now = Date.now(), staleHours = 24) {
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t) || t > now + 300000) return 'unknown';
  return now - t > staleHours * 3600000 ? 'stale' : 'fresh';
}

export function dedupeNews(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.headline || !safeUrl(item.url)) return false;
    const key = item.headline.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// No trading recommendation or guessed sentiment. Only explicitly reviewed
// directional evidence can contribute to the positive/negative label.
export function assess(data, now = Date.now()) {
  const currentNews = dedupeNews(data.news ?? []).filter(n => {
    const age = now - Date.parse(n.publishedAt);
    return Number.isFinite(age) && age >= 0 && age <= 7 * 86400000;
  });
  const reviewed = currentNews.filter(n => n.signalReviewed === true);
  const positive = reviewed.filter(n => n.signal === 'positive');
  const negative = reviewed.filter(n => n.signal === 'negative');
  const sentiment = positive.length > negative.length ? 'positive' : negative.length > positive.length ? 'negative' : 'neutral';
  const filings = (data.filings ?? []).filter(f => {
    const age = now - Date.parse(f.filedAt);
    return age >= 0 && age <= 7 * 86400000;
  });
  return {
    sentiment, coverage: reviewed.length ? 'Reviewed evidence' : 'Insufficient directional evidence',
    newsCount: currentNews.length, filingCount: filings.length,
    bull: positive.slice(0, 2), bear: negative.slice(0, 2),
    catalysts: filings.filter(f => /^(8-K|6-K)/.test(f.form)).slice(0, 2),
    reviewedCount: reviewed.length,
    text: `${currentNews.length} news ${currentNews.length === 1 ? 'item' : 'items'} and ${filings.length} SEC ${filings.length === 1 ? 'filing' : 'filings'} in the past 7 calendar days. ` +
      (reviewed.length ? 'The sentiment label reflects only the reviewed items below.' : 'The available items have not been directionally reviewed, so sentiment defaults to neutral. This is not a balanced or bullish finding.')
  };
}
