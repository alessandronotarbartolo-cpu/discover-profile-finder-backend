/**
 * Genera i link di verifica Google per un autore, secondo le varianti utili
 * indicate: esclusione del sito stesso, verifica LinkedIn, e query rafforzata
 * con termini "journalist/giornalista/author/autore" per nomi comuni.
 */
function buildAuthorLinks(name, siteHost) {
  const q = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

  return [
    {
      label: 'External mentions',
      url: q(`"${name}" -site:${siteHost}`),
    },
    {
      label: 'LinkedIn profile',
      url: q(`"${name}" site:linkedin.com`),
    },
    {
      label: 'Journalist / author check',
      url: q(`"${name}" journalist OR giornalista OR author OR autore`),
    },
  ];
}

module.exports = { buildAuthorLinks };
