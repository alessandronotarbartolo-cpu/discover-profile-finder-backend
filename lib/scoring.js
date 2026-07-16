/**
 * AI Readiness Score (0-100)
 * Quanto il sito è "leggibile" e ben strutturato per crawler AI e motori di ricerca.
 */
function computeAiReadinessScore({ robotsResult, llmsResult, htmlResult, sitemapResult }) {
  let score = 0;
  const max = 100;

  // Robots: bot AI non bloccati (30 pt totali, proporzionale)
  const aiBots = ['gptbot', 'claudebot', 'google-extended', 'perplexitybot', 'ccbot'];
  const notBlockedCount = aiBots.filter((k) => robotsResult[k]?.status !== 'blocked').length;
  score += Math.round((notBlockedCount / aiBots.length) * 30);

  // llms.txt presente e valido (20 pt)
  if (llmsResult.exists && llmsResult.isValid) score += 20;
  else if (llmsResult.exists) score += 8;

  // Structured data / Organization schema (20 pt)
  if (htmlResult.organization) {
    score += 10;
    if (htmlResult.organization.sameAs?.length) score += 5;
    if (htmlResult.organization.logo) score += 5;
  }

  // Open Graph (15 pt)
  if (htmlResult.og.title) score += 5;
  if (htmlResult.og.description) score += 5;
  if (htmlResult.og.image) score += 5;

  // Canonical (5 pt)
  if (htmlResult.canonical) score += 5;

  // News sitemap (10 pt)
  if (sitemapResult.news) score += 10;

  return Math.min(score, max);
}

/**
 * Google Discover Score (0-100) — pesi adattati dalla spec originale,
 * escludendo il Publisher Profile automatico (non verificabile in modo
 * affidabile via scraping). Il Publisher Profile può essere indicato
 * manualmente dall'utente dopo una verifica su profile.google.com.
 *
 * Pesi:
 *  Publisher Profile        15  (manuale, opzionale)
 *  Organization              8
 *  Schema (logo/sameAs)      8
 *  OpenGraph                 8
 *  Twitter                   4
 *  RSS                       5
 *  News Sitemap               8
 *  Robots                    8
 *  LLMS                     12
 *  Discover image readiness 12  (max-image-preview:large + dimensione immagine)
 *  Page experience           12  (mobile-friendly + Core Web Vitals)
 */
