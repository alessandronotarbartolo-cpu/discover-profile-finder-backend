const cheerio = require('cheerio');

/**
 * Estrae il nome dell'autore/i da una pagina articolo, provando in ordine:
 * 1. JSON-LD (Article/NewsArticle/BlogPosting -> author)
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
            const name = typeof a === 'string' ? a : a?.name;
            if (name && typeof name === 'string') names.add(name.trim());
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
  if (metaAuthor && metaAuthor.trim()) {
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
      names.add(text.replace(/^(by|di)\s+/i, '').trim());
      break;
    }
  }

  return Array.from(names).filter(Boolean);
}

module.exports = { extractAuthors };
