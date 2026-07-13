const axios = require('axios');

const CANDIDATE_PATHS = {
  sitemap: ['/sitemap.xml', '/sitemap_index.xml'],
  news: ['/news-sitemap.xml', '/sitemap-news.xml'],
  image: ['/image-sitemap.xml', '/sitemap-image.xml'],
  video: ['/video-sitemap.xml', '/sitemap-video.xml'],
};

async function checkExists(url, timeout) {
  try {
    const res = await axios.get(url, {
      timeout,
      validateStatus: () => true,
      headers: { 'User-Agent': 'DiscoverProfileFinder/1.0 (+https://calcoloassegnifamiliari.it)' },
      maxRedirects: 3,
    });
    return res.status >= 200 && res.status < 300;
  } catch (e) {
    return false;
  }
}

/**
 * Controlla in parallelo le varianti comuni di percorso per ogni tipo di sitemap.
 * Ritorna { sitemap: bool, news: bool, image: bool, video: bool }
 */
async function checkSitemaps(origin, timeout = 3000) {
  const entries = Object.entries(CANDIDATE_PATHS);
  const results = {};

  await Promise.all(
    entries.map(async ([key, paths]) => {
      for (const path of paths) {
        const found = await checkExists(origin + path, timeout);
        if (found) {
          results[key] = true;
          return;
        }
      }
      results[key] = false;
    })
  );

  return results;
}

module.exports = { checkSitemaps };
