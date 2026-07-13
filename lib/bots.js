// Elenco degli user-agent dei crawler AI/Search che ci interessa rilevare in robots.txt
const TRACKED_BOTS = [
  { key: 'gptbot', label: 'GPTBot', ua: 'GPTBot' },
  { key: 'claudebot', label: 'ClaudeBot', ua: 'ClaudeBot' },
  { key: 'google-extended', label: 'Google-Extended', ua: 'Google-Extended' },
  { key: 'perplexitybot', label: 'PerplexityBot', ua: 'PerplexityBot' },
  { key: 'ccbot', label: 'CCBot', ua: 'CCBot' },
  { key: 'amazonbot', label: 'Amazonbot', ua: 'Amazonbot' },
  { key: 'applebot', label: 'Applebot', ua: 'Applebot' },
  { key: 'meta-externalagent', label: 'Meta-ExternalAgent', ua: 'meta-externalagent' },
  { key: 'bytespider', label: 'Bytespider', ua: 'Bytespider' },
  { key: 'yandexbot', label: 'YandexBot', ua: 'YandexBot' },
  { key: 'bingbot', label: 'Bingbot', ua: 'Bingbot' },
];

/**
 * Parsing minimale di un robots.txt: per ogni user-agent tracciato,
 * determina se esiste un blocco "Disallow: /" (bloccato), un blocco
 * esplicito con soli Allow (permesso), oppure nessuna menzione (unknown).
 */
function parseRobots(robotsTxt) {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.trim());
  const results = {};

  for (const bot of TRACKED_BOTS) {
    let currentlyInBlock = false;
    let sawDirective = false;
    let blocked = false;

    for (const rawLine of lines) {
      const line = rawLine.split('#')[0].trim();
      if (!line) continue;

      const uaMatch = line.match(/^User-agent:\s*(.+)$/i);
      if (uaMatch) {
        currentlyInBlock = uaMatch[1].trim().toLowerCase() === bot.ua.toLowerCase();
        continue;
      }

      if (!currentlyInBlock) continue;

      const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
      const allowMatch = line.match(/^Allow:\s*(.*)$/i);

      if (disallowMatch) {
        sawDirective = true;
        const path = disallowMatch[1].trim();
        if (path === '/' || path === '') {
          blocked = path === '/';
        }
      } else if (allowMatch) {
        sawDirective = true;
      }
    }

    results[bot.key] = {
      label: bot.label,
      status: sawDirective ? (blocked ? 'blocked' : 'allowed') : 'unknown',
    };
  }

  return results;
}

module.exports = { TRACKED_BOTS, parseRobots };
