const cheerio = require('cheerio');

// Parole chiave che indicano un'organizzazione/ente piuttosto che una
// persona fisica: usate come rete di sicurezza euristica quando lo schema
// non specifica esplicitamente @type, o per meta tag/byline.
const ORG_KEYWORDS = /\b(university|università|institute|istituto|observatory|osservatorio|laboratory|laboratorio|center|centre|centro|agency|agenzia|department|dipartimento|organization|organizzazione|foundation|fondazione|company|corp\.?|inc\.?|ltd\.?|s\.r\.l\.?|s\.p\.a\.?|nasa|noaa|esa|editorial staff|redazione|staff)\b/i;

function looksLikeOrganization(name) {
  return ORG_KEYWORDS.test(name);
}

/**
 * Estrae il nome dell'autore/i da una pagina articolo, provando in ordine:
 * 1. JSON-LD (Article/NewsArticle/BlogPosting -> author), scartando le
 *    voci esplicitamente marcate come Organization e quelle che
 *    sembrano nomi di enti/istituzioni piuttosto che persone.
 * 2. <meta name="author"> o <meta property="article:author">
 * 3. Selettori HTML comuni per byline (best-effort: varia molto da sito a
 *    sito, quindi questo è un tentativo euristico, non garantito).
 *
 * Ritorna un array di nomi (di solito 0 o 1, a volte più di uno per articoli
 * a più firme).
 */
function extractAuthors(html) {
  const $ = cheerio.load(html);
  const names = new Set();

  // --- 1. JSON-LD ---
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        const graph = item['@graph'] ? item['@graph'] : [item];
        for (const node of graph) {
          const type = node['@type'];
          const types = Array.isArray(type) ? type : [type];
          const isArticle = types.some(
            (t) => typeof t === 'string' && /article|blogposting|newsarticle/i.test(t)
          );
          if (!isArticle || !node.author) continue;

          const authors = Array.isArray(node.author) ? node.author : [node.author];
          for (const a of authors) {
            let name = null;

            if (typeof a === 'string') {
              name = a.trim();
            } else if (a && typeof a === 'object') {
              const authorType = a['@type'];
              const authorTypes = Array.isArray(authorType) ? authorType : [authorType];
              const isOrg = authorTypes.some(
                (t) => typeof t === 'string' && /organization/i.test(t)
              );
              if (isOrg) continue; // scartiamo esplicitamente: è un ente, non una persona
              if (a.name) name = a.name.trim();
            }

            if (name && !looksLikeOrganization(name)) {
              names.add(name);
            }
          }
        }
      }
    } catch (e) {
      // JSON-LD malformato, ignoriamo
    }
  });

  if (names.size > 0) return Array.from(names);

  // --- 2. Meta tag ---
  const metaAuthor =
    $('meta[name="author"]').attr('content') ||
    $('meta[property="article:author"]').attr('content');
  if (metaAuthor && metaAuthor.trim() && !looksLikeOrganization(metaAuthor.trim())) {
    names.add(metaAuthor.trim());
    return Array.from(names);
  }

  // --- 3. Selettori HTML comuni (best-effort) ---
  const bylineSelectors = [
    '[rel="author"]',
    'a[href*="/author/"]',
    '.byline',
    '.author-name',
    '.post-author',
    '.article-author',
  ];
  for (const selector of bylineSelectors) {
    const text = $(selector).first().text().trim();
    if (text && text.length < 80) {
      const cleaned = text.replace(/^(by|di)\s+/i, '').trim();
      if (cleaned && !looksLikeOrganization(cleaned)) {
        names.add(cleaned);
        break;
      }
    }
  }

  return Array.from(names).filter(Boolean);
}

module.exports = { extractAuthors };
