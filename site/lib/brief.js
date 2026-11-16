// Deterministic topic extraction. These are conditional research cases, not
// inferred facts, investment recommendations, or a model's article analysis.
const topics = [
  ['earnings', /\b(earnings|eps|quarterly|guidance|results|revenue|margin)\b/i,
    'Earnings and expectations',
    'The upside case would strengthen if reported growth and forward guidance exceed expectations and are supported by cash generation.',
    'Even strong reported growth can disappoint if expectations are higher; weaker guidance or margins can outweigh a headline beat.',
    'Verify the earnings date, issuer release, prior guidance and consensus before interpreting a surprise.'],
  ['demand', /\b(launch|launches|product|contract|orders|partnership|customer|demand|expands)\b/i,
    'Products and demand',
    'A product launch, contract or demand development could support the business if it leads to material, profitable revenue.',
    'Announcements may take time to generate sales; pricing, execution costs and competitive responses could limit the benefit.',
    'Look for disclosed contract value, delivery dates, adoption and margin impact.'],
  ['funding', /\b(debt|offering|financing|dilution|capital raise|bankruptcy|liquidity)\b/i,
    'Funding and balance sheet',
    'New funding could improve flexibility if the terms and use of proceeds create more value than their cost.',
    'Dilution, higher interest costs or limited cash runway could reduce the value attributable to existing shareholders.',
    'Check cash runway, debt maturities, offering size and the actual financing terms.'],
  ['regulation', /\b(regulat\w*|tariff\w*|export|lawsuit|antitrust|investigation|restricted)\b/i,
    'Regulation and legal exposure',
    'The upside would depend on a favorable resolution or evidence that the business can adapt without material damage.',
    'Restrictions, litigation or tariffs could affect market access, costs or demand; the size and timing need confirmation.',
    'Check the official decision, affected products and jurisdictions, and effective dates.'],
  ['leadership', /\b(ceo|cfo|resign\w*|leadership|board|management)\b/i,
    'Leadership and execution',
    'A credible transition and continuity in strategy could support confidence in execution.',
    'Leadership disruption or unclear succession could introduce execution uncertainty.',
    'Read the company announcement and any related 8-K for the reason, successor and effective date.'],
  ['analysts', /\b(analyst|upgrade\w*|downgrade\w*|price target|overweight|underweight)\b/i,
    'Analyst expectations',
    'Improving analyst expectations may support sentiment if backed by stronger business assumptions.',
    'Ratings and targets are opinions, can lag events, and may already be reflected in the share price.',
    'Identify what changed in the analyst assumptions rather than relying on the rating alone.']
];

export function evidenceBrief(data, now=Date.now()) {
  const seen=new Set();
  const news=(data.news ?? []).filter(n=>{
    const age=now-Date.parse(n.publishedAt); const key=String(n.headline).toLowerCase().replace(/\W/g,'');
    if(!n.headline || !/^https?:\/\//.test(n.url ?? '') || !Number.isFinite(age) || age<0 || age>14*86400000 || seen.has(key))return false;
    seen.add(key);return true;
  });
  const themes=topics.map(([key,pattern,label,bull,bear,check])=>({key,label,bull,bear,check,items:news.filter(n=>pattern.test(n.headline+' '+(n.summary ?? ''))).slice(0,3)})).filter(t=>t.items.length);
  const sources=[...new Set(news.map(n=>n.source).filter(Boolean))];
  const failures=(data.feedStatuses ?? []).filter(s=>s.state==='error');
  let description;
  if(!news.length) description=`No dated, attributable headlines were collected for ${data.symbol} in the past 14 days. ${failures.length ? 'Some source requests failed, so this is a collection gap rather than a finding that nothing happened.' : 'The available feeds cover only a subset of market news; absence from those feeds does not establish that nothing happened.'} There is not enough collected evidence to describe the current business condition. The separate TradingView feed may provide additional stories to read.`;
  else description=`The collected coverage for ${data.symbol} contains ${news.length} distinct ${news.length===1?'story':'stories'} from ${sources.length} ${sources.length===1?'source':'sources'} in the past 14 days. ${themes.length ? 'The recurring research topics are '+themes.map(t=>t.label.toLowerCase()).join(', ')+'. '+themes[0].check : 'No supported topic rule matched these headlines. Read the linked reports to establish what changed.'} For a 2–5 trading-session hold, the decision depends on whether a dated development changes expectations during that window and how much is already reflected in price. ${sources.length===1?'This is single-source coverage, so independent corroboration is missing. ':''}The excerpts do not establish valuation, price reaction or earnings timing; the cases below describe conditions to verify, not confirmed outcomes.`;
  return {news,themes,sources,description,failures,asOf:news.map(n=>n.publishedAt).sort().at(-1),label:news.length?'Evidence brief':'Coverage gap'};
}
