const axios = require('axios');

/**
 * Cerca submission su Reddit che linkano direttamente al dominio indicato,
 * usando l'endpoint pubblico "domain listing" di Reddit:
 * https://www.reddit.com/domain/<domain>/.json
 *
 * Nota: Reddit applica rate-limiting e a volte blocca IP di datacenter
 * (incluse le funzioni serverless su Vercel) anche su endpoint pubblici.
 * In caso di errore/blocco, la funzione restituisce found:false con
 * blocked:true, senza inventare dati.
 */
async function checkRedditLinks(domain, limit = 10) {
  try {
    const { data } = await axios.get(`https://www.reddit.com/domain/${domain}/.json`, {
      params: { limit },
      timeout: 6000,
      headers: {
        'User-Agent': 'web:discover-profile-finder:1.0 (by /u/discoverprofilefinder)',
      },
    });

    const children = data?.data?.children || [];
    const posts = children.map((c) => ({
      title: c.data.title,
      permalink: `https://www.reddit.com${c.data.permalink}`,
      subreddit: c.data.subreddit_name_prefixed,
      score: c.data.score,
      numComments: c.data.num_comments,
      createdAt: new Date(c.data.created_utc * 1000).toISOString(),
    }));

    return { found: posts.length > 0, count: posts.length, posts, blocked: false };
  } catch (err) {
    const blocked = err.response?.status === 403 || err.response?.status === 429;
    return { found: false, count: 0, posts: [], blocked, error: true };
  }
}

module.exports = { checkRedditLinks };