function computeDiscoverScore({
  robotsResult,
  llmsResult,
  htmlResult,
  sitemapResult,
  publisherProfileStatus,
  coreWebVitals,
  imageSize,
}) {
  let score = 0;

  // Publisher Profile (manuale)
  if (publisherProfileStatus === 'claimed') score += 15;
  else if (publisherProfileStatus === 'not_claimed') score += 6;
  // 'not_found' o 'unknown' => 0

  // Organization
  if (htmlResult.organization?.name) score += 8;

  // Schema quality (logo + sameAs)
  if (htmlResult.organization?.logo) score += 4;
  if (htmlResult.organization?.sameAs?.length) score += 4;

  // Open Graph
  const ogFields = [htmlResult.og.title, htmlResult.og.description, htmlResult.og.image];
  score += Math.round((ogFields.filter(Boolean).length / ogFields.length) * 8);

  // Twitter
  if (htmlResult.twitter.card) score += 4;

  // RSS
  if (htmlResult.rssHref) score += 5;

  // News sitemap
  if (sitemapResult.news) score += 8;

  // Robots: nessun bot search/AI rilevante bloccato
  const searchBots = ['bingbot', 'yandexbot'];
  const aiBots = ['gptbot', 'claudebot', 'google-extended', 'perplexitybot'];
  const relevantBots = [...searchBots, ...aiBots];
  const okCount = relevantBots.filter((k) => robotsResult[k]?.status !== 'blocked').length;
  score += Math.round((okCount / relevantBots.length) * 8);

  // LLMS
  if (llmsResult.exists && llmsResult.isValid) score += 12;
  else if (llmsResult.exists) score += 5;

  // Discover image readiness (12 pt): max-image-preview:large (6) + dimensione immagine adeguata (6)
  if (htmlResult.maxImagePreviewLarge) score += 6;
  if (imageSize?.checked) {
    if (imageSize.meetsDiscoverMinimum) score += 6;
  } else {
    score += 3; // nessun dato certo: né premiamo né penalizziamo del tutto
  }

  // Page experience (12 pt): mobile-friendly (5) + Core Web Vitals performance (7)
  if (htmlResult.isMobileFriendly) score += 5;
  if (coreWebVitals?.available && coreWebVitals.performanceScore != null) {
    score += Math.round((coreWebVitals.performanceScore / 100) * 7);
  } else {
    score += 3; // dato non disponibile: valore neutro
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Generates prioritized recommendations based on scan results.
 */
function generateRecommendations({ robotsResult, llmsResult, htmlResult, sitemapResult, coreWebVitals, authorInsights }) {
  const recs = [];

  if (!llmsResult.exists) {
    recs.push({ priority: 'high', text: 'Add an llms.txt file to make the site readable by AI assistants.' });
  }

  if (!htmlResult.organization) {
    recs.push({ priority: 'high', text: 'Add an Organization schema (JSON-LD) to the site head.' });
  } else {
    if (!htmlResult.organization.logo) {
      recs.push({ priority: 'medium', text: 'Add a "logo" field to the Organization schema.' });
    }
    if (!htmlResult.organization.sameAs?.length) {
      recs.push({ priority: 'medium', text: 'Add social profiles in the "sameAs" field of the Organization schema.' });
    }
  }

  const aiBotsBlocked = ['gptbot', 'claudebot'].filter((k) => robotsResult[k]?.status === 'blocked');
  if (aiBotsBlocked.length) {
    recs.push({
      priority: 'high',
      text: `Unblock in robots.txt: ${aiBotsBlocked.map((k) => robotsResult[k].label).join(', ')} (currently blocked).`,
    });
  }

  if (!htmlResult.og.image) {
    recs.push({ priority: 'medium', text: 'Add an Open Graph image (og:image) for a better social preview.' });
  }

  if (!sitemapResult.news) {
    recs.push({ priority: 'medium', text: 'Create a News Sitemap if you regularly publish news content.' });
  }

  if (!htmlResult.rssHref) {
    recs.push({ priority: 'low', text: 'Add an RSS feed and make it discoverable with a <link> tag in the head.' });
  }

  if (!htmlResult.canonical) {
    recs.push({ priority: 'low', text: 'Add a canonical tag on every page to avoid duplicate content.' });
  }

  const hasWikidataLink = (htmlResult.organization?.sameAs || []).some((url) =>
    /wikidata\.org/i.test(url)
  );
  if (!hasWikidataLink) {
    recs.push({
      priority: 'medium',
      text: 'Create a Wikidata entity for your brand/organization and link it in "sameAs" to increase entity trust with Google.',
    });
  }

  const order = { high: 0, medium: 1, low: 2 };

  if (!htmlResult.maxImagePreviewLarge) {
    recs.push({
      priority: 'high',
      text: 'Add <meta name="robots" content="max-image-preview:large"> — without it, Google cannot show large image previews in Discover.',
    });
  }

  if (!htmlResult.isMobileFriendly) {
    recs.push({
      priority: 'high',
      text: 'Add a responsive viewport meta tag (width=device-width) — Discover is almost entirely a mobile experience.',
    });
  }

  if (coreWebVitals && coreWebVitals.available && coreWebVitals.performanceScore != null && coreWebVitals.performanceScore < 50) {
    recs.push({
      priority: 'medium',
      text: `Improve page speed: mobile Performance score is ${coreWebVitals.performanceScore}/100. Page experience affects Discover eligibility.`,
    });
  }

  if (authorInsights) {
    if (authorInsights.diagnosis === 'no_sitemap') {
      recs.push({
        priority: 'medium',
        text: 'Add a sitemap.xml (or news sitemap) — without one, tools and search engines cannot discover your articles to verify author information.',
      });
    } else if (authorInsights.diagnosis === 'no_urls_found') {
      recs.push({
        priority: 'medium',
        text: 'Your sitemap could not be parsed for individual article URLs — check that it lists page URLs directly (or that a sitemap-index correctly links to sitemaps containing them).',
      });
    } else if (authorInsights.diagnosis === 'no_authors_detected') {
      recs.push({
        priority: 'medium',
        text: 'Add author information to your articles: a schema.org Article "author" field, a <meta name="author"> tag, or a visible byline. This strengthens E-E-A-T signals for Google.',
      });
    }
  }

  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}

module.exports = { computeAiReadinessScore, computeDiscoverScore, generateRecommendations };
