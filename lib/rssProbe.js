const axios = require('axios');

const COMMON_FEED_PATHS = ['/feed/', '/feed', '/rss.xml', '/rss/', '/atom.xml'];
const PER_PATH_TIMEOUT = 1800;

/**
 * Prova un piccolo elenco di path comuni per un feed RSS/Atom, verificando
 * che rispondano con contenuto che sembri davvero un feed (non una pagina
 * HTML generica servita per errori 404 "soft"). Usata solo come fallback
 * quando il tag <link rel="alternate"> non è dichiarato nel <head> — molti
 * siti (spesso per "pulizia" del <head>, es. WordPress con head cleanup)
 * hanno comunque un feed funzionante ma non dichiarato.
 */
async function probeRssFeed(origin) {
  const attempts = COMMON_FEED_PATHS.map(async (path) => {
    try {
      const res = await axios.get(`${origin}${path}`, {
        timeout: PER_PATH_TIMEOUT,
        validateStatus: (s) => s >= 200 && s < 300,
        headers: { 'User-Agent': 'DiscoverProfileFinder/1.0' },
      });
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      const body = typeof res.data === 'string' ? res.data.slice(0, 500) : '';
      const looksLikeFeed =
        contentType.includes('xml') ||
        contentType.includes('rss') ||
        contentType.includes('atom') ||
        /<rss[\s>]|<feed[\s>]/i.test(body);
      return looksLikeFeed ? `${origin}${path}` : null;
    } catch (e) {
      return null;
    }
  });

  const results = await Promise.all(attempts);
  return results.find(Boolean) || null;
}

module.exports = { probeRssFeed };
