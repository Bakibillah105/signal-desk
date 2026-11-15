export function parseWatchlist(text, directory) {
  const known = new Set(directory.map(x => x.symbol));
  const tokens = [...new Set(text.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(s => s.replace(/^\$/, '').replace(/^(NASDAQ|NYSE|AMEX):/, '').replace('-', '.')))];
  return {accepted:tokens.filter(s => known.has(s)),rejected:tokens.filter(s => !known.has(s))};
}

export function filingInsight(f) {
  const form = f.form.replace('/A','');
  const base = {
    '10-K':'Annual business review: compare revenue, cash flow, debt and risk factors with the prior year. Look for a change in the business, not just a higher headline profit.',
    '10-Q':'Quarterly check-up: compare sales, margins and operating cash flow with the same quarter last year. Look for new risks or weaker cash conversion.',
    '4':'Insider ownership change: check the transaction code, size and footnotes. A grant, tax withholding or scheduled sale is different from an open-market purchase; the form alone is not a bullish or bearish signal.',
    '3':'Starting insider ownership: this establishes a holding, and does not by itself mean a recent purchase.',
    '5':'Annual ownership disclosure: check the transaction dates; the activity may not be recent.',
    'S-1':'Registration document: review the proposed offering, use of proceeds and potential dilution. Registration does not prove shares have already been issued.',
    'S-3':'Shelf registration: the company may raise capital in the future. Check the amount and any later offering supplement before concluding that dilution occurred.',
    '20-F':'Foreign issuer annual report: review performance, cash flow, currency exposure and governance risks.',
    '40-F':'Canadian issuer annual report: review the attached financial statements and management discussion.',
    '6-K':'Foreign issuer update: read the attached announcement to establish the event and its financial significance.'
  };
  const items = {'1.01':'Material agreement: assess the economic terms and obligations.', '1.03':'Bankruptcy or receivership disclosure: investigate the implications for existing shareholders.', '2.02':'Results announcement: compare earnings and guidance with expectations; inspect the attached release.', '2.03':'New financial obligation: check debt size, interest cost and repayment terms.', '3.01':'Listing-related notice: determine whether it concerns a deficiency, transfer or possible delisting.', '3.02':'Unregistered equity sale: review the share count and potential dilution.', '4.02':'Prior financial statements may no longer be reliable: read the affected periods and correction details.', '5.02':'Leadership or board update: identify the person, reason and effective date before judging impact.', '9.01':'Supporting exhibits: open these for the underlying release or financial information.'};
  let text = form === '8-K' ? (String(f.items ?? '').match(/\d\.\d{2}/g) ?? []).filter(k => items[k]).map(k => items[k]).join(' ') : base[form];
  if (!text) text = 'Company update: read the document and exhibits to establish what changed and whether it affects the business.';
  return (f.form.endsWith('/A') ? 'Amended filing: compare it with the original to see what was corrected. ' : '') + text;
}

export function narrative(data, assessment) {
  if (data.demo) return 'Illustrative conclusion: the sample news points to improving revenue and recurring demand, while higher input costs could limit how much of that growth reaches profit. That leaves a constructive but conditional picture: stronger demand would need to translate into resilient margins to support the upside case. For a 2–5 session holding period, the key question is whether a dated catalyst can change expectations during your holding window. The sample current reports deserve attention, but neither their presence nor the positive news count establishes a price move. Earnings timing, valuation context, industry conditions and the market reaction still need verification. This describes fictional examples, not the actual stock.';
  if (!assessment.newsCount) return `There is not enough current news here to form an overall view of ${data.symbol}. Available filing metadata can identify disclosures worth reading, but does not establish whether results exceeded expectations or whether business risks improved. A decision based on this page would currently rest on incomplete evidence. Check the original announcements, earnings date and price reaction before evaluating a 2–5 session position.`;
  if (!assessment.reviewedCount) return `${data.symbol} has ${assessment.newsCount} recent news items, but their business implications have not yet been reviewed. The news count alone does not establish a positive or negative outlook. Use the items below to compare changes in demand, margins, guidance and financing; distinguish reported facts from expectations. For a 2–5 session hold, prioritize developments with a clear date and plausible near-term impact. Until that review and the earnings check are complete, the overall conclusion remains uncertain.`;
  return `The reviewed evidence for ${data.symbol} is ${assessment.sentiment}, with ${assessment.bull.length} displayed upside drivers and ${assessment.bear.length} displayed downside drivers. Read the linked cases together: the upside depends on positive developments improving business expectations, while the bear case identifies what could prevent that improvement. This is a summary of reviewed coverage, not a forecast. For a short holding period, verify catalyst timing, earnings and how the market has already responded; industry and macro coverage remain incomplete.`;
}
