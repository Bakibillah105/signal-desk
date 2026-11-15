import sys, unittest, datetime as dt
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from public_news import parse_feed,related

class PublicNewsTests(unittest.TestCase):
    def test_no_cross_company_short_ticker_match(self):
        self.assertFalse(related({'headline':'A new rate cut is on the way','summary':''},{'symbol':'ON','name':'ON Semiconductor Corporation'}))
        self.assertTrue(related({'headline':'Ooma announces results','summary':''},{'symbol':'OOMA','name':'Ooma, Inc. Common Stock'}))
    def test_only_dated_direct_article_links(self):
        date=(dt.datetime.now(dt.timezone.utc)-dt.timedelta(hours=1)).strftime('%a, %d %b %Y %H:%M:%S GMT')
        raw=f'<rss><channel><item><title>Results update</title><link>https://www.nasdaq.com/articles/results</link><pubDate>{date}</pubDate><description>First sentence.</description></item><item><title>Unsafe</title><link>https://evil.example/news</link><pubDate>{date}</pubDate></item></channel></rss>'
        result=parse_feed(raw,'Nasdaq','nasdaq.com')
        self.assertEqual(len(result),1)
        self.assertFalse(result[0]['signalReviewed'])
        self.assertEqual(result[0]['url'],'https://www.nasdaq.com/articles/results')
    def test_html_failure_not_empty_success(self):
        with self.assertRaises(ValueError):parse_feed('<html/>','Nasdaq','nasdaq.com')

if __name__=='__main__': unittest.main()
