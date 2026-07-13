/**
 * Reddit ha disattivato la creazione self-service di app API (Responsible
 * Builder Policy, fine 2025): ora serve approvazione manuale, non più
 * ottenibile in autonomia in pochi minuti. Per questo, invece di un
 * controllo automatico via API, generiamo un link di ricerca Google
 * mirato che l'utente può aprire con un click per verificare manualmente
 * se il dominio è stato linkato/discusso su Reddit.
 *
 * Non inventiamo un conteggio di post: mostriamo solo il link di verifica.
 */
function getRedditCheckLink(domain) {
  const query = `site:reddit.com ${domain}`;
  return {
    checkUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    automated: false,
  };
}

module.exports = { getRedditCheckLink };
