import datetime as dt
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts' / 'collect.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CollectorTests(unittest.TestCase):
    def test_equity_universe_excludes_funds_warrants_and_tests(self):
        text = 'Symbol|Security Name|Test Issue|ETF\nAAPL|Apple Inc. - Common Stock|N|N\nQQQ|Nasdaq ETF|N|Y\nTEST|Test - Common Stock|Y|N\nACMEW|Acme - Warrants|N|N\nFUND|Example Fund - Common Shares|N|N\nBABA|Alibaba - American Depositary Shares|N|N\n'
        self.assertEqual([r['symbol'] for r in c.stock_rows(text, True)], ['AAPL', 'BABA'])

    def test_directory_requires_exchange_and_sec_match(self):
        sec = {'fields': ['cik', 'name', 'ticker', 'exchange'], 'data': [[320193, 'Apple Inc.', 'AAPL', 'Nasdaq'], [1067983, 'Berkshire', 'BRK-B', 'NYSE']]}
        nasdaq = 'Symbol|Security Name|Test Issue|ETF\nAAPL|Apple - Common Stock|N|N\nFAKE|Not SEC-listed - Common Stock|N|N\n'
        other = 'ACT Symbol|Security Name|Exchange|Test Issue|ETF\nBRK.B|Berkshire - Common Stock|N|N|N\n'
        rows = c.make_directory(sec, nasdaq, other)
        self.assertEqual([r['symbol'] for r in rows], ['AAPL', 'BRK.B'])
        self.assertEqual(rows[0]['cik'], '0000320193')

    def test_filing_links_and_amendments(self):
        payload = {'cik': '0000320193', 'filings': {'recent': {'form': ['10-Q/A', '4', 'UPLOAD'], 'accessionNumber': ['0000320193-26-000001', '0000320193-26-000002', 'bad'], 'primaryDocument': ['report.htm', '', ''], 'filingDate': ['2026-11-12', '2026-11-13', '2026-11-14']}}}
        rows = c.normalize_filings(payload)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['form'], '4')
        self.assertTrue(rows[0]['url'].endswith('0000320193-26-000002-index.html'))
        self.assertIn('/320193/000032019326000001/report.htm', rows[1]['url'])

    def test_news_filters_future_dates_duplicates_and_unsafe_urls(self):
        end = dt.datetime(2026, 11, 13, 22, tzinfo=dt.timezone.utc)
        base = {'headline': 'Example earnings update', 'summary': '<b>First sentence.</b> Second sentence. Third sentence.', 'source': 'Issuer', 'datetime': end.timestamp()-60, 'url': 'https://example.com/a'}
        rows = c.normalize_news([base, dict(base, url='https://example.com/b'), dict(base, headline='Future', datetime=end.timestamp()+3600), dict(base, headline='Unsafe', url='javascript:bad')], end-dt.timedelta(days=7), end)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['summary'], 'First sentence. Second sentence.')
        self.assertFalse(rows[0]['signalReviewed'])

    def test_zero_missing_and_nonfinite_metrics_are_not_confused(self):
        self.assertEqual(c.finite_number(0), 0)
        self.assertIsNone(c.finite_number(0, positive=True))
        for value in (None, 'NaN', 'Infinity', False):
            self.assertIsNone(c.finite_number(value))

    def test_partial_failure_stays_explicit_and_does_not_leak_errors(self):
        class Failing:
            def request(self, *args, **kwargs):
                raise RuntimeError('sensitive provider internals')
        row = {'symbol': 'AAPL', 'name': 'Apple', 'cik': '0000320193', 'exchange': 'Nasdaq'}
        data = c.collect_ticker(row, Failing(), {'maxFilings': 30})
        self.assertEqual(data['sources']['sec']['state'], 'error')
        self.assertEqual(data['sources']['news']['state'], 'missing')
        self.assertFalse(data['demo'])
        self.assertNotIn('sensitive', str(data))
        self.assertEqual(data['news'], [])


if __name__ == '__main__':
    unittest.main()
