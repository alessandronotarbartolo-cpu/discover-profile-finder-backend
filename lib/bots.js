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
 * Suddivide il robots.txt in "gruppi": ogni gruppo e' una o piu' righe
 * User-agent consecutive seguite dalle direttive (Disallow/Allow) che
 * si applicano a TUTTI gli agent elencati in quel gruppo.
 * Questo rispetta la sintassi reale del Robots Exclusion Standard,
 * dove piu' User-agent possono condividere lo stesso set di regole.
 */
function parseGroups(robotsTxt) {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.split('#')[0].trim());
  const groups = [];
  let current = null;
  let sawDirectiveInCurrent = false;

  for (const line of lines) {
    if (!line) continue;

    const uaMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (uaMatch) {
      const agent = uaMatch[1].trim().toLowerCase();
      if (!current || sawDirectiveInCurrent) {
        current = { agents: [agent], directives: [] };
        groups.push(current);
        sawDirectiveInCurrent = false;
      } else {
        current.agents.push(agent);
      }
      continue;
    }

    if (!current) continue;

    const disallowMatch = line.match(/^Disallow:\s*(.*)$/i);
    const allowMatch = line.match(/^Allow:\s*(.*)$/i);

    if (disallowMatch) {
      current.directives.push({ type: 'disallow', path: disallowMatch[1].trim() });
      sawDirectiveInCurrent = true;
    } else if (allowMatch) {
      current.directives.push({ type: 'allow', path: allowMatch[1].trim() });
      sawDirectiveInCurrent = true;
    }
  }

  return groups;
}

/**
 * Valuta un gruppo di direttive: torna 'blocked' se c'e' un Disallow su "/",
 * 'allowed' se ci sono direttive ma senza blocco totale, null se il gruppo
 * non ha direttive.
 */
function evaluateGroup(group) {
  if (!group || group.directives.length === 0) return null;
  const fullyBlocked = group.directives.some((d) => d.type === 'disallow' && d.path === '/');
  return fullyBlocked ? 'blocked' : 'allowed';
}

/**
 * Per ogni bot tracciato, determina lo stato:
 * 1. Se esiste un gruppo con il suo user-agent specifico, usa quello.
 * 2. Altrimenti, se esiste un gruppo wildcard ("*"), usa quello come fallback
 *    (indicando source: 'wildcard' cosi' il frontend puo' segnalarlo).
 * 3. Altrimenti, 'unknown' (nessuna regola trovata, ne' specifica ne' generica).
 */
function parseRobots(robotsTxt) {
  const groups = parseGroups(robotsTxt);
  const wildcardGroup = groups.find((g) => g.agents.includes('*'));
  const results = {};

  for (const bot of TRACKED_BOTS) {
    const specificGroup = groups.find((g) => g.agents.includes(bot.ua.toLowerCase()));
    const specificStatus = evaluateGroup(specificGroup);

    if (specificStatus) {
      results[bot.key] = { label: bot.label, status: specificStatus, source: 'specific' };
      continue;
    }

    const wildcardStatus = evaluateGroup(wildcardGroup);
    if (wildcardStatus) {
      results[bot.key] = { label: bot.label, status: wildcardStatus, source: 'wildcard' };
      continue;
    }

    results[bot.key] = { label: bot.label, status: 'unknown', source: 'none' };
  }

  return results;
}

module.exports = { TRACKED_BOTS, parseRobots };
