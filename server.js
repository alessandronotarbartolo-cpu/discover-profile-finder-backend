const express = require('express');
const cors = require('cors');
const axios = require('axios');

const { parseRobots } = require('./lib/bots');
const { parseLlmsTxt } = require('./lib/llmsTxt');
const { scanHtml } = require('./lib/htmlScanner');
const { checkSitemaps } = require('./lib/sitemaps');
const {
  computeAiReadinessScore,
  computeDiscoverScore,
  generateRecommendations,
} = require('./lib/scoring');

const app = express();
app.use(cors()); 'https://discover-method.myshopify.com'
app.use(express.json());

const TIMEOUT = 8000;
const UA = 'DiscoverProfileFinder/1.0 (+https://calcoloassegnifamiliari.it)';

function normalizeDomain(input) {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return d;
}

async function fetchText(url) {
  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      validateStatus: () => true,
      headers: { 'User-Agent': UA },
      maxRedirects: 5,
    });
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, data: res.data };
    }
    return { ok: false, status: res.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

app.get('/api/scan', async (req, res) => {
  const rawDomain = req.query.domain;
  if (!rawDomain) {
    return res.status(400).json({ error: 'Parametro "domain" mancante.' });
  }

  const domain = normalizeDomain(rawDomain);
  const origin = `https://${domain}`;

  try {
    const [robotsRes, llmsRes, homepageRes, sitemapResult] = await Promise.all([
      fetchText(`${origin}/robots.txt`),
      fetchText(`${origin}/llms.txt`),
      fetchText(origin),
      checkSitemaps(origin, TIMEOUT),
    ]);

    const robotsResult = robotsRes.ok ? parseRobots(robotsRes.data) : {};
    const robotsFound = robotsRes.ok;

    const llmsResult = llmsRes.ok
      ? { exists: true, ...parseLlmsTxt(llmsRes.data) }
      : { exists: false, title: null, description: null, links: [], isValid: false };

    const htmlResult = homepageRes.ok
      ? scanHtml(homepageRes.data, origin)
      : { organization: null, og: {}, twitter: {}, canonical: null, rssHref: null };

    const publisherProfileStatus = (req.query.publisherProfile || 'unknown').toString();

    const aiReadinessScore = computeAiReadinessScore({
      robotsResult,
      llmsResult,
      htmlResult,
      sitemapResult,
    });

    const discoverScore = computeDiscoverScore({
      robotsResult,
      llmsResult,
      htmlResult,
      sitemapResult,
      publisherProfileStatus,
    });

    const recommendations = generateRecommendations({
      robotsResult,
      llmsResult,
      htmlResult,
      sitemapResult,
    });

    res.json({
      domain,
      scannedAt: new Date().toISOString(),
      robots: { found: robotsFound, bots: robotsResult },
      llms: llmsResult,
      organization: htmlResult.organization,
      openGraph: htmlResult.og,
      twitter: htmlResult.twitter,
      canonical: htmlResult.canonical,
      rssFeed: Boolean(htmlResult.rssHref),
      sitemaps: sitemapResult,
      scores: {
        aiReadiness: aiReadinessScore,
        discover: discoverScore,
      },
      manualChecks: {
        publisherProfileUrl: `https://www.google.com/search?q=site:profile.google.com+${encodeURIComponent(domain)}`,
        knowledgeGraphUrl: `https://www.google.com/search?q=${encodeURIComponent(domain)}`,
      },
      recommendations,
    });
  } catch (err) {
    res.status(500).json({ error: 'Errore durante la scansione.', detail: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Discover Profile Finder API in ascolto sulla porta ${PORT}`);
});
