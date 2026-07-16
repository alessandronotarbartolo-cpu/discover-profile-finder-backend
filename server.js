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
const { generateProfileLink } = require('./lib/profileId');
const { getDomainAge } = require('./lib/domainAge');
const { getRedditCheckLink } = require('./lib/redditLinks');
const { getCoreWebVitals } = require('./lib/pagespeed');
const { checkImageSize } = require('./lib/imageSize');
const { getAuthorInsights } = require('./lib/authorInsights');

const app = express();
app.use(cors()); // In produzione: restringi a app.use(cors({ origin: 'https://tuonegozio.myshopify.com' }))
app.use(express.json());

const TIMEOUT = 4500;
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
    // La homepage va attesa per prima perché serve per estrarre og:image
    // (necessario per il controllo dimensione immagine). Tutte le altre
    // chiamate indipendenti partono subito, in parallelo tra loro.
    const robotsPromise = fetchText(`${origin}/robots.txt`);
    const llmsPromise = fetchText(`${origin}/llms.txt`);
    const sitemapPromise = checkSitemaps(origin, 2500);
    const domainAgePromise = getDomainAge(domain);
    const coreWebVitalsPromise = getCoreWebVitals(origin);
    const authorInsightsPromise = getAuthorInsights(origin, domain);

    const homepageRes = await fetchText(origin);

    const htmlResult = homepageRes.ok
      ? scanHtml(homepageRes.data, origin)
      : {
          organization: null,
          article: null,
          og: {},
          twitter: {},
          canonical: null,
          rssHref: null,
          maxImagePreviewLarge: false,
          noImageIndex: false,
          isMobileFriendly: false,
        };

    // Parte solo ora perché dipende da htmlResult.og.image, ma corre in
    // parallelo con le altre chiamate già in volo, non dopo di esse.
    const imageSizePromise = checkImageSize(htmlResult.og?.image);

    const [robotsRes, llmsRes, sitemapResult, domainAge, coreWebVitals, imageSize, authorInsights] = await Promise.all([
      robotsPromise,
      llmsPromise,
      sitemapPromise,
      domainAgePromise,
      coreWebVitalsPromise,
      imageSizePromise,
      authorInsightsPromise,
    ]);

    const redditLinks = getRedditCheckLink(domain);

    const robotsResult = robotsRes.ok ? parseRobots(robotsRes.data) : {};
    const robotsFound = robotsRes.ok;

    const llmsResult = llmsRes.ok
      ? { exists: true, ...parseLlmsTxt(llmsRes.data) }
      : { exists: false, title: null, description: null, links: [], isValid: false };

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
      coreWebVitals,
      imageSize,
    });

    const recommendations = generateRecommendations({
      robotsResult,
      llmsResult,
      htmlResult,
      sitemapResult,
      coreWebVitals,
      authorInsights,
    });

    res.json({
      domain,
      scannedAt: new Date().toISOString(),
      robots: { found: robotsFound, bots: robotsResult },
      llms: llmsResult,
      organization: htmlResult.organization,
      article: htmlResult.article,
      openGraph: htmlResult.og,
      twitter: htmlResult.twitter,
      canonical: htmlResult.canonical,
      rssFeed: Boolean(htmlResult.rssHref),
      sitemaps: sitemapResult,
      discoverImageReadiness: {
        maxImagePreviewLarge: htmlResult.maxImagePreviewLarge,
        noImageIndex: htmlResult.noImageIndex,
        image: imageSize,
      },
      isMobileFriendly: htmlResult.isMobileFriendly,
      coreWebVitals,
      scores: {
        aiReadiness: aiReadinessScore,
        discover: discoverScore,
      },
      manualChecks: {
        knowledgeGraphUrl: `https://www.google.com/search?q=${encodeURIComponent(domain)}`,
      },
      generatedProfile: generateProfileLink(domain),
      domainAge,
      redditLinks,
      authorInsights,
      recommendations,
    });
  } catch (err) {
    res.status(500).json({ error: 'Errore durante la scansione.', detail: err.message });
  }
});

// Genera il link del profilo Google Discover per uno o più URL/domini.
// GET  /api/profile-link?url=example.com
// GET  /api/profile-link?url=example.com&url=repubblica.it   (URL multipli)
// POST /api/profile-link  { "urls": ["example.com", "repubblica.it"] }
app.get('/api/profile-link', (req, res) => {
  const raw = req.query.url;
  if (!raw) {
    return res.status(400).json({ error: 'Parametro "url" mancante.' });
  }
  const urls = Array.isArray(raw) ? raw : [raw];
  const results = urls.map((u) => generateProfileLink(u));
  res.json(urls.length === 1 ? results[0] : results);
});

app.post('/api/profile-link', (req, res) => {
  const urls = req.body?.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Corpo JSON con campo "urls" (array) mancante o vuoto.' });
  }
  const results = urls.map((u) => generateProfileLink(u));
  res.json(results);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Discover Profile Finder API in ascolto sulla porta ${PORT}`);
});
