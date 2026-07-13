const cheerio = require('cheerio');

/**
 * Estrae Organization schema (JSON-LD), Open Graph, Twitter Card e canonical
 * dall'HTML di una pagina.
 */
function scanHtml(html, baseUrl) {
  const $ = cheerio.load(html);

  // --- Organization schema (JSON-LD) ---
  let organization = null;
  let article = null;
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

          if (!organization && types.some((t) => typeof t === 'string' && /organization/i.test(t))) {
            organization = {
              type: types.join(', '),
              name: node.name || null,
              legalName: node.legalName || null,
              logo: typeof node.logo === 'string' ? node.logo : node.logo?.url || null,
              url: node.url || null,
              description: node.description || null,
              sameAs: Array.isArray(node.sameAs) ? node.sameAs : node.sameAs ? [node.sameAs] : [],
            };
          }

          if (!article && types.some((t) => typeof t === 'string' && /article/i.test(t))) {
            article = {
              type: types.join(', '),
              headline: node.headline || null,
              datePublished: node.datePublished || null,
              dateModified: node.dateModified || null,
              image: typeof node.image === 'string' ? node.image : node.image?.url || (Array.isArray(node.image) ? node.image[0] : null),
            };
          }
        }
      }
    } catch (e) {
      // JSON-LD malformato: ignoriamo questo blocco e continuiamo
    }
  });

  // --- Open Graph ---
  const og = {
    title: $('meta[property="og:title"]').attr('content') || null,
    description: $('meta[property="og:description"]').attr('content') || null,
    image: $('meta[property="og:image"]').attr('content') || null,
    type: $('meta[property="og:type"]').attr('content') || null,
    siteName: $('meta[property="og:site_name"]').attr('content') || null,
  };

  // --- Twitter Card ---
  const twitter = {
    card: $('meta[name="twitter:card"]').attr('content') || null,
    title: $('meta[name="twitter:title"]').attr('content') || null,
    image: $('meta[name="twitter:image"]').attr('content') || null,
  };

  // --- Canonical ---
  const canonical = $('link[rel="canonical"]').attr('href') || null;

  // --- RSS feed (autodiscovery) ---
  const rssHref =
    $('link[type="application/rss+xml"]').attr('href') ||
    $('link[type="application/atom+xml"]').attr('href') ||
    null;

  // --- max-image-preview:large (meta robots) ---
  // Senza questo tag, Google non mostra anteprime immagine grandi in
  // Discover: è uno dei fattori tecnici più impattanti e più spesso
  // dimenticati per l'idoneità Discover.
  const robotsMetaContents = [];
  $('meta[name="robots"], meta[name="googlebot"]').each((_, el) => {
    const content = $(el).attr('content');
    if (content) robotsMetaContents.push(content.toLowerCase());
  });
  const hasMaxImagePreviewLarge = robotsMetaContents.some((c) =>
    c.includes('max-image-preview:large')
  );
  const hasNoImageIndex = robotsMetaContents.some(
    (c) => c.includes('noimageindex') || c.includes('max-image-preview:none')
  );

  // --- Viewport (mobile-friendly) ---
  const viewportContent = $('meta[name="viewport"]').attr('content') || null;
  const isMobileFriendly = Boolean(viewportContent && /width\s*=\s*device-width/i.test(viewportContent));

  return {
    organization,
    article,
    og,
    twitter,
    canonical,
    rssHref,
    maxImagePreviewLarge: hasMaxImagePreviewLarge,
    noImageIndex: hasNoImageIndex,
    isMobileFriendly,
  };
}

module.exports = { scanHtml };
