/**
 * Parsing di un file llms.txt (formato markdown convenzionale:
 * https://llmstxt.org/). Estrae titolo, descrizione e link.
 */
function parseLlmsTxt(content) {
  const lines = content.split(/\r?\n/);
  let title = null;
  let description = null;
  const links = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!title && trimmed.startsWith('# ')) {
      title = trimmed.replace(/^#\s*/, '').trim();
      continue;
    }

    if (!description && trimmed.startsWith('> ')) {
      description = trimmed.replace(/^>\s*/, '').trim();
      continue;
    }

    const linkMatch = trimmed.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)(:\s*(.*))?$/);
    if (linkMatch) {
      links.push({
        label: linkMatch[1].trim(),
        url: linkMatch[2].trim(),
        note: linkMatch[4] ? linkMatch[4].trim() : null,
      });
    }
  }

  const isValid = Boolean(title) && links.length >= 0;

  return { title, description, links, isValid };
}

module.exports = { parseLlmsTxt };
