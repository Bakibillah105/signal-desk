"""Refresh searchable exchange-listed common equities without API credentials."""
import json
from pathlib import Path
from collect import Fetcher, stock_rows, now_iso, write_json

def main():
    root = Path(__file__).resolve().parents[1] / 'site' / 'data'
    fetcher = Fetcher('SignalDesk/0.2')
    old = {r['symbol']:r for r in json.loads((root/'directory.json').read_text(encoding='utf-8'))}
    rows = {}
    for name, is_nasdaq in [('nasdaqlisted', True), ('otherlisted', False)]:
        raw = fetcher.request(f'https://www.nasdaqtrader.com/dynamic/SymDir/{name}.txt', as_json=False)
        for row in stock_rows(raw, is_nasdaq):
            row['cik'] = old.get(row['symbol'], {}).get('cik')
            rows[row['symbol']] = row
    if len(rows) < 2000:
        raise RuntimeError('Directory unexpectedly small; refusing incomplete update')
    write_json(root/'directory.json', sorted(rows.values(), key=lambda r:r['symbol']))
    write_json(root/'directory-status.json', {'asOf':now_iso(), 'count':len(rows), 'source':'Nasdaq Trader symbol directories', 'scope':'Exchange-listed common/ordinary shares and ADRs; excludes ETFs, preferreds, warrants, funds and OTC securities.'})
    print(f'Refreshed {len(rows)} exchange-listed stock tickers')

if __name__ == '__main__':
    main()
