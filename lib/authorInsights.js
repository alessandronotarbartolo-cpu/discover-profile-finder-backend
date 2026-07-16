const axios = require('axios');
const { extractAuthors } = require('./authorExtractor');
const { buildAuthorLinks } = require('./authorLinks');

const UA = 'DiscoverProfileFinder/1.0 (+https://calcoloassegnifamiliari.it)';
const MAX_ARTICLES_TO_SAMPLE = 6;
const MAX_CHILD_SITEMAPS = 2;
const PER_REQUEST_TIMEOUT = 1800;
const OVERALL_TIMEOUT = 7500;

async function fetchXml(url) {
  try {
    const res = await axios.get(url, {
      timeout: PER_REQUEST_TIMEOUT,
      headers: { 'User-Agent': UA },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return typeof res.data === 'string' ? res.data : null;
  } catch (e) {
    return null;
  }
}

/**
 * Estrae le URL dichiarate con "Sitemap: ..." dal robots.txt — il modo
 * standard (RFC-like, supportato da tutti i motori di ricerca) con cui un
 * sito comunica dove si trova il proprio sitemap reale, indipendentemente
 * dal path usato (molti grandi editori usano path personalizzati non
 * standard, es. /feedservice/sitemap/.../sitemap_0.xml).
 */
async function fetchRobotsSitemapHints(origin) {
  try {
    const res = await axios.get(`${origin}/robots.txt`, {
      timeout: PER_REQUEST_TIMEOUT,
      headers: { 'User-Agent': UA },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    const text = typeof res.data === 'string' ? res.data : '';
    return [...text.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1].trim());
  } catch (e) {
    return [];
  }
}

async function fetchArticleHtml(url) {
  try {
    const res = await axios.get(url, {
      timeout: PER_REQUEST_TIMEOUT,
      headers: { 'User-Agent': UA },
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  } catch (e) {
    return null;
  }
}

function isSitemapIndex(xml) {
  return Boolean(xml) && /<sitemapindex/i.test(xml);
}

function extractLocs(xml, limit) {
  if (!xml) return [];
  const matches = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  return limit ? matches.slice(0, limit) : matches;
}

/**
 * Da un XML di sitemap (che sia un urlset diretto o un sitemap-index),
 * ricava un campione di URL articolo. Se è un index, segue le prime
 * MAX_CHILD_SITEMAPS voci per trovare URL di pagine vere e proprie —
 * un solo livello di annidamento, per restare dentro il budget di tempo.
 */
async function resolveArticleUrls(xml) {
  if (!xml) return [];

  if (!isSitemapIndex(xml)) {
    return extractLocs(xml, MAX_ARTICLES_TO_SAMPLE);
  }

  const childSitemapUrls = extractLocs(xml, MAX_CHILD_SITEMAPS);
  const childXmls = await Promise.all(childSitemapUrls.map((u) => fetchXml(u)));

  const urls = [];
  for (const childXml of childXmls) {
    if (childXml && !isSitemapIndex(childXml)) {
      urls.push(...extractLocs(childXml, MAX_ARTICLES_TO_SAMPLE - urls.length));
    }
    if (urls.length >= MAX_ARTICLES_TO_SAMPLE) break;
  }
  return urls;
}

/**
 * Trova un campione di URL articolo, provando in ordine di priorità:
 * 1. Il sitemap dichiarato esplicitamente in robots.txt ("Sitemap: ...") —
 *    la fonte più affidabile, funziona anche con path non standard.
 * 2. /news-sitemap.xml (path convenzionale)
 * 3. /sitemap.xml (path convenzionale)
 * Segue anche un livello di sitemap-index per ciascuna fonte.
 *
 * Scarica ciascuna pagina campionata, estrae l'autore e aggrega i
 * risultati. Ritorna sempre un campo "diagnosis" che spiega la causa
 * quando non si trovano autori:
 *   - 'no_sitemap'          nessuna sitemap raggiungibile (né dichiarata né standard)
 *   - 'no_urls_found'       sitemap trovata ma nessun URL articolo estratto
 *   - 'no_authors_detected' articoli scaricati ma nessun autore rilevato nel markup
 *   - 'ok'                  almeno un autore trovato
 */
async function getAuthorInsights(origin, domain) {
  const work = (async () => {
    const [robotsHints, newsXml, generalXml] = await Promise.all([
      fetchRobotsSitemapHints(origin),
      fetchXml(`${origin}/news-sitemap.xml`),
      fetchXml(`${origin}/sitemap.xml`),
    ]);

    let urls = [];

    if (robotsHints.length > 0) {
      const hintXml = await fetchXml(robotsHints[0]);
      urls = await resolveArticleUrls(hintXml);
    }

    if (urls.length === 0) {
      urls = await resolveArticleUrls(newsXml);
    }
    if (urls.length === 0) {
      urls = await resolveArticleUrls(generalXml);
    }

    if (!newsXml && !generalXml && robotsHints.length === 0) {
      return { available: true, articlesScanned: 0, authors: [], diagnosis: 'no_sitemap' };
    }

    if (urls.length === 0) {
      return { available: true, articlesScanned: 0, authors: [], diagnosis: 'no_urls_found' };
    }

    urls = urls.slice(0, MAX_ARTICLES_TO_SAMPLE);
    const pages = await Promise.all(urls.map((u) => fetchArticleHtml(u)));

    const counts = new Map();
    let scanned = 0;

    for (const html of pages) {
      if (!html) continue;
      scanned += 1;
      const names = extractAuthors(html);
      for (const name of names) {
        const key = name.toLowerCase();
        if (!counts.has(key)) counts.set(key, { displayName: name, count: 0 });
        counts.get(key).count += 1;
      }
    }

    if (counts.size === 0) {
      return { available: true, articlesScanned: scanned, authors: [], diagnosis: 'no_authors_detected' };
    }

    const authors = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((a) => ({
        name: a.displayName,
        articlesFound: a.count,
        links: buildAuthorLinks(a.displayName, domain),
      }));

    return { available: true, articlesScanned: scanned, authors, diagnosis: 'ok' };
  })();

  const timeout = new Promise((resolve) =>
    setTimeout(
      () => resolve({ available: false, timedOut: true, articlesScanned: 0, authors: [], diagnosis: 'timeout' }),
      OVERALL_TIMEOUT
    )
  );

  return Promise.race([work, timeout]);
}

module.exports = { getAuthorInsights };
