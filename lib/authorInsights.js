const axios = require('axios');
const { extractAuthors } = require('./authorExtractor');
const { buildAuthorLinks } = require('./authorLinks');

const UA = 'DiscoverProfileFinder/1.0 (+https://calcoloassegnifamiliari.it)';
const MAX_ARTICLES_TO_SAMPLE = 6; // campione limitato per restare nel budget di tempo
const PER_REQUEST_TIMEOUT = 2500;
const OVERALL_TIMEOUT = 6000; // hard deadline complessivo per l'intera funzionalità

async function fetchXml(url) {
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

function extractLocs(xml, limit) {
  if (!xml) return [];
  const matches = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  return matches.slice(0, limit);
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

/**
 * Trova un campione di URL articolo (preferendo la news sitemap, altrimenti
 * la sitemap generale), scarica ciascuna pagina, estrae l'autore e aggrega
 * i risultati: { name, articlesFound, links: [...] } per ciascun autore
 * unico trovato.
 *
 * Nota sui limiti: campiona solo le prime URL della sitemap principale
 * (non segue sitemap-index annidate per restare veloce), e il rilevamento
 * dell'autore è best-effort (JSON-LD, meta tag, o selettori HTML comuni).
 * Non è un conteggio esaustivo degli articoli del sito, ma un campione
 * utile a farsi un'idea rapida.
 */
async function getAuthorInsights(origin, domain) {
  const work = (async () => {
    const [newsXml, generalXml] = await Promise.all([
      fetchXml(`${origin}/news-sitemap.xml`),
      fetchXml(`${origin}/sitemap.xml`),
    ]);

    const urls = extractLocs(newsXml, MAX_ARTICLES_TO_SAMPLE);
    if (urls.length === 0) {
      urls.push(...extractLocs(generalXml, MAX_ARTICLES_TO_SAMPLE));
    }

    if (urls.length === 0) {
      return { available: true, articlesScanned: 0, authors: [] };
    }

    const pages = await Promise.all(urls.map((u) => fetchArticleHtml(u)));

    const counts = new Map(); // nome normalizzato -> { displayName, count }
    let scanned = 0;

    for (const html of pages) {
      if (!html) continue;
      scanned += 1;
      const names = extractAuthors(html);
      for (const name of names) {
        const key = name.toLowerCase();
        if (!counts.has(key)) {
          counts.set(key, { displayName: name, count: 0 });
        }
        counts.get(key).count += 1;
      }
    }

    const authors = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((a) => ({
        name: a.displayName,
        articlesFound: a.count,
        links: buildAuthorLinks(a.displayName, domain),
      }));

    return { available: true, articlesScanned: scanned, authors };
  })();

  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ available: false, timedOut: true, articlesScanned: 0, authors: [] }), OVERALL_TIMEOUT)
  );

  return Promise.race([work, timeout]);
}

module.exports = { getAuthorInsights };
